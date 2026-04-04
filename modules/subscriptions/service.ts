import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  customers,
  paymentMethods,
  prices,
  subscriptionItems,
  subscriptions,
} from "@/infrastructure/database/schema";
import { addRecurringInterval, toUnix } from "@/modules/shared/time";
import type {
  CreateSubscriptionInput,
  ListSubscriptionsParams,
  StripeSubscriptionList,
  Subscription,
  SubscriptionCollectionMethod,
  SubscriptionItem,
  UpdateSubscriptionInput,
} from "./types";

type SubscriptionRow = typeof subscriptions.$inferSelect;
type SubscriptionItemRow = typeof subscriptionItems.$inferSelect;

export class SubscriptionError extends Error {
  code:
    | "not_found"
    | "customer_not_found"
    | "payment_method_not_found"
    | "payment_method_not_attached"
    | "payment_method_customer_mismatch"
    | "default_payment_method_required"
    | "invalid_items"
    | "invalid_price"
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
  organizationId: string,
  subscriptionId: string
): Promise<SubscriptionItemRow[]> {
  const db = getDb();
  return db
    .select()
    .from(subscriptionItems)
    .where(
      and(
        eq(subscriptionItems.organizationId, organizationId),
        eq(subscriptionItems.subscriptionId, subscriptionId)
      )
    )
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
    collection_method: row.collectionMethod,
    default_payment_method: row.defaultPaymentMethodId,
    items: itemRows.map(toSubscriptionItem),
    cancel_at_period_end: row.cancelAtPeriodEnd,
    canceled_at: toUnix(row.canceledAt),
    ended_at: toUnix(row.endedAt),
    current_period_start: Math.floor(row.currentPeriodStart.getTime() / 1000),
    current_period_end: Math.floor(row.currentPeriodEnd.getTime() / 1000),
    livemode: row.livemode,
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

async function toSubscription(
  organizationId: string,
  row: SubscriptionRow
): Promise<Subscription> {
  const itemRows = await listSubscriptionItems(organizationId, row.id);
  return toSubscriptionFromRows(row, itemRows);
}

async function getSubscriptionRow(
  organizationId: string,
  subscriptionId: string
): Promise<SubscriptionRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(subscriptions.id, subscriptionId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
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

export async function createSubscription(
  organizationId: string,
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

  const collectionMethod = input.collection_method ?? "charge_automatically";
  requireDefaultPaymentMethod(collectionMethod, input.default_payment_method);

  return db.transaction(async (tx) => {
    const customerRows = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.organizationId, organizationId),
          eq(customers.id, input.customer)
        )
      )
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
        .where(
          and(
            eq(paymentMethods.organizationId, organizationId),
            eq(paymentMethods.id, input.default_payment_method!)
          )
        )
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
      .where(and(eq(prices.organizationId, organizationId), eq(prices.id, priceId)))
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

    const now = new Date();
    const subscriptionId = `sub_${nanoid()}`;
    const subscriptionItemId = `si_${nanoid()}`;
    const currentPeriodEnd = addRecurringInterval(now, price.recurringInterval);

    const [subscriptionRow] = await tx
      .insert(subscriptions)
      .values({
        id: subscriptionId,
        organizationId,
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
        currentPeriodStart: now,
        currentPeriodEnd,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const [subscriptionItemRow] = await tx.insert(subscriptionItems).values({
      id: subscriptionItemId,
      organizationId,
      subscriptionId,
      priceId: price.id,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return toSubscriptionFromRows(subscriptionRow, [subscriptionItemRow]);
  });
}

export async function getSubscription(
  organizationId: string,
  subscriptionId: string
): Promise<Subscription | null> {
  await ensureTables();
  const row = await getSubscriptionRow(organizationId, subscriptionId);
  return row ? toSubscription(organizationId, row) : null;
}

export async function updateSubscription(
  organizationId: string,
  subscriptionId: string,
  input: UpdateSubscriptionInput
): Promise<Subscription> {
  await ensureTables();
  const db = getDb();

  const row = await getSubscriptionRow(organizationId, subscriptionId);
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

  return toSubscription(organizationId, updated);
}

export async function cancelSubscription(
  organizationId: string,
  subscriptionId: string
): Promise<Subscription> {
  await ensureTables();
  const db = getDb();

  const row = await getSubscriptionRow(organizationId, subscriptionId);
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

  return toSubscription(organizationId, updated);
}

export async function listSubscriptions(
  organizationId: string,
  params: ListSubscriptionsParams
): Promise<StripeSubscriptionList> {
  await ensureTables();
  const db = getDb();

  const limit = params.limit ?? 10;
  const conditions = [
    eq(subscriptions.organizationId, organizationId),
    eq(subscriptions.customerId, params.customer),
  ];

  if (params.status) {
    conditions.push(eq(subscriptions.status, params.status));
  }

  if (params.starting_after) {
    const cursor = await db
      .select({ createdAt: subscriptions.createdAt })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, organizationId),
          eq(subscriptions.id, params.starting_after)
        )
      )
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(lt(subscriptions.createdAt, cursor[0].createdAt));
    }
  }

  if (params.ending_before) {
    const cursor = await db
      .select({ createdAt: subscriptions.createdAt })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, organizationId),
          eq(subscriptions.id, params.ending_before)
        )
      )
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(gt(subscriptions.createdAt, cursor[0].createdAt));
    }
  }

  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(...conditions))
    .orderBy(
      desc(subscriptions.createdAt),
      desc(subscriptions.currentPeriodEnd),
      desc(subscriptions.id)
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = await Promise.all(
    rows.slice(0, limit).map((row) => toSubscription(organizationId, row))
  );

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: "/api/subscriptions",
  };
}

export async function listNonCanceledCustomerSubscriptionIds(
  organizationId: string,
  customerId: string
) {
  await ensureTables();
  const db = getDb();

  return db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(subscriptions.customerId, customerId),
        inArray(subscriptions.status, ["active", "past_due"])
      )
    );
}
