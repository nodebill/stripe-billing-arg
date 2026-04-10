import { and, asc, desc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  BillingCycleError,
  closeSubscriptionCycle as closeSubscriptionCycleInBilling,
} from "@/modules/billing/service";
import { getInvoice } from "@/modules/invoices/service";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  customers,
  invoiceLineItems,
  invoices,
  paymentMethods,
  prices,
  subscriptionItems,
  subscriptions,
} from "@/infrastructure/database/schema";
import { multiplyDecimalByFractionAndRound } from "@/modules/shared/fixed-decimal";
import {
  addRecurringInterval,
  fromUtcDateString,
  resolveBillingCycleAnchorConfig,
  toUtcDateExclusiveEnd,
  toUnix,
} from "@/modules/shared/time";
import type {
  BulkCloseSubscriptionCyclesInput,
  BulkCloseSubscriptionCyclesResult,
  BulkCloseSubscriptionCyclesResultItem,
  CloseSubscriptionCycleResult,
  CreateSubscriptionInput,
  ListSubscriptionsParams,
  StripeSubscriptionList,
  Subscription,
  SubscriptionCollectionMethod,
  SubscriptionItem,
  SubscriptionRenewalMode,
  UpdateSubscriptionInput,
} from "./types";

type SubscriptionRow = typeof subscriptions.$inferSelect;
type SubscriptionItemRow = typeof subscriptionItems.$inferSelect;
type DbLike = Pick<ReturnType<typeof getDb>, "insert" | "select" | "update">;
type InitialSubscriptionPeriod = {
  billingAnchorStart: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  renewalMode: SubscriptionRenewalMode;
  initialProrationPeriod: {
    start: Date;
    end: Date;
    basisStart: Date;
  } | null;
};

export class SubscriptionError extends Error {
  code:
    | "not_found"
    | "customer_not_found"
    | "invalid_billing_cycle"
    | "payment_method_not_found"
    | "payment_method_not_attached"
    | "payment_method_customer_mismatch"
    | "default_payment_method_required"
    | "invalid_items"
    | "invalid_proration_behavior"
    | "invalid_price"
    | "metered_subscription_conflict"
    | "not_due"
    | "already_canceled";

  constructor(code: SubscriptionError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function toSubscriptionItem(row: SubscriptionItemRow): SubscriptionItem {
  return {
    id: row.id,
    object: "subscription_item",
    price: row.priceId,
  };
}

async function listSubscriptionItems(
  subscriptionId: string
): Promise<SubscriptionItemRow[]> {
  const db = getDb();
  return db
    .select()
    .from(subscriptionItems)
    .where(eq(subscriptionItems.subscriptionId, subscriptionId))
    .orderBy(desc(subscriptionItems.createdAt), desc(subscriptionItems.id));
}

function toSubscriptionFromRows(
  row: SubscriptionRow,
  itemRows: SubscriptionItemRow[]
): Subscription {
  return {
    id: row.id,
    object: "subscription",
    customer: row.customerId,
    status: row.status,
    renewal_mode: row.renewalMode,
    collection_method: row.collectionMethod,
    default_payment_method: row.defaultPaymentMethodId,
    items: itemRows.map(toSubscriptionItem),
    cancel_at_period_end: row.cancelAtPeriodEnd,
    canceled_at: toUnix(row.canceledAt),
    ended_at: toUnix(row.endedAt),
    billing_anchor_start: Math.floor(row.billingAnchorStart.getTime() / 1000),
    current_period_start: Math.floor(row.currentPeriodStart.getTime() / 1000),
    current_period_end: Math.floor(row.currentPeriodEnd.getTime() / 1000),
    livemode: row.livemode,
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

async function toSubscription(
  row: SubscriptionRow
): Promise<Subscription> {
  const itemRows = await listSubscriptionItems(row.id);
  return toSubscriptionFromRows(row, itemRows);
}

async function getSubscriptionRow(
  subscriptionId: string
): Promise<SubscriptionRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);

  return rows[0] ?? null;
}

async function hasActiveMeteredSubscription(
  tx: Pick<ReturnType<typeof getDb>, "select">,
  customerId: string,
  meterId: string
) {
  const subscriptionRows = await tx
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .innerJoin(
      subscriptionItems,
      eq(subscriptionItems.subscriptionId, subscriptions.id)
    )
    .innerJoin(
      prices,
      eq(prices.id, subscriptionItems.priceId)
    )
    .where(
      and(
        eq(subscriptions.customerId, customerId),
        inArray(subscriptions.status, ["active", "past_due"]),
        eq(prices.meter, meterId)
      )
    )
    .limit(1);

  return subscriptionRows.length > 0;
}

function requireDefaultPaymentMethod(
  collectionMethod: SubscriptionCollectionMethod,
  defaultPaymentMethodId?: string
) {
  if (
    collectionMethod === "charge_automatically" &&
    !defaultPaymentMethodId
  ) {
    throw new SubscriptionError(
      "default_payment_method_required",
      "A default payment method is required when collection_method is charge_automatically"
    );
  }
}

function resolveInitialSubscriptionPeriod(
  now: Date,
  interval: "month" | "year",
  input: CreateSubscriptionInput
): InitialSubscriptionPeriod {
  if (input.backdate_start_date) {
    const start = new Date(input.backdate_start_date * 1000);

    if ((input.backdate_behavior ?? "advance_to_current_period") === "preserve_exact_cycle") {
      return {
        billingAnchorStart: start,
        currentPeriodStart: start,
        currentPeriodEnd: addRecurringInterval(start, interval),
        renewalMode: "manual_until_current",
        initialProrationPeriod: null,
      };
    }

    let currentPeriodStart = start;
    let currentPeriodEnd = addRecurringInterval(currentPeriodStart, interval);

    while (currentPeriodEnd.getTime() <= now.getTime()) {
      currentPeriodStart = currentPeriodEnd;
      currentPeriodEnd = addRecurringInterval(currentPeriodStart, interval);
    }

    return {
      billingAnchorStart: start,
      currentPeriodStart,
      currentPeriodEnd,
      renewalMode: "automatic",
      initialProrationPeriod: {
        start,
        end: now,
        basisStart: start,
      },
    };
  }

  if (input.billing_cycle_anchor || input.billing_cycle_anchor_config) {
    const currentPeriodEnd = input.billing_cycle_anchor
      ? new Date(input.billing_cycle_anchor * 1000)
      : resolveBillingCycleAnchorConfig(now, interval, input.billing_cycle_anchor_config!);

    return {
      billingAnchorStart: now,
      currentPeriodStart: now,
      currentPeriodEnd,
      renewalMode: "automatic",
      initialProrationPeriod: {
        start: now,
        end: currentPeriodEnd,
        basisStart: now,
      },
    };
  }

  return {
    billingAnchorStart: now,
    currentPeriodStart: now,
    currentPeriodEnd: addRecurringInterval(now, interval),
    renewalMode: "automatic",
    initialProrationPeriod: null,
  };
}

function calculateProrationAmount(
  priceUnitAmountDecimal: string,
  interval: "month" | "year",
  prorationPeriod: {
    start: Date;
    end: Date;
    basisStart: Date;
  }
) {
  if (prorationPeriod.end.getTime() <= prorationPeriod.start.getTime()) {
    return 0;
  }

  let amount = 0;
  let cursor = prorationPeriod.basisStart;

  while (cursor.getTime() < prorationPeriod.end.getTime()) {
    const intervalEnd = addRecurringInterval(cursor, interval);
    const segmentStart = new Date(
      Math.max(cursor.getTime(), prorationPeriod.start.getTime())
    );
    const segmentEnd = new Date(
      Math.min(intervalEnd.getTime(), prorationPeriod.end.getTime())
    );

    if (segmentEnd.getTime() > segmentStart.getTime()) {
      amount += multiplyDecimalByFractionAndRound(
        priceUnitAmountDecimal,
        BigInt(segmentEnd.getTime() - segmentStart.getTime()),
        BigInt(intervalEnd.getTime() - cursor.getTime())
      );
    }

    cursor = intervalEnd;
  }

  return amount;
}

async function createImmediateProrationInvoice(
  tx: DbLike,
  params: {
    customerId: string;
    subscriptionId: string;
    priceId: string;
    currency: string;
    collectionMethod: SubscriptionCollectionMethod;
    prorationAmount: number;
    periodStart: Date;
    periodEnd: Date;
    now: Date;
  }
) {
  const invoiceId = `in_${nanoid()}`;
  const lineItemId = `il_${nanoid()}`;

  await tx.insert(invoices).values({
    id: invoiceId,
    customerId: params.customerId,
    subscriptionId: params.subscriptionId,
    status: "draft",
    paymentStatus: "pending",
    collectionMethod: params.collectionMethod,
    currency: params.currency,
    subtotal: params.prorationAmount,
    amountDue: params.prorationAmount,
    amountPaid: 0,
    dueDate: null,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    autoAdvance: true,
    finalizedAt: params.now,
    invoicedAt: null,
    paidAt: null,
    legalDocument: null,
    createdAt: params.now,
    updatedAt: params.now,
  });

  await tx.insert(invoiceLineItems).values({
    id: lineItemId,
    invoiceId,
    priceId: params.priceId,
    billingReason: "licensed_recurring",
    quantity: 1,
    amount: params.prorationAmount,
    currency: params.currency,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    createdAt: params.now,
    updatedAt: params.now,
  });
}

export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<Subscription> {
  await ensureTables();
  const db = getDb();

  if (input.items.length !== 1) {
    throw new SubscriptionError(
      "invalid_items",
      "Exactly one subscription item is required in this version"
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (input.billing_cycle_anchor && input.billing_cycle_anchor_config) {
    throw new SubscriptionError(
      "invalid_billing_cycle",
      "billing_cycle_anchor and billing_cycle_anchor_config are mutually exclusive"
    );
  }

  if (
    input.backdate_start_date &&
    (input.billing_cycle_anchor || input.billing_cycle_anchor_config)
  ) {
    throw new SubscriptionError(
      "invalid_billing_cycle",
      "backdate_start_date cannot be combined with billing_cycle_anchor or billing_cycle_anchor_config in this version"
    );
  }

  if (input.billing_cycle_anchor && input.billing_cycle_anchor <= nowSeconds) {
    throw new SubscriptionError(
      "invalid_billing_cycle",
      "billing_cycle_anchor must be a future timestamp"
    );
  }

  if (input.backdate_start_date && input.backdate_start_date >= nowSeconds) {
    throw new SubscriptionError(
      "invalid_billing_cycle",
      "backdate_start_date must be a past timestamp"
    );
  }

  if (
    input.backdate_behavior === "preserve_exact_cycle" &&
    !input.backdate_start_date
  ) {
    throw new SubscriptionError(
      "invalid_billing_cycle",
      "backdate_start_date is required when backdate_behavior is preserve_exact_cycle"
    );
  }

  const collectionMethod = input.collection_method ?? "charge_automatically";
  const prorationBehavior = input.proration_behavior ?? "create_prorations";
  requireDefaultPaymentMethod(collectionMethod, input.default_payment_method);

  return db.transaction(async (tx) => {
    const customerRows = await tx
      .select({ id: customers.id, email: customers.email })
      .from(customers)
      .where(eq(customers.id, input.customer))
      .limit(1);

    if (customerRows.length === 0) {
      throw new SubscriptionError(
        "customer_not_found",
        `No such customer: '${input.customer}'`
      );
    }

    if (collectionMethod === "charge_automatically") {
      const paymentMethodRows = await tx
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.id, input.default_payment_method!))
        .limit(1);

      const paymentMethod = paymentMethodRows[0];
      if (!paymentMethod) {
        throw new SubscriptionError(
          "payment_method_not_found",
          `No such payment_method: '${input.default_payment_method}'`
        );
      }

      if (!paymentMethod.customerId || paymentMethod.detachedAt) {
        throw new SubscriptionError(
          "payment_method_not_attached",
          "The default payment method must be attached to a customer"
        );
      }

      if (paymentMethod.customerId !== input.customer) {
        throw new SubscriptionError(
          "payment_method_customer_mismatch",
          "The default payment method must belong to the same customer"
        );
      }
    }

    const priceId = input.items[0]?.price;
    const priceRows = await tx
      .select()
      .from(prices)
      .where(eq(prices.id, priceId))
      .limit(1);

    const price = priceRows[0];
    if (
      !price ||
      !price.active ||
      price.type !== "recurring" ||
      !price.recurringInterval
    ) {
      throw new SubscriptionError(
        "invalid_price",
        "The subscription price must be an active recurring price"
      );
    }

    if (
      input.billing_cycle_anchor_config?.month &&
      price.recurringInterval === "month"
    ) {
      throw new SubscriptionError(
        "invalid_billing_cycle",
        "billing_cycle_anchor_config.month is only supported for yearly prices"
      );
    }

    if (price.meter) {
      const hasExistingMeteredSubscription = await hasActiveMeteredSubscription(
        tx,
        input.customer,
        price.meter
      );

      if (hasExistingMeteredSubscription) {
        throw new SubscriptionError(
          "metered_subscription_conflict",
          "A customer can have at most one active or past_due subscription for a given meter"
        );
      }
    }

    const now = new Date();
    const initialPeriod = resolveInitialSubscriptionPeriod(
      now,
      price.recurringInterval,
      input
    );

    if (
      price.meter &&
      prorationBehavior === "create_prorations" &&
      initialPeriod.initialProrationPeriod
    ) {
      throw new SubscriptionError(
        "invalid_proration_behavior",
        "proration_behavior=create_prorations is not supported for metered prices"
      );
    }

    if (
      initialPeriod.currentPeriodEnd.getTime() <=
      initialPeriod.currentPeriodStart.getTime()
    ) {
      throw new SubscriptionError(
        "invalid_billing_cycle",
        "The resolved billing cycle must end after it starts"
      );
    }

    const subscriptionId = `sub_${nanoid()}`;
    const subscriptionItemId = `si_${nanoid()}`;

    const [subscriptionRow] = await tx
      .insert(subscriptions)
      .values({
        id: subscriptionId,
        customerId: input.customer,
        status: "active",
        collectionMethod,
        defaultPaymentMethodId:
          collectionMethod === "charge_automatically"
            ? input.default_payment_method!
            : null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
        livemode: false,
        renewalMode: initialPeriod.renewalMode,
        billingAnchorStart: initialPeriod.billingAnchorStart,
        currentPeriodStart: initialPeriod.currentPeriodStart,
        currentPeriodEnd: initialPeriod.currentPeriodEnd,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const [subscriptionItemRow] = await tx.insert(subscriptionItems).values({
      id: subscriptionItemId,
      subscriptionId,
      priceId: price.id,
      createdAt: now,
      updatedAt: now,
    }).returning();

    if (
      prorationBehavior === "create_prorations" &&
      initialPeriod.initialProrationPeriod
    ) {
      const prorationAmount = calculateProrationAmount(
        price.unitAmountDecimal,
        price.recurringInterval,
        initialPeriod.initialProrationPeriod
      );

      await createImmediateProrationInvoice(tx, {
        customerId: input.customer,
        subscriptionId,
        priceId: price.id,
        currency: price.currency,
        collectionMethod,
        prorationAmount,
        periodStart: initialPeriod.initialProrationPeriod.start,
        periodEnd: initialPeriod.initialProrationPeriod.end,
        now,
      });
    }

    return toSubscriptionFromRows(subscriptionRow, [subscriptionItemRow]);
  });
}

export async function getSubscription(
  subscriptionId: string
): Promise<Subscription | null> {
  await ensureTables();
  const row = await getSubscriptionRow(subscriptionId);
  return row ? toSubscription(row) : null;
}

export async function updateSubscription(
  subscriptionId: string,
  input: UpdateSubscriptionInput
): Promise<Subscription> {
  await ensureTables();
  const db = getDb();

  const row = await getSubscriptionRow(subscriptionId);
  if (!row) {
    throw new SubscriptionError(
      "not_found",
      `No such subscription: '${subscriptionId}'`
    );
  }

  if (row.status === "canceled") {
    throw new SubscriptionError(
      "already_canceled",
      "This subscription has already been canceled"
    );
  }

  const [updated] = await db
    .update(subscriptions)
    .set({
      cancelAtPeriodEnd: input.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId))
    .returning();

  return toSubscription(updated);
}

export async function cancelSubscription(
  subscriptionId: string
): Promise<Subscription> {
  await ensureTables();
  const db = getDb();

  const row = await getSubscriptionRow(subscriptionId);
  if (!row) {
    throw new SubscriptionError(
      "not_found",
      `No such subscription: '${subscriptionId}'`
    );
  }

  if (row.status === "canceled") {
    throw new SubscriptionError(
      "already_canceled",
      "This subscription has already been canceled"
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(subscriptions)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: false,
      canceledAt: now,
      endedAt: now,
      updatedAt: now,
    })
    .where(eq(subscriptions.id, subscriptionId))
    .returning();

  return toSubscription(updated);
}

export async function listSubscriptions(
  params: ListSubscriptionsParams
): Promise<StripeSubscriptionList> {
  await ensureTables();
  const db = getDb();

  const limit = params.limit ?? 10;
  const conditions = [];

  if (params.customer) {
    conditions.push(eq(subscriptions.customerId, params.customer));
  }

  if (params.subscription) {
    conditions.push(eq(subscriptions.id, params.subscription));
  }

  if (params.status) {
    conditions.push(eq(subscriptions.status, params.status));
  }

  if (params.date_from) {
    conditions.push(gte(subscriptions.currentPeriodEnd, fromUtcDateString(params.date_from)));
  }

  if (params.date_to) {
    conditions.push(lt(subscriptions.currentPeriodEnd, toUtcDateExclusiveEnd(params.date_to)));
  }

  if (params.starting_after) {
    const cursor = await db
      .select({ createdAt: subscriptions.createdAt })
      .from(subscriptions)
      .where(eq(subscriptions.id, params.starting_after))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(lt(subscriptions.createdAt, cursor[0].createdAt));
    }
  }

  if (params.ending_before) {
    const cursor = await db
      .select({ createdAt: subscriptions.createdAt })
      .from(subscriptions)
      .where(eq(subscriptions.id, params.ending_before))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(gt(subscriptions.createdAt, cursor[0].createdAt));
    }
  }

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(subscriptions)
          .where(and(...conditions))
          .orderBy(
            desc(subscriptions.createdAt),
            desc(subscriptions.currentPeriodEnd),
            desc(subscriptions.id)
          )
          .limit(limit + 1)
      : await db
          .select()
          .from(subscriptions)
          .orderBy(
            desc(subscriptions.createdAt),
            desc(subscriptions.currentPeriodEnd),
            desc(subscriptions.id)
          )
          .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = await Promise.all(
    rows.slice(0, limit).map((row) => toSubscription(row))
  );

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: "/api/subscriptions",
  };
}

export async function listNonCanceledCustomerSubscriptionIds(
  customerId: string
) {
  await ensureTables();
  const db = getDb();

  return db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, customerId),
        inArray(subscriptions.status, ["active", "past_due"])
      )
    );
}

export async function closeSubscriptionCycle(
  subscriptionId: string
): Promise<CloseSubscriptionCycleResult> {
  const { invoiceId } = await closeSubscriptionCycleInBilling(subscriptionId);
  const [subscription, invoice] = await Promise.all([
    getSubscription(subscriptionId),
    getInvoice(invoiceId),
  ]);

  if (!subscription) {
    throw new SubscriptionError(
      "not_found",
      `No such subscription: '${subscriptionId}'`
    );
  }

  if (!invoice) {
    throw new Error(`No such invoice: '${invoiceId}'`);
  }

  return {
    subscription,
    invoice,
  };
}

export async function bulkCloseSubscriptionCycles(
  input: BulkCloseSubscriptionCyclesInput
): Promise<BulkCloseSubscriptionCyclesResult> {
  await ensureTables();
  const db = getDb();
  const conditions = [eq(subscriptions.status, "active")];

  if (input.customer) {
    conditions.push(eq(subscriptions.customerId, input.customer));
  }

  if (input.subscription) {
    conditions.push(eq(subscriptions.id, input.subscription));
  }

  if (input.date_from) {
    conditions.push(gte(subscriptions.currentPeriodEnd, fromUtcDateString(input.date_from)));
  }

  if (input.date_to) {
    conditions.push(lt(subscriptions.currentPeriodEnd, toUtcDateExclusiveEnd(input.date_to)));
  }

  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(...conditions))
    .orderBy(
      asc(subscriptions.currentPeriodEnd),
      asc(subscriptions.createdAt),
      asc(subscriptions.id)
    );

  const results: BulkCloseSubscriptionCyclesResultItem[] = [];
  let processedSubscriptions = 0;
  let skippedSubscriptions = 0;
  let failedSubscriptions = 0;

  for (const row of rows) {
    try {
      const result = await closeSubscriptionCycle(row.id);
      processedSubscriptions += 1;
      results.push({
        subscription_id: row.id,
        customer_id: row.customerId,
        status: "processed",
        invoice: result.invoice,
      });
    } catch (error) {
      if (
        error instanceof SubscriptionError ||
        error instanceof BillingCycleError
      ) {
        const status = error.code === "not_due" ? "skipped" : "failed";

        if (status === "skipped") {
          skippedSubscriptions += 1;
        } else {
          failedSubscriptions += 1;
        }

        results.push({
          subscription_id: row.id,
          customer_id: row.customerId,
          status,
          message: error.message,
        });
        continue;
      }

      throw error;
    }
  }

  return {
    object: "subscription_cycle_close_batch",
    matched_subscriptions: rows.length,
    processed_subscriptions: processedSubscriptions,
    skipped_subscriptions: skippedSubscriptions,
    failed_subscriptions: failedSubscriptions,
    results,
  };
}
