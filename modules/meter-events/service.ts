import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  customers,
  meterEvents,
  meters,
  prices,
  subscriptionItems,
  subscriptionSchedulePhases,
  subscriptionSchedules,
  subscriptions,
} from "@/infrastructure/database/schema";
import type { SubscriptionStatus } from "@/modules/subscriptions/types";
import type {
  CreateMeterEventInput,
  ListMeterEventSummariesParams,
  MeterEvent,
  MeterEventSummary,
  StripeMeterEventSummaryList,
} from "./types";

type MeterRow = typeof meters.$inferSelect;
type MeterEventRow = typeof meterEvents.$inferSelect;
type SubscriptionRow = typeof subscriptions.$inferSelect;
type PriceRow = typeof prices.$inferSelect;

const MAX_EVENT_AGE_SECONDS = 35 * 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;

export class MeterEventError extends Error {
  code: "invalid_request" | "not_found";

  constructor(code: MeterEventError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type MatchedMeteredSubscription = {
  subscription: SubscriptionRow;
  price: PriceRow;
};

function toMeterEvent(row: MeterEventRow): MeterEvent {
  return {
    id: row.id,
    object: "billing.meter_event",
    created: Math.floor(row.createdAt.getTime() / 1000),
    event_name: row.eventName,
    identifier: row.identifier,
    livemode: row.livemode,
    payload: {
      stripe_customer_id: row.customerId,
      value: String(row.value),
    },
    timestamp: Math.floor(row.eventTimestamp.getTime() / 1000),
  };
}

function makeSummaryId(
  meterId: string,
  startTime: number,
  endTime: number,
  aggregatedValue: number
) {
  const digest = createHash("sha1")
    .update(`${meterId}:${startTime}:${endTime}:${aggregatedValue}`)
    .digest("hex")
    .slice(0, 24);

  return `mtrusg_${digest}`;
}

function toMeterEventSummary(
  meter: MeterRow,
  startTime: number,
  endTime: number,
  aggregatedValue: number
): MeterEventSummary {
  return {
    id: makeSummaryId(meter.id, startTime, endTime, aggregatedValue),
    object: "billing.meter_event_summary",
    aggregated_value: aggregatedValue,
    end_time: endTime,
    livemode: meter.livemode,
    meter: meter.id,
    start_time: startTime,
  };
}

function floorWindowStart(timestamp: number, window: "hour" | "day") {
  const date = new Date(timestamp * 1000);

  if (window === "hour") {
    date.setUTCMinutes(0, 0, 0);
    return Math.floor(date.getTime() / 1000);
  }

  date.setUTCHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function addWindow(startTime: number, window: "hour" | "day") {
  return startTime + (window === "hour" ? 60 * 60 : 24 * 60 * 60);
}

async function getMeterById(meterId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(meters)
    .where(eq(meters.id, meterId))
    .limit(1);

  return rows[0] ?? null;
}

async function getMeterByEventName(eventName: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(meters)
    .where(eq(meters.eventName, eventName))
    .limit(1);

  return rows[0] ?? null;
}

async function assertCustomerExists(customerId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!rows[0]) {
    throw new MeterEventError("invalid_request", `No such customer: '${customerId}'`);
  }
}

function aggregateMeterValues(formula: MeterRow["defaultAggregation"], rows: MeterEventRow[]) {
  if (formula === "count") {
    return rows.length;
  }

  return rows.reduce((total, row) => total + row.value, 0);
}

async function loadMeterEvents(
  meterId: string,
  customerId: string,
  startTime: number,
  endTime: number
) {
  const db = getDb();

  return db
    .select()
    .from(meterEvents)
    .where(
      and(
        eq(meterEvents.meterId, meterId),
        eq(meterEvents.customerId, customerId),
        gte(meterEvents.eventTimestamp, new Date(startTime * 1000)),
        lt(meterEvents.eventTimestamp, new Date(endTime * 1000))
      )
    );
}

async function loadCurrentPriceForSubscription(subscriptionId: string) {
  const db = getDb();
  const itemRows = await db
    .select()
    .from(subscriptionItems)
    .where(eq(subscriptionItems.subscriptionId, subscriptionId))
    .limit(1);

  const item = itemRows[0];
  if (!item) {
    return null;
  }

  const priceRows = await db
    .select()
    .from(prices)
    .where(eq(prices.id, item.priceId))
    .limit(1);

  return priceRows[0] ?? null;
}

async function resolvePriceForSubscriptionAt(
  subscriptionId: string,
  eventTimestamp: Date
) {
  const db = getDb();
  const scheduleRows = await db
    .select()
    .from(subscriptionSchedules)
    .where(eq(subscriptionSchedules.subscriptionId, subscriptionId));

  if (scheduleRows.length > 0) {
    const scheduleMap = new Map(scheduleRows.map((row) => [row.id, row]));
    const phaseRows = await db
      .select()
      .from(subscriptionSchedulePhases)
      .where(inArray(subscriptionSchedulePhases.scheduleId, scheduleRows.map((row) => row.id)))
      .orderBy(
        asc(subscriptionSchedulePhases.startDate),
        asc(subscriptionSchedulePhases.orderIndex)
      );

    const activePhase = phaseRows
      .filter((phase) => {
        const schedule = scheduleMap.get(phase.scheduleId);
        if (!schedule) {
          return false;
        }

        const terminalAt =
          schedule.canceledAt ?? schedule.releasedAt ?? schedule.completedAt ?? null;
        const effectiveEnd = terminalAt
          ? new Date(Math.min(phase.endDate.getTime(), terminalAt.getTime()))
          : phase.endDate;

        return (
          phase.startDate.getTime() <= eventTimestamp.getTime() &&
          effectiveEnd.getTime() > eventTimestamp.getTime()
        );
      })
      .sort(
        (left, right) =>
          right.startDate.getTime() - left.startDate.getTime() ||
          right.orderIndex - left.orderIndex
      )[0];

    if (activePhase) {
      const priceRows = await db
        .select()
        .from(prices)
        .where(eq(prices.id, activePhase.priceId))
        .limit(1);
      return priceRows[0] ?? null;
    }

    const earliestUpcomingPhase = phaseRows
      .filter((phase) => phase.startDate.getTime() > eventTimestamp.getTime())
      .sort(
        (left, right) =>
          left.startDate.getTime() - right.startDate.getTime() ||
          left.orderIndex - right.orderIndex
      )[0];

    if (earliestUpcomingPhase) {
      const baselinePriceId =
        scheduleMap.get(earliestUpcomingPhase.scheduleId)?.baselinePriceId ?? null;
      if (baselinePriceId) {
        const priceRows = await db
          .select()
          .from(prices)
          .where(eq(prices.id, baselinePriceId))
          .limit(1);
        return priceRows[0] ?? null;
      }
    }
  }

  return loadCurrentPriceForSubscription(subscriptionId);
}

export async function findMeteredSubscriptionsForCustomer(
  customerId: string,
  meterId: string,
  statuses: SubscriptionStatus[] = ["active", "past_due"],
  eventTimestamp = new Date()
): Promise<MatchedMeteredSubscription[]> {
  await ensureTables();
  const db = getDb();

  const subscriptionRows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, customerId),
        inArray(subscriptions.status, statuses)
      )
    );

  const matches: MatchedMeteredSubscription[] = [];

  for (const subscriptionRow of subscriptionRows) {
    const price = await resolvePriceForSubscriptionAt(
      subscriptionRow.id,
      eventTimestamp
    );
    if (!price || price.meter !== meterId) {
      continue;
    }

    matches.push({ subscription: subscriptionRow, price });
  }

  return matches;
}

async function assertExactlyOneMeteredSubscription(
  customerId: string,
  meterId: string,
  eventTimestamp: Date
) {
  const matches = await findMeteredSubscriptionsForCustomer(
    customerId,
    meterId,
    ["active", "past_due"],
    eventTimestamp
  );

  if (matches.length === 0) {
    throw new MeterEventError(
      "invalid_request",
      `No active subscription for customer '${customerId}' uses meter '${meterId}' at this event timestamp`
    );
  }

  if (matches.length > 1) {
    throw new MeterEventError(
      "invalid_request",
      `Multiple active subscriptions for customer '${customerId}' use meter '${meterId}' at this event timestamp`
    );
  }
}

export async function createMeterEvent(
  input: CreateMeterEventInput
): Promise<{ created: boolean; event: MeterEvent }> {
  await ensureTables();
  const db = getDb();

  const identifier = input.identifier ?? `mtrid_${nanoid()}`;

  const existingRows = await db
    .select()
    .from(meterEvents)
    .where(eq(meterEvents.identifier, identifier))
    .limit(1);

  if (existingRows[0]) {
    return { created: false, event: toMeterEvent(existingRows[0]) };
  }

  const meter = await getMeterByEventName(input.event_name);
  if (!meter) {
    throw new MeterEventError(
      "invalid_request",
      `No such meter for event_name: '${input.event_name}'`
    );
  }
  if (meter.status !== "active") {
    throw new MeterEventError(
      "invalid_request",
      `Meter '${meter.id}' is not active`
    );
  }

  await assertCustomerExists(input.payload.stripe_customer_id);

  const now = Math.floor(Date.now() / 1000);
  const timestamp = input.timestamp ?? now;

  if (timestamp < now - MAX_EVENT_AGE_SECONDS) {
    throw new MeterEventError(
      "invalid_request",
      "timestamp must be within the last 35 days"
    );
  }

  if (timestamp > now + MAX_FUTURE_SKEW_SECONDS) {
    throw new MeterEventError(
      "invalid_request",
      "timestamp cannot be more than 5 minutes in the future"
    );
  }

  const createdAt = new Date();
  const eventTimestamp = new Date(timestamp * 1000);
  await assertExactlyOneMeteredSubscription(
    input.payload.stripe_customer_id,
    meter.id,
    eventTimestamp
  );

  const [row] = await db
    .insert(meterEvents)
    .values({
      id: `mtevt_${nanoid()}`,
      meterId: meter.id,
      customerId: input.payload.stripe_customer_id,
      identifier,
      eventName: input.event_name,
      value: input.payload.value,
      eventTimestamp,
      livemode: false,
      createdAt,
      updatedAt: createdAt,
    })
    .returning();

  return { created: true, event: toMeterEvent(row) };
}

export async function createMeterEventBulk(
  input: CreateMeterEventInput
): Promise<{ created: boolean; event: MeterEvent }> {
  const count = input.count ?? 1;

  if (count === 1) {
    return createMeterEvent(input);
  }

  await ensureTables();
  const db = getDb();

  const meter = await getMeterByEventName(input.event_name);
  if (!meter) {
    throw new MeterEventError(
      "invalid_request",
      `No such meter for event_name: '${input.event_name}'`
    );
  }
  if (meter.status !== "active") {
    throw new MeterEventError(
      "invalid_request",
      `Meter '${meter.id}' is not active`
    );
  }

  await assertCustomerExists(input.payload.stripe_customer_id);

  const now = Math.floor(Date.now() / 1000);
  const timestamp = input.timestamp ?? now;

  if (timestamp < now - MAX_EVENT_AGE_SECONDS) {
    throw new MeterEventError(
      "invalid_request",
      "timestamp must be within the last 35 days"
    );
  }

  if (timestamp > now + MAX_FUTURE_SKEW_SECONDS) {
    throw new MeterEventError(
      "invalid_request",
      "timestamp cannot be more than 5 minutes in the future"
    );
  }

  const createdAt = new Date();
  const eventTimestamp = new Date(timestamp * 1000);
  await assertExactlyOneMeteredSubscription(
    input.payload.stripe_customer_id,
    meter.id,
    eventTimestamp
  );

  const values = Array.from({ length: count }, () => ({
    id: `mtevt_${nanoid()}`,
    meterId: meter.id,
    customerId: input.payload.stripe_customer_id,
    identifier: `mtrid_${nanoid()}`,
    eventName: input.event_name,
    value: input.payload.value,
    eventTimestamp,
    livemode: false,
    createdAt,
    updatedAt: createdAt,
  }));

  const rows = await db.insert(meterEvents).values(values).returning();

  return { created: true, event: toMeterEvent(rows[0]) };
}

export async function listMeterEventSummaries(
  meterId: string,
  params: ListMeterEventSummariesParams
): Promise<StripeMeterEventSummaryList> {
  await ensureTables();

  const meter = await getMeterById(meterId);
  if (!meter) {
    throw new MeterEventError("not_found", `No such meter: '${meterId}'`);
  }

  await assertCustomerExists(params.customer);

  const rows = await loadMeterEvents(meter.id,
    params.customer,
    params.start_time,
    params.end_time
  );

  let data: MeterEventSummary[];

  if (!params.value_grouping_window) {
    data = [
      toMeterEventSummary(
        meter,
        params.start_time,
        params.end_time,
        aggregateMeterValues(meter.defaultAggregation, rows)
      ),
    ];
  } else {
    const buckets = new Map<number, MeterEventRow[]>();

    for (const row of rows) {
      const timestamp = Math.floor(row.eventTimestamp.getTime() / 1000);
      const bucketStart = floorWindowStart(timestamp, params.value_grouping_window);
      const existing = buckets.get(bucketStart) ?? [];
      existing.push(row);
      buckets.set(bucketStart, existing);
    }

    data = [...buckets.entries()]
      .sort((left, right) => right[0] - left[0])
      .map(([bucketStart, bucketRows]) =>
        toMeterEventSummary(
          meter,
          Math.max(bucketStart, params.start_time),
          Math.min(addWindow(bucketStart, params.value_grouping_window!), params.end_time),
          aggregateMeterValues(meter.defaultAggregation, bucketRows)
        )
      );
  }

  return {
    object: "list",
    data,
    has_more: false,
    url: `/api/billing/meters/${meter.id}/event_summaries`,
  };
}

export async function getMeterUsageTotal(
  meterId: string,
  customerId: string,
  startTime: number,
  endTime: number
) {
  await ensureTables();

  const meter = await getMeterById(meterId);
  if (!meter) {
    throw new MeterEventError("not_found", `No such meter: '${meterId}'`);
  }

  const rows = await loadMeterEvents(meter.id,
    customerId,
    startTime,
    endTime
  );

  return aggregateMeterValues(meter.defaultAggregation, rows);
}
