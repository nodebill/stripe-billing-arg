import { and, desc, eq, gt, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import { meters, prices, products } from "@/infrastructure/database/schema";
import type {
  CreatePriceInput,
  ListPricesParams,
  Price,
  StripePriceList,
  UpdatePriceInput,
} from "./types";

function toPrice(row: typeof prices.$inferSelect): Price {
  return {
    id: row.id,
    object: "price",
    active: row.active,
    billing_scheme: "per_unit",
    currency: row.currency,
    livemode: row.livemode,
    metadata: row.metadata,
    nickname: row.nickname,
    product: row.productId,
    type: row.type,
    unit_amount: row.unitAmount,
    recurring:
      row.type === "recurring" && row.recurringInterval
        ? {
            interval: row.recurringInterval,
            interval_count: 1,
            usage_type: row.meter ? "metered" : "licensed",
          }
        : null,
    meter: row.meter ?? null,
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

export async function getPrice(
  organizationId: string,
  priceId: string
): Promise<Price | null> {
  await ensureTables();
  const db = getDb();

  const rows = await db
    .select()
    .from(prices)
    .where(and(eq(prices.id, priceId), eq(prices.organizationId, organizationId)))
    .limit(1);

  if (rows.length === 0) return null;
  return toPrice(rows[0]);
}

export async function createPrice(
  organizationId: string,
  input: CreatePriceInput
): Promise<Price | null | { error: string }> {
  await ensureTables();
  const db = getDb();

  const now = new Date();
  const id = `price_${nanoid()}`;

  return db.transaction(async (tx) => {
    const productRows = await tx
      .select({
        id: products.id,
        defaultPriceId: products.defaultPriceId,
      })
      .from(products)
      .where(
        and(
          eq(products.id, input.product),
          eq(products.organizationId, organizationId)
        )
      )
      .limit(1);

    if (productRows.length === 0) {
      return null;
    }

    let meterId: string | null = null;
    if (input.type === "recurring" && input.meter) {
      const meterRows = await tx
        .select({ id: meters.id, status: meters.status })
        .from(meters)
        .where(
          and(
            eq(meters.id, input.meter),
            eq(meters.organizationId, organizationId)
          )
        )
        .limit(1);

      if (meterRows.length === 0) {
        return { error: `No such meter: '${input.meter}'` };
      }
      if (meterRows[0].status !== "active") {
        return { error: `Meter '${input.meter}' is not active` };
      }
      meterId = meterRows[0].id;
    }

    const [row] = await tx
      .insert(prices)
      .values({
        id,
        organizationId,
        productId: input.product,
        active: input.active ?? true,
        billingScheme: "per_unit",
        currency: input.currency,
        nickname: input.nickname ?? null,
        metadata: input.metadata ?? {},
        livemode: false,
        type: input.type,
        unitAmount: input.unit_amount,
        recurringInterval:
          input.type === "recurring" ? input.recurring.interval : null,
        recurringIntervalCount:
          input.type === "recurring" ? input.recurring.interval_count : null,
        meter: meterId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (row.active && !productRows[0].defaultPriceId) {
      await tx
        .update(products)
        .set({ defaultPriceId: row.id, updatedAt: now })
        .where(
          and(
            eq(products.id, input.product),
            eq(products.organizationId, organizationId)
          )
        );
    }

    return toPrice(row);
  });
}

export async function updatePrice(
  organizationId: string,
  priceId: string,
  input: UpdatePriceInput
): Promise<Price | null> {
  await ensureTables();
  const db = getDb();

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.active !== undefined) values.active = input.active;
  if (input.nickname !== undefined) values.nickname = input.nickname;
  if (input.metadata !== undefined) values.metadata = input.metadata;

  return db.transaction(async (tx) => {
    const rows = await tx
      .update(prices)
      .set(values)
      .where(and(eq(prices.id, priceId), eq(prices.organizationId, organizationId)))
      .returning();

    if (rows.length === 0) return null;

    const row = rows[0];

    if (!row.active) {
      await tx
        .update(products)
        .set({ defaultPriceId: null, updatedAt: new Date() })
        .where(
          and(
            eq(products.id, row.productId),
            eq(products.organizationId, organizationId),
            eq(products.defaultPriceId, row.id)
          )
        );
    }

    return toPrice(row);
  });
}

export async function listPrices(
  organizationId: string,
  params: ListPricesParams
): Promise<StripePriceList> {
  await ensureTables();
  const db = getDb();

  const limit = params.limit ?? 10;
  const conditions = [
    eq(prices.organizationId, organizationId),
    eq(prices.productId, params.product),
  ];

  if (params.active !== undefined) {
    conditions.push(eq(prices.active, params.active));
  }

  if (params.type !== undefined) {
    conditions.push(eq(prices.type, params.type));
  }

  if (params.starting_after) {
    const cursor = await db
      .select({ createdAt: prices.createdAt })
      .from(prices)
      .where(eq(prices.id, params.starting_after))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(lt(prices.createdAt, cursor[0].createdAt));
    }
  }

  if (params.ending_before) {
    const cursor = await db
      .select({ createdAt: prices.createdAt })
      .from(prices)
      .where(eq(prices.id, params.ending_before))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(gt(prices.createdAt, cursor[0].createdAt));
    }
  }

  const rows = await db
    .select()
    .from(prices)
    .where(and(...conditions))
    .orderBy(desc(prices.createdAt), desc(prices.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(toPrice);

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: "/api/prices",
  };
}
