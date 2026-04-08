import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  prices,
  subscriptionItems,
  subscriptionSchedulePhases,
  subscriptionSchedules,
  subscriptions,
} from "@/infrastructure/database/schema";
import { toUnix } from "@/modules/shared/time";
import type {
  CreateSubscriptionScheduleInput,
  ListSubscriptionSchedulesParams,
  StripeSubscriptionScheduleList,
  SubscriptionSchedule,
  UpdateSubscriptionScheduleInput,
} from "./types";

type ScheduleRow = typeof subscriptionSchedules.$inferSelect;
type PhaseRow = typeof subscriptionSchedulePhases.$inferSelect;

export class SubscriptionScheduleError extends Error {
  code:
    | "not_found"
    | "subscription_not_found"
    | "invalid_subscription_status"
    | "schedule_already_exists"
    | "invalid_phase_price"
    | "invalid_schedule_status"
    | "invalid_phase_modification"
    | "invalid_phase_timeline";

  constructor(code: SubscriptionScheduleError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function toPhaseApi(row: PhaseRow) {
  return {
    price: row.priceId,
    start_date: Math.floor(row.startDate.getTime() / 1000),
    end_date: Math.floor(row.endDate.getTime() / 1000),
  };
}

function toScheduleApi(
  row: ScheduleRow,
  phaseRows: PhaseRow[]
): SubscriptionSchedule {
  const now = Date.now();
  const currentPhase = phaseRows.find(
    (p) => p.startDate.getTime() <= now && p.endDate.getTime() > now
  );

  return {
    id: row.id,
    object: "subscription_schedule",
    subscription: row.subscriptionId,
    status: row.status,
    end_behavior: row.endBehavior,
    current_phase: currentPhase
      ? {
          start_date: Math.floor(currentPhase.startDate.getTime() / 1000),
          end_date: Math.floor(currentPhase.endDate.getTime() / 1000),
        }
      : null,
    phases: phaseRows.map(toPhaseApi),
    released_at: toUnix(row.releasedAt),
    canceled_at: toUnix(row.canceledAt),
    completed_at: toUnix(row.completedAt),
    livemode: row.livemode,
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

async function loadPhases(scheduleId: string): Promise<PhaseRow[]> {
  const db = getDb();
  return db
    .select()
    .from(subscriptionSchedulePhases)
    .where(eq(subscriptionSchedulePhases.scheduleId, scheduleId))
    .orderBy(asc(subscriptionSchedulePhases.orderIndex));
}

function ensureScheduleStillRelevant(
  phaseEndTimestamps: number[],
  nowUnix: number
) {
  const lastPhaseEnd = phaseEndTimestamps[phaseEndTimestamps.length - 1];
  if (lastPhaseEnd <= nowUnix) {
    throw new SubscriptionScheduleError(
      "invalid_phase_timeline",
      "At least one phase must end in the future"
    );
  }
}

function assertPriceCompatible(
  phasePrice: typeof prices.$inferSelect,
  currentPrice: typeof prices.$inferSelect
) {
  if (!phasePrice.active) {
    throw new SubscriptionScheduleError(
      "invalid_phase_price",
      `Price '${phasePrice.id}' is not active`
    );
  }

  if (phasePrice.type !== "recurring" || !phasePrice.recurringInterval) {
    throw new SubscriptionScheduleError(
      "invalid_phase_price",
      `Price '${phasePrice.id}' must be a recurring price`
    );
  }

  if (phasePrice.recurringInterval !== currentPrice.recurringInterval) {
    throw new SubscriptionScheduleError(
      "invalid_phase_price",
      `Price '${phasePrice.id}' must have the same recurring interval as the subscription's current price`
    );
  }

  if (phasePrice.currency !== currentPrice.currency) {
    throw new SubscriptionScheduleError(
      "invalid_phase_price",
      `Price '${phasePrice.id}' must use the same currency as the subscription's current price`
    );
  }

  const currentMeter = currentPrice.meter ?? null;
  const phaseMeter = phasePrice.meter ?? null;
  if (currentMeter !== phaseMeter) {
    throw new SubscriptionScheduleError(
      "invalid_phase_price",
      `Price '${phasePrice.id}' must keep the same usage type as the subscription's current price`
    );
  }
}

export async function createSubscriptionSchedule(
  input: CreateSubscriptionScheduleInput
): Promise<SubscriptionSchedule> {
  await ensureTables();
  const db = getDb();
  const now = new Date();
  const nowUnix = Math.floor(now.getTime() / 1000);

  const subRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, input.subscription))
    .limit(1);

  const sub = subRows[0];
  if (!sub) {
    throw new SubscriptionScheduleError(
      "subscription_not_found",
      `No such subscription: '${input.subscription}'`
    );
  }

  if (sub.status === "canceled") {
    throw new SubscriptionScheduleError(
      "invalid_subscription_status",
      "Cannot create a schedule for a canceled subscription"
    );
  }

  const existingSchedules = await db
    .select({ id: subscriptionSchedules.id })
    .from(subscriptionSchedules)
    .where(
      and(
        eq(subscriptionSchedules.subscriptionId, input.subscription),
        inArray(subscriptionSchedules.status, ["not_started", "active"])
      )
    )
    .limit(1);

  if (existingSchedules.length > 0) {
    throw new SubscriptionScheduleError(
      "schedule_already_exists",
      "This subscription already has an active or pending schedule"
    );
  }

  const itemRows = await db
    .select()
    .from(subscriptionItems)
    .where(eq(subscriptionItems.subscriptionId, sub.id))
    .limit(1);

  const currentItem = itemRows[0];
  if (!currentItem) {
    throw new SubscriptionScheduleError(
      "subscription_not_found",
      "Subscription has no items"
    );
  }

  const currentPriceRows = await db
    .select()
    .from(prices)
    .where(eq(prices.id, currentItem.priceId))
    .limit(1);

  const currentPrice = currentPriceRows[0];
  if (!currentPrice) {
    throw new SubscriptionScheduleError(
      "invalid_phase_price",
      "Current subscription price not found"
    );
  }

  ensureScheduleStillRelevant(
    input.phases.map((phase) => phase.end_date),
    nowUnix
  );

  const phasePriceIds = [...new Set(input.phases.map((p) => p.price))];
  const phasePriceRows = await db
    .select()
    .from(prices)
    .where(inArray(prices.id, phasePriceIds));

  const phasePriceMap = new Map(phasePriceRows.map((p) => [p.id, p]));

  for (const phase of input.phases) {
    const price = phasePriceMap.get(phase.price);
    if (!price) {
      throw new SubscriptionScheduleError(
        "invalid_phase_price",
        `No such price: '${phase.price}'`
      );
    }

    assertPriceCompatible(price, currentPrice);
  }

  const scheduleId = `sub_sched_${nanoid()}`;
  const phaseValues = input.phases.map((phase, i) => ({
    id: `ss_phase_${nanoid()}`,
    scheduleId,
    priceId: phase.price,
    startDate: new Date(phase.start_date * 1000),
    endDate: new Date(phase.end_date * 1000),
    orderIndex: i,
    createdAt: now,
    updatedAt: now,
  }));

  const currentPhaseValue = phaseValues.find(
    (p) => p.startDate.getTime() <= now.getTime() && p.endDate.getTime() > now.getTime()
  );
  const firstPhaseStart = new Date(input.phases[0].start_date * 1000);
  const status =
    firstPhaseStart.getTime() <= now.getTime() && currentPhaseValue
      ? "active"
      : "not_started";

  await db.transaction(async (tx) => {
    await tx.insert(subscriptionSchedules).values({
      id: scheduleId,
      subscriptionId: input.subscription,
      baselinePriceId: currentPrice.id,
      status,
      endBehavior: input.end_behavior,
      currentPhaseId: currentPhaseValue?.id ?? null,
      releasedAt: null,
      canceledAt: null,
      completedAt: null,
      livemode: sub.livemode,
      createdAt: now,
      updatedAt: now,
    });

    for (const pv of phaseValues) {
      await tx.insert(subscriptionSchedulePhases).values(pv);
    }

    if (currentPhaseValue) {
      await tx
        .update(subscriptionItems)
        .set({
          priceId: currentPhaseValue.priceId,
          updatedAt: now,
        })
        .where(eq(subscriptionItems.id, currentItem.id));
    }
  });

  const phases = await loadPhases(scheduleId);
  const scheduleRows = await db
    .select()
    .from(subscriptionSchedules)
    .where(eq(subscriptionSchedules.id, scheduleId))
    .limit(1);

  return toScheduleApi(scheduleRows[0], phases);
}

export async function getSubscriptionSchedule(
  scheduleId: string
): Promise<SubscriptionSchedule | null> {
  await ensureTables();
  const db = getDb();

  const rows = await db
    .select()
    .from(subscriptionSchedules)
    .where(eq(subscriptionSchedules.id, scheduleId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const phases = await loadPhases(scheduleId);
  return toScheduleApi(row, phases);
}

export async function updateSubscriptionSchedule(
  scheduleId: string,
  input: UpdateSubscriptionScheduleInput
): Promise<SubscriptionSchedule> {
  await ensureTables();
  const db = getDb();
  const now = new Date();
  const nowUnix = Math.floor(now.getTime() / 1000);

  const rows = await db
    .select()
    .from(subscriptionSchedules)
    .where(eq(subscriptionSchedules.id, scheduleId))
    .limit(1);

  const schedule = rows[0];
  if (!schedule) {
    throw new SubscriptionScheduleError(
      "not_found",
      `No such subscription schedule: '${scheduleId}'`
    );
  }

  if (schedule.status !== "active" && schedule.status !== "not_started") {
    throw new SubscriptionScheduleError(
      "invalid_schedule_status",
      `Cannot update a schedule with status '${schedule.status}'`
    );
  }

  const existingPhases = await loadPhases(scheduleId);
  const immutablePhases = existingPhases.filter(
    (p) => p.startDate.getTime() < now.getTime()
  );
  const latestImmutable = immutablePhases[immutablePhases.length - 1] ?? null;

  ensureScheduleStillRelevant(
    input.phases.map((phase) => phase.end_date),
    nowUnix
  );

  if (latestImmutable) {
    const firstNewStart = input.phases[0].start_date;
    const immutableEnd = Math.floor(latestImmutable.endDate.getTime() / 1000);
    if (firstNewStart !== immutableEnd) {
      throw new SubscriptionScheduleError(
        "invalid_phase_modification",
        "Updated phases must start exactly when the current immutable phase chain ends"
      );
    }
  }

  const phasePriceIds = [...new Set(input.phases.map((p) => p.price))];
  const phasePriceRows = await db
    .select()
    .from(prices)
    .where(inArray(prices.id, phasePriceIds));

  const phasePriceMap = new Map(phasePriceRows.map((p) => [p.id, p]));

  const itemRows = await db
    .select()
    .from(subscriptionItems)
    .where(eq(subscriptionItems.subscriptionId, schedule.subscriptionId))
    .limit(1);

  const currentItem = itemRows[0];
  const currentPriceRows = currentItem
    ? await db
        .select()
        .from(prices)
        .where(eq(prices.id, schedule.baselinePriceId))
        .limit(1)
    : [];

  const currentPrice = currentPriceRows[0];

  for (const phase of input.phases) {
    const price = phasePriceMap.get(phase.price);
    if (!price) {
      throw new SubscriptionScheduleError(
        "invalid_phase_price",
        `No such price: '${phase.price}'`
      );
    }

    if (currentPrice) {
      assertPriceCompatible(price, currentPrice);
    }
  }

  const newPhaseValues = input.phases.map((phase, i) => ({
    id: `ss_phase_${nanoid()}`,
    scheduleId,
    priceId: phase.price,
    startDate: new Date(phase.start_date * 1000),
    endDate: new Date(phase.end_date * 1000),
    orderIndex: immutablePhases.length + i,
    createdAt: now,
    updatedAt: now,
  }));

  const currentPhaseValue = newPhaseValues.find(
    (p) =>
      p.startDate.getTime() <= now.getTime() &&
      p.endDate.getTime() > now.getTime()
  );

  const futurePhaseIds = existingPhases
    .filter((p) => p.startDate.getTime() >= now.getTime())
    .map((p) => p.id);

  await db.transaction(async (tx) => {
    if (futurePhaseIds.length > 0) {
      for (const id of futurePhaseIds) {
        await tx
          .delete(subscriptionSchedulePhases)
          .where(eq(subscriptionSchedulePhases.id, id));
      }
    }

    for (const pv of newPhaseValues) {
      await tx.insert(subscriptionSchedulePhases).values(pv);
    }

    const firstPhaseStart = newPhaseValues[0]?.startDate ?? null;
    const activeNewPhase = newPhaseValues.find(
      (p) =>
        p.startDate.getTime() <= now.getTime() &&
        p.endDate.getTime() > now.getTime()
    );
    const activeImmutablePhase = immutablePhases.find(
      (p) =>
        p.startDate.getTime() <= now.getTime() &&
        p.endDate.getTime() > now.getTime()
    );
    const activeCurrentId =
      activeNewPhase?.id ?? activeImmutablePhase?.id ?? schedule.currentPhaseId;

    const status =
      schedule.status === "not_started" &&
      firstPhaseStart &&
      firstPhaseStart.getTime() <= now.getTime()
        ? "active"
        : schedule.status;

    await tx
      .update(subscriptionSchedules)
      .set({
        endBehavior: input.end_behavior ?? schedule.endBehavior,
        currentPhaseId: activeCurrentId,
        status,
        updatedAt: now,
      })
      .where(eq(subscriptionSchedules.id, scheduleId));

    if (currentPhaseValue && currentItem) {
      await tx
        .update(subscriptionItems)
        .set({
          priceId: currentPhaseValue.priceId,
          updatedAt: now,
        })
        .where(eq(subscriptionItems.id, currentItem.id));
    }
  });

  const updatedRows = await db
    .select()
    .from(subscriptionSchedules)
    .where(eq(subscriptionSchedules.id, scheduleId))
    .limit(1);

  const phases = await loadPhases(scheduleId);
  return toScheduleApi(updatedRows[0], phases);
}

export async function cancelSubscriptionSchedule(
  scheduleId: string
): Promise<SubscriptionSchedule> {
  await ensureTables();
  const db = getDb();
  const now = new Date();

  const rows = await db
    .select()
    .from(subscriptionSchedules)
    .where(eq(subscriptionSchedules.id, scheduleId))
    .limit(1);

  const schedule = rows[0];
  if (!schedule) {
    throw new SubscriptionScheduleError(
      "not_found",
      `No such subscription schedule: '${scheduleId}'`
    );
  }

  if (schedule.status !== "active" && schedule.status !== "not_started") {
    throw new SubscriptionScheduleError(
      "invalid_schedule_status",
      `Cannot cancel a schedule with status '${schedule.status}'`
    );
  }

  const [updated] = await db
    .update(subscriptionSchedules)
    .set({
      status: "canceled",
      canceledAt: now,
      currentPhaseId: null,
      updatedAt: now,
    })
    .where(eq(subscriptionSchedules.id, scheduleId))
    .returning();

  const phases = await loadPhases(scheduleId);
  return toScheduleApi(updated, phases);
}

export async function releaseSubscriptionSchedule(
  scheduleId: string
): Promise<SubscriptionSchedule> {
  await ensureTables();
  const db = getDb();
  const now = new Date();

  const rows = await db
    .select()
    .from(subscriptionSchedules)
    .where(eq(subscriptionSchedules.id, scheduleId))
    .limit(1);

  const schedule = rows[0];
  if (!schedule) {
    throw new SubscriptionScheduleError(
      "not_found",
      `No such subscription schedule: '${scheduleId}'`
    );
  }

  if (schedule.status !== "active" && schedule.status !== "not_started") {
    throw new SubscriptionScheduleError(
      "invalid_schedule_status",
      `Cannot release a schedule with status '${schedule.status}'`
    );
  }

  const [updated] = await db
    .update(subscriptionSchedules)
    .set({
      status: "released",
      releasedAt: now,
      currentPhaseId: null,
      updatedAt: now,
    })
    .where(eq(subscriptionSchedules.id, scheduleId))
    .returning();

  const phases = await loadPhases(scheduleId);
  return toScheduleApi(updated, phases);
}

export async function listSubscriptionSchedules(
  params: ListSubscriptionSchedulesParams
): Promise<StripeSubscriptionScheduleList> {
  await ensureTables();
  const db = getDb();

  const limit = params.limit ?? 10;
  const conditions = [];

  if (params.subscription) {
    conditions.push(
      eq(subscriptionSchedules.subscriptionId, params.subscription)
    );
  }

  if (params.status) {
    conditions.push(eq(subscriptionSchedules.status, params.status));
  }

  if (params.starting_after) {
    const cursor = await db
      .select({ createdAt: subscriptionSchedules.createdAt })
      .from(subscriptionSchedules)
      .where(eq(subscriptionSchedules.id, params.starting_after))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(lt(subscriptionSchedules.createdAt, cursor[0].createdAt));
    }
  }

  if (params.ending_before) {
    const cursor = await db
      .select({ createdAt: subscriptionSchedules.createdAt })
      .from(subscriptionSchedules)
      .where(eq(subscriptionSchedules.id, params.ending_before))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(gt(subscriptionSchedules.createdAt, cursor[0].createdAt));
    }
  }

  const rows = await db
    .select()
    .from(subscriptionSchedules)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(subscriptionSchedules.createdAt), desc(subscriptionSchedules.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = await Promise.all(
    rows.slice(0, limit).map(async (row) => {
      const phases = await loadPhases(row.id);
      return toScheduleApi(row, phases);
    })
  );

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: "/api/subscription_schedules",
  };
}
