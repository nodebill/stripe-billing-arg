import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  customers,
  paymentMethods,
  subscriptions,
} from "@/infrastructure/database/schema";
import type { StripeList } from "@/modules/shared/types";
import type {
  CreateCustomerInput,
  Customer,
  DeleteCustomerResult,
  ListCustomersParams,
  UpdateCustomerInput,
} from "./types";

function toCustomer(row: typeof customers.$inferSelect): Customer {
  return {
    id: row.id,
    object: "customer",
    name: row.name,
    email: row.email,
    description: row.description,
    metadata: row.metadata,
    livemode: row.livemode,
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

export async function createCustomer(
  organizationId: string,
  input: CreateCustomerInput
): Promise<Customer> {
  await ensureTables();
  const db = getDb();

  const now = Math.floor(Date.now() / 1000);
  const id = `cus_${nanoid()}`;

  const [row] = await db
    .insert(customers)
    .values({
      id,
      organizationId,
      name: input.name ?? null,
      email: input.email ?? null,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
      livemode: false,
      createdAt: new Date(now * 1000),
      updatedAt: new Date(now * 1000),
    })
    .returning();

  return toCustomer(row);
}

export async function getCustomer(
  organizationId: string,
  customerId: string
): Promise<Customer | null> {
  await ensureTables();
  const db = getDb();

  const rows = await db
    .select()
    .from(customers)
    .where(
      and(eq(customers.id, customerId), eq(customers.organizationId, organizationId))
    )
    .limit(1);

  if (rows.length === 0) return null;
  return toCustomer(rows[0]);
}

export async function updateCustomer(
  organizationId: string,
  customerId: string,
  input: UpdateCustomerInput
): Promise<Customer | null> {
  await ensureTables();
  const db = getDb();

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.email !== undefined) values.email = input.email;
  if (input.description !== undefined) values.description = input.description;
  if (input.metadata !== undefined) values.metadata = input.metadata;

  const rows = await db
    .update(customers)
    .set(values)
    .where(
      and(eq(customers.id, customerId), eq(customers.organizationId, organizationId))
    )
    .returning();

  if (rows.length === 0) return null;
  return toCustomer(rows[0]);
}

export async function deleteCustomer(
  organizationId: string,
  customerId: string
): Promise<DeleteCustomerResult> {
  await ensureTables();
  const db = getDb();

  const activeSubscriptionRows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(subscriptions.customerId, customerId),
        inArray(subscriptions.status, ["active", "past_due"])
      )
    )
    .limit(1);

  if (activeSubscriptionRows.length > 0) {
    return "has_subscriptions";
  }

  const rows = await db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .update(paymentMethods)
      .set({
        customerId: null,
        detachedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(paymentMethods.organizationId, organizationId),
          eq(paymentMethods.customerId, customerId)
        )
      );

    return tx
      .delete(customers)
      .where(
        and(
          eq(customers.id, customerId),
          eq(customers.organizationId, organizationId)
        )
      )
      .returning();
  });

  if (rows.length === 0) return null;
  return { id: customerId, object: "customer", deleted: true };
}

export async function listCustomers(
  organizationId: string,
  params: ListCustomersParams
): Promise<StripeList<Customer>> {
  await ensureTables();
  const db = getDb();

  const limit = params.limit ?? 10;
  const conditions = [eq(customers.organizationId, organizationId)];

  if (params.email !== undefined) {
    conditions.push(eq(customers.email, params.email));
  }

  if (params.starting_after) {
    const cursor = await db
      .select({ createdAt: customers.createdAt })
      .from(customers)
      .where(eq(customers.id, params.starting_after))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(lt(customers.createdAt, cursor[0].createdAt));
    }
  }

  if (params.ending_before) {
    const cursor = await db
      .select({ createdAt: customers.createdAt })
      .from(customers)
      .where(eq(customers.id, params.ending_before))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(gt(customers.createdAt, cursor[0].createdAt));
    }
  }

  const rows = await db
    .select()
    .from(customers)
    .where(and(...conditions))
    .orderBy(desc(customers.createdAt), desc(customers.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(toCustomer);

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: "/api/customers",
  };
}
