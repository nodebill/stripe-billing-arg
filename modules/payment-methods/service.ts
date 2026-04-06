import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  customers,
  paymentMethods,
  subscriptions,
} from "@/infrastructure/database/schema";
import { DEFAULT_CUSTOM_PAYMENT_METHOD_TYPE } from "./types";
import type {
  AttachPaymentMethodInput,
  CreatePaymentMethodInput,
  ListCustomerPaymentMethodsParams,
  PaymentMethod,
  StripePaymentMethodList,
  UpdatePaymentMethodInput,
} from "./types";

type PaymentMethodRow = typeof paymentMethods.$inferSelect;

export class PaymentMethodError extends Error {
  code:
    | "not_found"
    | "customer_not_found"
    | "already_attached"
    | "not_attached"
    | "already_detached";

  constructor(code: PaymentMethodError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function toPaymentMethod(row: PaymentMethodRow): PaymentMethod {
  return {
    id: row.id,
    object: "payment_method",
    type: "custom",
    custom: {
      type: row.customType,
    },
    customer: row.customerId,
    billing_details: {
      name: row.billingName,
    },
    livemode: row.livemode,
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

async function findPaymentMethodRow(
  paymentMethodId: string
): Promise<PaymentMethodRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.id, paymentMethodId))
    .limit(1);

  return rows[0] ?? null;
}

export async function createPaymentMethod(
  input: CreatePaymentMethodInput
): Promise<PaymentMethod> {
  await ensureTables();
  const db = getDb();

  const now = new Date();
  const id = `pm_${nanoid()}`;
  const [row] = await db
    .insert(paymentMethods)
    .values({
      id,
      customerId: null,
      type: "custom",
      customType: DEFAULT_CUSTOM_PAYMENT_METHOD_TYPE,
      billingName: input.billing_details?.name ?? null,
      livemode: false,
      detachedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return toPaymentMethod(row);
}

export async function getPaymentMethod(
  paymentMethodId: string
): Promise<PaymentMethod | null> {
  await ensureTables();
  const row = await findPaymentMethodRow(paymentMethodId);
  return row ? toPaymentMethod(row) : null;
}

export async function updatePaymentMethod(
  paymentMethodId: string,
  input: UpdatePaymentMethodInput
): Promise<PaymentMethod> {
  await ensureTables();
  const db = getDb();

  const existing = await findPaymentMethodRow(paymentMethodId);
  if (!existing) {
    throw new PaymentMethodError(
      "not_found",
      `No such payment_method: '${paymentMethodId}'`
    );
  }

  if (!existing.customerId) {
    throw new PaymentMethodError(
      "not_attached",
      "You can only update a payment method after it is attached to a customer"
    );
  }

  const [row] = await db
    .update(paymentMethods)
    .set({
      billingName: input.billing_details.name ?? null,
      updatedAt: new Date(),
    })
    .where(eq(paymentMethods.id, paymentMethodId))
    .returning();

  return toPaymentMethod(row);
}

export async function attachPaymentMethod(
  paymentMethodId: string,
  input: AttachPaymentMethodInput
): Promise<PaymentMethod> {
  await ensureTables();
  const db = getDb();

  return db.transaction(async (tx) => {
    const paymentMethodRows = await tx
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, paymentMethodId))
      .limit(1);

    const existing = paymentMethodRows[0];
    if (!existing) {
      throw new PaymentMethodError(
        "not_found",
        `No such payment_method: '${paymentMethodId}'`
      );
    }

    if (existing.detachedAt) {
      throw new PaymentMethodError(
        "already_detached",
        "This payment method was detached and cannot be re-attached"
      );
    }

    if (existing.customerId) {
      throw new PaymentMethodError(
        "already_attached",
        "This payment method is already attached to a customer"
      );
    }

    const customerRows = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, input.customer))
      .limit(1);

    if (customerRows.length === 0) {
      throw new PaymentMethodError(
        "customer_not_found",
        `No such customer: '${input.customer}'`
      );
    }

    const [row] = await tx
      .update(paymentMethods)
      .set({
        customerId: input.customer,
        updatedAt: new Date(),
      })
      .where(eq(paymentMethods.id, paymentMethodId))
      .returning();

    return toPaymentMethod(row);
  });
}

export async function detachPaymentMethod(
  paymentMethodId: string
): Promise<PaymentMethod> {
  await ensureTables();
  const db = getDb();

  return db.transaction(async (tx) => {
    const paymentMethodRows = await tx
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, paymentMethodId))
      .limit(1);

    const existing = paymentMethodRows[0];
    if (!existing) {
      throw new PaymentMethodError(
        "not_found",
        `No such payment_method: '${paymentMethodId}'`
      );
    }

    if (existing.detachedAt) {
      throw new PaymentMethodError(
        "already_detached",
        "This payment method has already been detached"
      );
    }

    if (!existing.customerId) {
      throw new PaymentMethodError(
        "not_attached",
        "This payment method is not attached to a customer"
      );
    }

    const now = new Date();

    await tx
      .update(subscriptions)
      .set({
        status: "canceled",
        cancelAtPeriodEnd: false,
        canceledAt: now,
        endedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(subscriptions.defaultPaymentMethodId, paymentMethodId),
          inArray(subscriptions.status, ["active", "past_due"])
        )
      );

    const [row] = await tx
      .update(paymentMethods)
      .set({
        customerId: null,
        detachedAt: now,
        updatedAt: now,
      })
      .where(eq(paymentMethods.id, paymentMethodId))
      .returning();

    return toPaymentMethod(row);
  });
}

export async function listCustomerPaymentMethods(
  customerId: string,
  params: ListCustomerPaymentMethodsParams
): Promise<StripePaymentMethodList> {
  await ensureTables();
  const db = getDb();

  const limit = params.limit ?? 10;
  const conditions = [eq(paymentMethods.customerId, customerId)];

  if (params.starting_after) {
    const cursor = await db
      .select({ createdAt: paymentMethods.createdAt })
      .from(paymentMethods)
      .where(eq(paymentMethods.id, params.starting_after))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(lt(paymentMethods.createdAt, cursor[0].createdAt));
    }
  }

  if (params.ending_before) {
    const cursor = await db
      .select({ createdAt: paymentMethods.createdAt })
      .from(paymentMethods)
      .where(eq(paymentMethods.id, params.ending_before))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(gt(paymentMethods.createdAt, cursor[0].createdAt));
    }
  }

  const rows = await db
    .select()
    .from(paymentMethods)
    .where(and(...conditions))
    .orderBy(desc(paymentMethods.createdAt), desc(paymentMethods.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(toPaymentMethod);

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: `/api/customers/${customerId}/payment_methods`,
  };
}
