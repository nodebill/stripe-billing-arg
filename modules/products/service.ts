import { and, desc, eq, gt, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, ensureTables } from "@/infrastructure/database/client";
import { products } from "@/infrastructure/database/schema";
import type {
  CreateProductInput,
  DeletedProduct,
  ListProductsParams,
  Product,
  StripeList,
  UpdateProductInput,
} from "./types";

function toProduct(row: typeof products.$inferSelect): Product {
  return {
    id: row.id,
    object: "product",
    name: row.name,
    active: row.active,
    description: row.description,
    metadata: row.metadata,
    livemode: row.livemode,
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

export async function createProduct(
  organizationId: string,
  input: CreateProductInput
): Promise<Product> {
  await ensureTables();

  const now = Math.floor(Date.now() / 1000);
  const id = `prod_${nanoid()}`;

  const [row] = await db
    .insert(products)
    .values({
      id,
      organizationId,
      name: input.name,
      active: input.active ?? true,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
      livemode: false,
      createdAt: new Date(now * 1000),
      updatedAt: new Date(now * 1000),
    })
    .returning();

  return toProduct(row);
}

export async function updateProduct(
  organizationId: string,
  productId: string,
  input: UpdateProductInput
): Promise<Product | null> {
  await ensureTables();

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.description !== undefined) values.description = input.description;
  if (input.active !== undefined) values.active = input.active;
  if (input.metadata !== undefined) values.metadata = input.metadata;

  const rows = await db
    .update(products)
    .set(values)
    .where(
      and(eq(products.id, productId), eq(products.organizationId, organizationId))
    )
    .returning();

  if (rows.length === 0) return null;
  return toProduct(rows[0]);
}

export async function deleteProduct(
  organizationId: string,
  productId: string
): Promise<DeletedProduct | null> {
  await ensureTables();

  const rows = await db
    .delete(products)
    .where(
      and(eq(products.id, productId), eq(products.organizationId, organizationId))
    )
    .returning();

  if (rows.length === 0) return null;
  return { id: productId, object: "product", deleted: true };
}

export async function listProducts(
  organizationId: string,
  params: ListProductsParams
): Promise<StripeList<Product>> {
  await ensureTables();

  const limit = params.limit ?? 10;
  const conditions = [eq(products.organizationId, organizationId)];

  if (params.active !== undefined) {
    conditions.push(eq(products.active, params.active));
  }

  if (params.starting_after) {
    const cursor = await db
      .select({ createdAt: products.createdAt })
      .from(products)
      .where(eq(products.id, params.starting_after))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(lt(products.createdAt, cursor[0].createdAt));
    }
  }

  if (params.ending_before) {
    const cursor = await db
      .select({ createdAt: products.createdAt })
      .from(products)
      .where(eq(products.id, params.ending_before))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(gt(products.createdAt, cursor[0].createdAt));
    }
  }

  const rows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(toProduct);

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: "/api/products",
  };
}
