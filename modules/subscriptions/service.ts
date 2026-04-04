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
import type {
  CreateSubscriptionInput,
  ListSubscriptionsParams,
  StripeSubscriptionList,
  Subscription,
  SubscriptionItem,
  UpdateSubscriptionInput,
} from "./types";

type SubscriptionRow = typeof subscriptions.$inferSelect;
type SubscriptionItemRow = typeof subscriptionItems.$inferSelect;
type PriceRow = typeof prices.$inferSelect;

type LoadedSubscription = {
  row: SubscriptionRow;
  itemRows: SubscriptionItemRow[];
  priceRowsById: Map<string, PriceRow>;
};

type DbClient = ReturnType<typeof getDb>;

export class SubscriptionError extends Error {
  code:
    | "not_found"
    | "customer_not_found"
    | "payment_method_not_found"
    | "payment_method_not_attached"
    | "payment_method_customer_mismatch"
    | "invalid_items"
    | "invalid_price"
    | "already_canceled";

  constructor(code: SubscriptionError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function unix(date: Date | null): number | null {
  return date ? Math.floor(date.getTime() / 1000) : null;
}

function toSubscriptionItem(row: SubscriptionItemRow): SubscriptionItem {
  return {
    id: row.id,
    object: "subscription_item",
    price: row.priceId,
  };
}

function toSubscription(loaded: LoadedSubscription): Subscription {
  return {
    id: loaded.row.id,
    object: "subscription",
    customer: loaded.row.customerId,
    status: loaded.row.status,
    default_payment_method: loaded.row.defaultPaymentMethodId,
    items: loaded.itemRows.map(toSubscriptionItem),
    cancel_at_period_end: loaded.row.cancelAtPeriodEnd,
    canceled_at: unix(loaded.row.canceledAt),
    ended_at: unix(loaded.row.endedAt),
    current_period_start: Math.floor(
      loaded.row.currentPeriodStart.getTime() / 1000
    ),
    current_period_end: Math.floor(loaded.row.currentPeriodEnd.getTime() / 1000),
    livemode: loaded.row.livemode,
    created: Math.floor(loaded.row.createdAt.getTime() / 1000),
    updated: Math.floor(loaded.row.updatedAt.getTime() / 1000),
  };
}

function addRecurringInterval(date: Date, interval: "month" | "year") {
  const next = new Date(date);

  if (interval === "month") {
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }

  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

async function loadSubscription(
  db: DbClient,
  organizationId: string,
  row: SubscriptionRow
): Promise<LoadedSubscription> {
  const itemRows = await db
    .select()
    .from(subscriptionItems)
    .where(
      and(
        eq(subscriptionItems.organizationId, organizationId),
        eq(subscriptionItems.subscriptionId, row.id)
      )
    )
    .orderBy(desc(subscriptionItems.createdAt), desc(subscriptionItems.id));

  const priceIds = Array.from(new Set(itemRows.map((item) => item.priceId)));
  const priceRows =
    priceIds.length === 0
      ? []
      : await db
          .select()
          .from(prices)
          .where(
            and(
              eq(prices.organizationId, organizationId),
              inArray(prices.id, priceIds)
            )
          );

  return {
    row,
    itemRows,
    priceRowsById: new Map(priceRows.map((price) => [price.id, price])),
  };
}

async function normalizeLoadedSubscription(
  db: DbClient,
  loaded: LoadedSubscription
): Promise<LoadedSubscription> {
  if (loaded.row.status === "canceled" || loaded.itemRows.length === 0) {
    return loaded;
  }

  const primaryPrice = loaded.priceRowsById.get(loaded.itemRows[0].priceId);
  if (!primaryPrice?.recurringInterval) {
    return loaded;
  }

  const now = new Date();
  let nextRow = loaded.row;

  if (loaded.row.cancelAtPeriodEnd) {
    if (loaded.row.currentPeriodEnd.getTime() > now.getTime()) {
      return loaded;
    }

    const canceledAt = loaded.row.currentPeriodEnd;
    const [updated] = await db
      .update(subscriptions)
      .set({
        status: "canceled",
        cancelAtPeriodEnd: false,
        canceledAt,
        endedAt: canceledAt,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, loaded.row.id))
      .returning();

    nextRow = updated;
    return { ...loaded, row: nextRow };
  }

  if (loaded.row.currentPeriodEnd.getTime() > now.getTime()) {
    return loaded;
  }

  let currentPeriodStart = loaded.row.currentPeriodStart;
  let currentPeriodEnd = loaded.row.currentPeriodEnd;

  while (currentPeriodEnd.getTime() <= now.getTime()) {
    currentPeriodStart = currentPeriodEnd;
    currentPeriodEnd = addRecurringInterval(
      currentPeriodEnd,
      primaryPrice.recurringInterval
    );
  }

  const [updated] = await db
    .update(subscriptions)
    .set({
      currentPeriodStart,
      currentPeriodEnd,
      updatedAt: now,
    })
    .where(eq(subscriptions.id, loaded.row.id))
    .returning();

  nextRow = updated;

  return {
    ...loaded,
    row: nextRow,
  };
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

async function normalizeCustomerSubscriptions(
  organizationId: string,
  customerId: string
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(subscriptions.customerId, customerId),
        eq(subscriptions.status, "active")
      )
    );

  for (const row of rows) {
    const loaded = await loadSubscription(db, organizationId, row);
    await normalizeLoadedSubscription(db, loaded);
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

    const paymentMethodRows = await tx
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.organizationId, organizationId),
          eq(paymentMethods.id, input.default_payment_method)
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
        defaultPaymentMethodId: input.default_payment_method,
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

    const [subscriptionItemRow] = await tx
      .insert(subscriptionItems)
      .values({
        id: subscriptionItemId,
        organizationId,
        subscriptionId,
        priceId: price.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return toSubscription({
      row: subscriptionRow,
      itemRows: [subscriptionItemRow],
      priceRowsById: new Map([[price.id, price]]),
    });
  });
}

export async function getSubscription(
  organizationId: string,
  subscriptionId: string
): Promise<Subscription | null> {
  await ensureTables();
  const db = getDb();
  const row = await getSubscriptionRow(organizationId, subscriptionId);
  if (!row) {
    return null;
  }

  const loaded = await loadSubscription(db, organizationId, row);
  const normalized = await normalizeLoadedSubscription(db, loaded);
  return toSubscription(normalized);
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

  const normalized = await normalizeLoadedSubscription(
    db,
    await loadSubscription(db, organizationId, row)
  );

  if (normalized.row.status === "canceled") {
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

  return toSubscription({
    ...normalized,
    row: updated,
  });
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

  const normalized = await normalizeLoadedSubscription(
    db,
    await loadSubscription(db, organizationId, row)
  );

  if (normalized.row.status === "canceled") {
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

  return toSubscription({
    ...normalized,
    row: updated,
  });
}

export async function listSubscriptions(
  organizationId: string,
  params: ListSubscriptionsParams
): Promise<StripeSubscriptionList> {
  await ensureTables();
  const db = getDb();

  await normalizeCustomerSubscriptions(organizationId, params.customer);

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
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data: Subscription[] = [];

  for (const row of rows.slice(0, limit)) {
    const loaded = await loadSubscription(db, organizationId, row);
    data.push(toSubscription(loaded));
  }

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: "/api/subscriptions",
  };
}
