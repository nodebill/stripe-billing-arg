import { and, desc, eq, gt, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import { meters } from "@/infrastructure/database/schema";
import type {
  CreateMeterInput,
  ListMetersParams,
  Meter,
  StripeMeterList,
  UpdateMeterInput,
} from "./types";

function toMeter(row: typeof meters.$inferSelect): Meter {
  return {
    id: row.id,
    object: "billing.meter",
    display_name: row.displayName,
    event_name: row.eventName,
    default_aggregation: { formula: row.defaultAggregation },
    status: row.status,
    livemode: row.livemode,
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

export async function createMeter(
  input: CreateMeterInput
): Promise<Meter | { error: string }> {
  await ensureTables();
  const db = getDb();

  const existing = await db
    .select({ id: meters.id })
    .from(meters)
    .where(eq(meters.eventName, input.event_name))
    .limit(1);

  if (existing.length > 0) {
    return { error: `A meter with event_name '${input.event_name}' already exists` };
  }

  const now = new Date();
  const id = `meter_${nanoid()}`;

  const [row] = await db
    .insert(meters)
    .values({
      id,
      displayName: input.display_name,
      eventName: input.event_name,
      defaultAggregation: input.default_aggregation.formula,
      status: "active",
      livemode: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return toMeter(row);
}

export async function getMeter(
  meterId: string
): Promise<Meter | null> {
  await ensureTables();
  const db = getDb();

  const rows = await db
    .select()
    .from(meters)
    .where(eq(meters.id, meterId))
    .limit(1);

  if (rows.length === 0) return null;
  return toMeter(rows[0]);
}

export async function updateMeter(
  meterId: string,
  input: UpdateMeterInput
): Promise<Meter | null> {
  await ensureTables();
  const db = getDb();

  const rows = await db
    .update(meters)
    .set({ displayName: input.display_name, updatedAt: new Date() })
    .where(eq(meters.id, meterId))
    .returning();

  if (rows.length === 0) return null;
  return toMeter(rows[0]);
}

export async function deactivateMeter(
  meterId: string
): Promise<Meter | null> {
  await ensureTables();
  const db = getDb();

  const rows = await db
    .update(meters)
    .set({ status: "inactive" as const, updatedAt: new Date() })
    .where(
      and(
        eq(meters.id, meterId),
        eq(meters.status, "active")
      )
    )
    .returning();

  if (rows.length === 0) return null;
  return toMeter(rows[0]);
}

export async function listMeters(
  params: ListMetersParams
): Promise<StripeMeterList> {
  await ensureTables();
  const db = getDb();

  const limit = params.limit ?? 10;
  const conditions = [];

  if (params.status !== undefined) {
    conditions.push(eq(meters.status, params.status));
  }

  if (params.starting_after) {
    const cursor = await db
      .select({ createdAt: meters.createdAt })
      .from(meters)
      .where(eq(meters.id, params.starting_after))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(lt(meters.createdAt, cursor[0].createdAt));
    }
  }

  if (params.ending_before) {
    const cursor = await db
      .select({ createdAt: meters.createdAt })
      .from(meters)
      .where(eq(meters.id, params.ending_before))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(gt(meters.createdAt, cursor[0].createdAt));
    }
  }

  const rows = await db
    .select()
    .from(meters)
    .where(and(...conditions))
    .orderBy(desc(meters.createdAt), desc(meters.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(toMeter);

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: "/api/billing/meters",
  };
}
