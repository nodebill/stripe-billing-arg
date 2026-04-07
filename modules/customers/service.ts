import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  customers,
  paymentMethods,
  subscriptions,
} from "@/infrastructure/database/schema";
import type { StripeList, StripeSearchResult } from "@/modules/shared/types";
import type {
  CreateCustomerInput,
  CreateTaxIdInput,
  Customer,
  DeleteCustomerResult,
  DeletedTaxId,
  ListCustomersParams,
  SearchCustomersParams,
  TaxId,
  UpdateCustomerInput,
} from "./types";

function toCustomer(row: typeof customers.$inferSelect): Customer {
  return {
    id: row.id,
    object: "customer",
    name: row.name,
    email: row.email,
    description: row.description,
    address: row.address ?? null,
    metadata: row.metadata,
    livemode: row.livemode,
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

function toTaxId(
  stored: NonNullable<typeof customers.$inferSelect["taxId"]>
): TaxId {
  return {
    id: stored.id,
    object: "tax_id",
    type: stored.type,
    value: stored.value,
    customer: stored.customer,
    created: stored.created,
  };
}

export async function createCustomer(
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
      name: input.name ?? null,
      email: input.email ?? null,
      description: input.description ?? null,
      address: input.address ?? null,
      metadata: input.metadata ?? {},
      livemode: false,
      createdAt: new Date(now * 1000),
      updatedAt: new Date(now * 1000),
    })
    .returning();

  return toCustomer(row);
}

export async function getCustomer(
  customerId: string
): Promise<Customer | null> {
  await ensureTables();
  const db = getDb();

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (rows.length === 0) return null;
  return toCustomer(rows[0]);
}

export async function updateCustomer(
  customerId: string,
  input: UpdateCustomerInput
): Promise<Customer | null> {
  await ensureTables();
  const db = getDb();

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.email !== undefined) values.email = input.email;
  if (input.description !== undefined) values.description = input.description;
  if (input.address !== undefined) values.address = input.address;
  if (input.metadata !== undefined) values.metadata = input.metadata;

  const rows = await db
    .update(customers)
    .set(values)
    .where(eq(customers.id, customerId))
    .returning();

  if (rows.length === 0) return null;
  return toCustomer(rows[0]);
}

export async function deleteCustomer(
  customerId: string
): Promise<DeleteCustomerResult> {
  await ensureTables();
  const db = getDb();

  const activeSubscriptionRows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
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
      .where(eq(paymentMethods.customerId, customerId));

    return tx
      .delete(customers)
      .where(eq(customers.id, customerId))
      .returning();
  });

  if (rows.length === 0) return null;
  return { id: customerId, object: "customer", deleted: true };
}

export async function listCustomers(
  params: ListCustomersParams
): Promise<StripeList<Customer>> {
  await ensureTables();
  const db = getDb();

  const limit = params.limit ?? 10;
  const conditions = [];

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

export async function searchCustomers(
  params: SearchCustomersParams
): Promise<StripeSearchResult<Customer>> {
  await ensureTables();
  const db = getDb();

  const limit = params.limit ?? 10;
  const conditions = [
    sql<boolean>`${customers.metadata} ->> ${params.metadataKey} = ${params.metadataValue}`,
  ];

  if (params.page) {
    const cursor = await db
      .select({
        id: customers.id,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(eq(customers.id, params.page))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(
        sql<boolean>`(
          ${customers.createdAt} < ${cursor[0].createdAt}
          or (
            ${customers.createdAt} = ${cursor[0].createdAt}
            and ${customers.id} < ${cursor[0].id}
          )
        )`
      );
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
    object: "search_result",
    data,
    has_more: hasMore,
    next_page: hasMore ? data[data.length - 1]?.id ?? null : null,
    url: "/api/customers/search",
  };
}

// --- Tax ID sub-resource ---

export async function createTaxId(
  customerId: string,
  input: CreateTaxIdInput
): Promise<TaxId | "not_found" | "already_exists"> {
  await ensureTables();
  const db = getDb();

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (rows.length === 0) return "not_found";
  if (rows[0].taxId) return "already_exists";

  const taxIdObj = {
    id: `txi_${nanoid()}`,
    type: input.type,
    value: input.value,
    customer: customerId,
    created: Math.floor(Date.now() / 1000),
  };

  await db
    .update(customers)
    .set({ taxId: taxIdObj, updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  return toTaxId(taxIdObj);
}

export async function listTaxIds(
  customerId: string
): Promise<StripeList<TaxId> | "not_found"> {
  await ensureTables();
  const db = getDb();

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (rows.length === 0) return "not_found";

  const data = rows[0].taxId ? [toTaxId(rows[0].taxId)] : [];

  return {
    object: "list",
    data,
    has_more: false,
    url: `/api/customers/${customerId}/tax_ids`,
  };
}

export async function deleteTaxId(
  customerId: string,
  taxIdId: string
): Promise<DeletedTaxId | "not_found" | "tax_id_not_found"> {
  await ensureTables();
  const db = getDb();

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (rows.length === 0) return "not_found";
  if (!rows[0].taxId || rows[0].taxId.id !== taxIdId) return "tax_id_not_found";

  await db
    .update(customers)
    .set({ taxId: null, updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  return { id: taxIdId, object: "tax_id", deleted: true };
}
