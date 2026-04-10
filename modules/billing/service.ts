import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  billingProcessorState,
  invoiceLineItems,
  invoices,
  meterEvents,
  meters,
  prices,
  subscriptionItems,
  subscriptionSchedulePhases,
  subscriptionSchedules,
  subscriptions,
} from "@/infrastructure/database/schema";
import {
  multiplyDecimalByFractionAndRound,
  multiplyIntegerByDecimalAndRound,
} from "@/modules/shared/fixed-decimal";
import { addRecurringInterval, toUnix } from "@/modules/shared/time";
import type {
  BillingProcessorState,
  BillingProcessorSummary,
  ProcessDueSubscriptionsOptions,
} from "./types";

const PROCESSOR_STATE_ID = "subscription_billing";
const PROCESSOR_LEASE_MS = 5 * 60 * 1000;

type SubscriptionRow = typeof subscriptions.$inferSelect;
type PriceRow = typeof prices.$inferSelect;
type MeterRow = typeof meters.$inferSelect;
type MeterEventRow = typeof meterEvents.$inferSelect;

type LoadedRenewableSubscription = {
  subscription: SubscriptionRow;
  price: PriceRow;
};

type InvoiceLineItemValue = {
  priceId: string;
  billingReason: typeof invoiceLineItems.$inferInsert.billingReason;
  quantity: number;
  amount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  meterEventIds: string[];
};

type PriceSegment = {
  price: PriceRow;
  segmentStart: Date;
  segmentEnd: Date;
};

type EffectiveSchedulePhase = {
  scheduleId: string;
  priceId: string;
  startDate: Date;
  endDate: Date;
  orderIndex: number;
};

export class BillingCycleError extends Error {
  code: "not_found" | "already_canceled" | "not_due" | "invalid_state";

  constructor(code: BillingCycleError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function emptySummary(): BillingProcessorSummary {
  return {
    processed_subscriptions: 0,
    canceled_subscriptions: 0,
    created_invoices: 0,
    refreshed_drafts: 0,
    past_due_invoices: 0,
  };
}

function toProcessorState(
  row: typeof billingProcessorState.$inferSelect
): BillingProcessorState {
  const summary = row.lastSummary as Partial<BillingProcessorSummary>;

  return {
    id: row.id,
    lease_owner: row.leaseOwner,
    lease_expires_at: toUnix(row.leaseExpiresAt),
    last_started_at: toUnix(row.lastStartedAt),
    last_finished_at: toUnix(row.lastFinishedAt),
    last_error: row.lastError,
    last_summary:
      Object.keys(summary).length === 0
        ? null
        : {
            processed_subscriptions: Number(summary.processed_subscriptions ?? 0),
            canceled_subscriptions: Number(summary.canceled_subscriptions ?? 0),
            created_invoices: Number(summary.created_invoices ?? 0),
            refreshed_drafts: Number(summary.refreshed_drafts ?? 0),
            past_due_invoices: Number(summary.past_due_invoices ?? 0),
          },
    updated_at: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

async function ensureProcessorStateRow() {
  const db = getDb();
  const existing = await db
    .select()
    .from(billingProcessorState)
    .where(eq(billingProcessorState.id, PROCESSOR_STATE_ID))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const now = new Date();
  const [created] = await db
    .insert(billingProcessorState)
    .values({
      id: PROCESSOR_STATE_ID,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastError: null,
      lastSummary: {},
      updatedAt: now,
    })
    .returning();

  return created;
}

async function acquireLease(runAt: Date, trigger: string) {
  const db = getDb();
  const leaseOwner = `${trigger}-${nanoid()}`;

  await ensureProcessorStateRow();

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(billingProcessorState)
      .where(eq(billingProcessorState.id, PROCESSOR_STATE_ID))
      .limit(1);

    const state = rows[0];
    if (
      state?.leaseOwner &&
      state.leaseExpiresAt &&
      state.leaseExpiresAt.getTime() > runAt.getTime()
    ) {
      throw new Error("Billing processor is already running");
    }

    const [updated] = await tx
      .update(billingProcessorState)
      .set({
        leaseOwner,
        leaseExpiresAt: new Date(runAt.getTime() + PROCESSOR_LEASE_MS),
        lastStartedAt: runAt,
        lastError: null,
        updatedAt: runAt,
      })
      .where(eq(billingProcessorState.id, PROCESSOR_STATE_ID))
      .returning();

    return updated;
  });
}

async function releaseLease(
  runAt: Date,
  summary: BillingProcessorSummary,
  error: string | null
) {
  const db = getDb();
  await db
    .update(billingProcessorState)
    .set({
      leaseOwner: null,
      leaseExpiresAt: null,
      lastFinishedAt: runAt,
      lastError: error,
      lastSummary: summary,
      updatedAt: runAt,
    })
    .where(eq(billingProcessorState.id, PROCESSOR_STATE_ID));
}

async function clearLease(runAt: Date, error: string | null) {
  const db = getDb();
  await db
    .update(billingProcessorState)
    .set({
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: error,
      updatedAt: runAt,
    })
    .where(eq(billingProcessorState.id, PROCESSOR_STATE_ID));
}

export async function runWithBillingLease<T>(
  trigger: string,
  callback: (runAt: Date) => Promise<T>,
  runAt = new Date()
) {
  await ensureTables();
  await acquireLease(runAt, trigger);
  let errorMessage: string | null = null;

  try {
    return await callback(runAt);
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unknown billing lease error";
    throw error;
  } finally {
    await clearLease(runAt, errorMessage);
  }
}

async function loadPriceForSubscription(subscriptionId: string) {
  const db = getDb();
  const itemRows = await db
    .select()
    .from(subscriptionItems)
    .where(eq(subscriptionItems.subscriptionId, subscriptionId))
    .orderBy(asc(subscriptionItems.createdAt), asc(subscriptionItems.id))
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

  const price = priceRows[0];
  if (!price?.recurringInterval) {
    return null;
  }

  return price;
}

async function loadRenewableSubscription(
  subscriptionId: string
): Promise<LoadedRenewableSubscription | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);

  const subscription = rows[0];
  if (!subscription) {
    return null;
  }

  const price = await loadPriceForSubscription(subscription.id);
  if (!price) {
    return null;
  }

  return {
    subscription,
    price,
  };
}

async function loadDueSubscriptions(runAt: Date): Promise<LoadedRenewableSubscription[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        inArray(subscriptions.status, ["active", "past_due"]),
        eq(subscriptions.renewalMode, "automatic"),
        lte(subscriptions.currentPeriodEnd, runAt)
      )
    )
    .orderBy(
      asc(subscriptions.currentPeriodEnd),
      asc(subscriptions.createdAt),
      asc(subscriptions.id)
    );

  const loaded: LoadedRenewableSubscription[] = [];

  for (const row of rows) {
    const price = await loadPriceForSubscription(row.id);
    if (!price) {
      continue;
    }

    loaded.push({
      subscription: row,
      price,
    });
  }

  return loaded;
}

function mergeAdjacentSegments(segments: PriceSegment[]) {
  const merged: PriceSegment[] = [];

  for (const segment of segments) {
    if (segment.segmentStart.getTime() >= segment.segmentEnd.getTime()) {
      continue;
    }

    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.price.id === segment.price.id &&
      previous.segmentEnd.getTime() === segment.segmentStart.getTime()
    ) {
      previous.segmentEnd = segment.segmentEnd;
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
}

async function getScheduleSegments(
  subscriptionId: string,
  periodStart: Date,
  periodEnd: Date,
  defaultPrice: PriceRow
): Promise<PriceSegment[] | null> {
  const db = getDb();

  const scheduleRows = await db
    .select()
    .from(subscriptionSchedules)
    .where(eq(subscriptionSchedules.subscriptionId, subscriptionId));

  if (scheduleRows.length === 0) {
    return null;
  }

  const scheduleMap = new Map(scheduleRows.map((row) => [row.id, row]));
  const scheduleIds = scheduleRows.map((row) => row.id);

  const phaseRows = await db
    .select()
    .from(subscriptionSchedulePhases)
    .where(inArray(subscriptionSchedulePhases.scheduleId, scheduleIds))
    .orderBy(
      asc(subscriptionSchedulePhases.startDate),
      asc(subscriptionSchedulePhases.orderIndex)
    );

  const effectivePhases: EffectiveSchedulePhase[] = [];

  for (const phase of phaseRows) {
    const schedule = scheduleMap.get(phase.scheduleId);
    if (!schedule) {
      continue;
    }

    const terminalAt =
      schedule.canceledAt ?? schedule.releasedAt ?? schedule.completedAt ?? null;

    if (terminalAt && phase.startDate.getTime() >= terminalAt.getTime()) {
      continue;
    }

    const effectiveEnd = terminalAt
      ? new Date(Math.min(phase.endDate.getTime(), terminalAt.getTime()))
      : phase.endDate;

    if (
      phase.startDate.getTime() >= periodEnd.getTime() ||
      effectiveEnd.getTime() <= periodStart.getTime()
    ) {
      continue;
    }

    effectivePhases.push({
      scheduleId: phase.scheduleId,
      priceId: phase.priceId,
      startDate: phase.startDate,
      endDate: effectiveEnd,
      orderIndex: phase.orderIndex,
    });
  }

  const phasePriceIds = [
    ...new Set([
      defaultPrice.id,
      ...scheduleRows.map((row) => row.baselinePriceId),
      ...effectivePhases.map((phase) => phase.priceId),
    ]),
  ];
  const phasePriceRows = await db
    .select()
    .from(prices)
    .where(inArray(prices.id, phasePriceIds));

  const phasePriceMap = new Map(phasePriceRows.map((price) => [price.id, price]));

  if (effectivePhases.length === 0) {
    const earliestPhase = [...phaseRows].sort(
      (left, right) =>
        left.startDate.getTime() - right.startDate.getTime() ||
        left.orderIndex - right.orderIndex
    )[0];

    if (!earliestPhase || periodEnd.getTime() > earliestPhase.startDate.getTime()) {
      return null;
    }

    const baselinePrice = phasePriceMap.get(
      scheduleMap.get(earliestPhase.scheduleId)?.baselinePriceId ?? ""
    );

    if (!baselinePrice) {
      return null;
    }

    return [
      {
        price: baselinePrice,
        segmentStart: periodStart,
        segmentEnd: periodEnd,
      },
    ];
  }

  const activeAtPeriodStart = [...effectivePhases]
    .filter(
      (phase) =>
        phase.startDate.getTime() <= periodStart.getTime() &&
        phase.endDate.getTime() > periodStart.getTime()
    )
    .sort(
      (left, right) =>
        right.startDate.getTime() - left.startDate.getTime() ||
        right.orderIndex - left.orderIndex
    )[0];

  const latestPhaseBeforePeriodStart = [...effectivePhases]
    .filter((phase) => phase.startDate.getTime() < periodStart.getTime())
    .sort(
      (left, right) =>
        right.startDate.getTime() - left.startDate.getTime() ||
        right.orderIndex - left.orderIndex
    )[0];

  const earliestUpcomingPhase = [...effectivePhases].sort(
    (left, right) =>
      left.startDate.getTime() - right.startDate.getTime() ||
      left.orderIndex - right.orderIndex
  )[0];

  let currentPrice =
    (activeAtPeriodStart && phasePriceMap.get(activeAtPeriodStart.priceId)) ??
    (latestPhaseBeforePeriodStart &&
      phasePriceMap.get(latestPhaseBeforePeriodStart.priceId)) ??
    (earliestUpcomingPhase &&
      phasePriceMap.get(
        scheduleMap.get(earliestUpcomingPhase.scheduleId)?.baselinePriceId ?? ""
      )) ??
    defaultPrice;

  const segments: PriceSegment[] = [];
  let cursor = periodStart;

  for (const phase of effectivePhases) {
    const phasePrice = phasePriceMap.get(phase.priceId);
    if (!phasePrice) {
      continue;
    }

    const phaseStart = new Date(
      Math.max(phase.startDate.getTime(), periodStart.getTime())
    );
    const phaseEnd = new Date(
      Math.min(phase.endDate.getTime(), periodEnd.getTime())
    );

    if (phaseEnd.getTime() <= cursor.getTime()) {
      currentPrice = phasePrice;
      continue;
    }

    if (cursor.getTime() < phaseStart.getTime()) {
      segments.push({
        price: currentPrice,
        segmentStart: cursor,
        segmentEnd: phaseStart,
      });
    }

    const segmentStart = new Date(
      Math.max(cursor.getTime(), phaseStart.getTime())
    );
    if (segmentStart.getTime() < phaseEnd.getTime()) {
      segments.push({
        price: phasePrice,
        segmentStart,
        segmentEnd: phaseEnd,
      });
      cursor = phaseEnd;
    }

    currentPrice = phasePrice;
  }

  if (cursor.getTime() < periodEnd.getTime()) {
    segments.push({
      price: currentPrice,
      segmentStart: cursor,
      segmentEnd: periodEnd,
    });
  }

  return mergeAdjacentSegments(segments);
}

async function getMeter(meterId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(meters)
    .where(eq(meters.id, meterId))
    .limit(1);

  return rows[0] ?? null;
}

function aggregateMeterValues(formula: MeterRow["defaultAggregation"], rows: MeterEventRow[]) {
  if (formula === "count") {
    return rows.length;
  }

  return rows.reduce((total, row) => total + row.value, 0);
}

async function loadUnbilledMeterEvents(
  meterId: string,
  customerId: string,
  endExclusive: Date
) {
  const db = getDb();
  return db
    .select()
    .from(meterEvents)
    .where(
      and(
        eq(meterEvents.meterId, meterId),
        eq(meterEvents.customerId, customerId),
        isNull(meterEvents.invoiceLineItemId),
        lt(meterEvents.eventTimestamp, endExclusive)
      )
    )
    .orderBy(asc(meterEvents.eventTimestamp), asc(meterEvents.id));
}

function getCycleWindowForTimestamp(
  anchorStart: Date,
  interval: "month" | "year",
  eventTimestamp: Date
) {
  let cycleStart = anchorStart;
  let cycleEnd = addRecurringInterval(cycleStart, interval);

  while (eventTimestamp.getTime() >= cycleEnd.getTime()) {
    cycleStart = cycleEnd;
    cycleEnd = addRecurringInterval(cycleStart, interval);
  }

  return { cycleStart, cycleEnd };
}

async function buildLicensedLineItems(
  subscription: SubscriptionRow,
  defaultPrice: PriceRow,
  usagePeriodStart: Date,
  usagePeriodEnd: Date,
  invoicePeriodStart: Date,
  invoicePeriodEnd: Date
) {
  const segments =
    (await getScheduleSegments(
      subscription.id,
      usagePeriodStart,
      usagePeriodEnd,
      defaultPrice
    )) ?? [
      {
        price: defaultPrice,
        segmentStart: usagePeriodStart,
        segmentEnd: usagePeriodEnd,
      },
    ];

  const totalPeriodMs = BigInt(
    usagePeriodEnd.getTime() - usagePeriodStart.getTime()
  );

  return segments.map((segment) => {
    const segmentMs = BigInt(
      segment.segmentEnd.getTime() - segment.segmentStart.getTime()
    );
    const amount =
      segments.length === 1 &&
      segment.segmentStart.getTime() === usagePeriodStart.getTime() &&
      segment.segmentEnd.getTime() === usagePeriodEnd.getTime()
        ? multiplyIntegerByDecimalAndRound(1, segment.price.unitAmountDecimal)
        : multiplyDecimalByFractionAndRound(
            segment.price.unitAmountDecimal,
            segmentMs,
            totalPeriodMs
          );

    return {
      priceId: segment.price.id,
      billingReason: "licensed_recurring" as const,
      quantity: 1,
      amount,
      currency: segment.price.currency,
      periodStart: invoicePeriodStart,
      periodEnd: invoicePeriodEnd,
      meterEventIds: [],
    };
  });
}

async function buildMeteredCycleLineItems(
  subscription: SubscriptionRow,
  meter: MeterRow,
  defaultPrice: PriceRow,
  cycleStart: Date,
  cycleEnd: Date,
  billingReason: "metered_recurring" | "metered_carryforward",
  events: MeterEventRow[],
  includeZeroLines: boolean
) {
  const segments =
    (await getScheduleSegments(subscription.id, cycleStart, cycleEnd, defaultPrice)) ??
    [
      {
        price: defaultPrice,
        segmentStart: cycleStart,
        segmentEnd: cycleEnd,
      },
    ];

  const items: InvoiceLineItemValue[] = [];

  for (const segment of segments) {
    const segmentEvents = events.filter(
      (event) =>
        event.eventTimestamp.getTime() >= segment.segmentStart.getTime() &&
        event.eventTimestamp.getTime() < segment.segmentEnd.getTime()
    );

    if (!includeZeroLines && segmentEvents.length === 0) {
      continue;
    }

    const quantity = aggregateMeterValues(meter.defaultAggregation, segmentEvents);
    const amount = multiplyIntegerByDecimalAndRound(
      quantity,
      segment.price.unitAmountDecimal
    );

    items.push({
      priceId: segment.price.id,
      billingReason,
      quantity,
      amount,
      currency: segment.price.currency,
      periodStart: cycleStart,
      periodEnd: cycleEnd,
      meterEventIds: segmentEvents.map((event) => event.id),
    });
  }

  return items;
}

async function buildLineItems(
  subscription: SubscriptionRow,
  defaultPrice: PriceRow,
  usagePeriodStart: Date,
  usagePeriodEnd: Date,
  invoicePeriodStart: Date,
  invoicePeriodEnd: Date
): Promise<InvoiceLineItemValue[]> {
  if (!defaultPrice.meter) {
    return buildLicensedLineItems(
      subscription,
      defaultPrice,
      usagePeriodStart,
      usagePeriodEnd,
      invoicePeriodStart,
      invoicePeriodEnd
    );
  }

  const meter = await getMeter(defaultPrice.meter);
  if (!meter) {
    throw new Error(`No such meter: '${defaultPrice.meter}'`);
  }

  const unbilledEvents = await loadUnbilledMeterEvents(
    defaultPrice.meter,
    subscription.customerId,
    usagePeriodEnd
  );
  const anchorStart =
    subscription.billingAnchorStart.getTime() <=
    subscription.currentPeriodStart.getTime()
      ? subscription.billingAnchorStart
      : subscription.currentPeriodStart;
  const eligibleEvents = unbilledEvents.filter(
    (event) => event.eventTimestamp.getTime() >= anchorStart.getTime()
  );

  const currentCycleEvents = eligibleEvents.filter(
    (event) =>
      event.eventTimestamp.getTime() >= usagePeriodStart.getTime() &&
      event.eventTimestamp.getTime() < usagePeriodEnd.getTime()
  );

  const carryforwardByCycle = new Map<string, MeterEventRow[]>();
  for (const event of eligibleEvents) {
    if (event.eventTimestamp.getTime() >= usagePeriodStart.getTime()) {
      continue;
    }

    const { cycleStart, cycleEnd } = getCycleWindowForTimestamp(
      anchorStart,
      defaultPrice.recurringInterval as "month" | "year",
      event.eventTimestamp
    );
    const key = `${cycleStart.toISOString()}::${cycleEnd.toISOString()}`;
    const existing = carryforwardByCycle.get(key) ?? [];
    existing.push(event);
    carryforwardByCycle.set(key, existing);
  }

  const carryforwardItems: InvoiceLineItemValue[] = [];
  const sortedCarryCycles = [...carryforwardByCycle.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );
  for (const [, cycleEvents] of sortedCarryCycles) {
    const { cycleStart, cycleEnd } = getCycleWindowForTimestamp(
      anchorStart,
      defaultPrice.recurringInterval as "month" | "year",
      cycleEvents[0]!.eventTimestamp
    );
    carryforwardItems.push(
      ...(await buildMeteredCycleLineItems(
        subscription,
        meter,
        defaultPrice,
        cycleStart,
        cycleEnd,
        "metered_carryforward",
        cycleEvents,
        false
      ))
    );
  }

  const currentCycleItems = await buildMeteredCycleLineItems(
    subscription,
    meter,
    defaultPrice,
    usagePeriodStart,
    usagePeriodEnd,
    "metered_recurring",
    currentCycleEvents,
    true
  );

  return [...carryforwardItems, ...currentCycleItems];
}

async function createInvoiceWithLineItems(
  loaded: LoadedRenewableSubscription,
  runAt: Date
) {
  const db = getDb();
  const { subscription, price } = loaded;

  const nextPeriodStart = subscription.currentPeriodEnd;
  const nextPeriodEnd = addRecurringInterval(
    subscription.currentPeriodEnd,
    price.recurringInterval as "month" | "year"
  );
  const usagePeriodStart = subscription.currentPeriodStart;
  const usagePeriodEnd = subscription.currentPeriodEnd;

  const existing = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.subscriptionId, subscription.id),
        eq(invoices.periodStart, nextPeriodStart),
        eq(invoices.periodEnd, nextPeriodEnd)
      )
    )
    .limit(1);

  const lineItems = await buildLineItems(
    subscription,
    price,
    usagePeriodStart,
    usagePeriodEnd,
    nextPeriodStart,
    nextPeriodEnd
  );
  const subtotal = lineItems.reduce((sum, lineItem) => sum + lineItem.amount, 0);
  const taxAmount = Math.round(subtotal * 0.21);

  const existingInvoice = existing[0] ?? null;
  if (existingInvoice && existingInvoice.status !== "draft") {
    return { invoiceId: existingInvoice.id, created: false, refreshed: false };
  }

  const invoiceId = existingInvoice?.id ?? `in_${nanoid()}`;

  await db.transaction(async (tx) => {
    if (existingInvoice) {
      const existingLineItems = await tx
        .select({ id: invoiceLineItems.id })
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, existingInvoice.id));

      if (existingLineItems.length > 0) {
        await tx
          .update(meterEvents)
          .set({
            invoiceLineItemId: null,
            updatedAt: runAt,
          })
          .where(
            inArray(
              meterEvents.invoiceLineItemId,
              existingLineItems.map((lineItem) => lineItem.id)
            )
          );

        await tx
          .delete(invoiceLineItems)
          .where(eq(invoiceLineItems.invoiceId, existingInvoice.id));
      }

      await tx
        .update(invoices)
        .set({
          status: "draft",
          collectionMethod: subscription.collectionMethod,
          currency: price.currency,
          subtotal,
          taxAmount,
          amountDue: subtotal + taxAmount,
          amountPaid: 0,
          paymentStatus: "pending",
          dueDate: null,
          autoAdvance: true,
          finalizedAt: null,
          invoicedAt: null,
          paidAt: null,
          legalDocument: null,
          updatedAt: runAt,
        })
        .where(eq(invoices.id, existingInvoice.id));
    } else {
      await tx.insert(invoices).values({
        id: invoiceId,
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        status: "draft",
        paymentStatus: "pending",
        collectionMethod: subscription.collectionMethod,
        currency: price.currency,
        subtotal,
        taxAmount,
        amountDue: subtotal + taxAmount,
        amountPaid: 0,
        dueDate: null,
        periodStart: nextPeriodStart,
        periodEnd: nextPeriodEnd,
        autoAdvance: true,
        finalizedAt: null,
        invoicedAt: null,
        paidAt: null,
        legalDocument: null,
        createdAt: runAt,
        updatedAt: runAt,
      });
    }

    for (const lineItem of lineItems) {
      const lineItemId = `il_${nanoid()}`;
      await tx.insert(invoiceLineItems).values({
        id: lineItemId,
        invoiceId,
        priceId: lineItem.priceId,
        billingReason: lineItem.billingReason,
        quantity: lineItem.quantity,
        amount: lineItem.amount,
        currency: lineItem.currency,
        periodStart: lineItem.periodStart,
        periodEnd: lineItem.periodEnd,
        createdAt: runAt,
        updatedAt: runAt,
      });

      if (lineItem.meterEventIds.length > 0) {
        await tx
          .update(meterEvents)
          .set({
            invoiceLineItemId: lineItemId,
            updatedAt: runAt,
          })
          .where(
            and(
              inArray(meterEvents.id, lineItem.meterEventIds),
              isNull(meterEvents.invoiceLineItemId)
            )
          );
      }
    }
  });

  return {
    invoiceId,
    created: !existingInvoice,
    refreshed: Boolean(existingInvoice),
  };
}

async function createRenewalInvoiceForLoadedSubscription(
  loaded: LoadedRenewableSubscription,
  runAt: Date
) {
  const { subscription } = loaded;

  if (subscription.cancelAtPeriodEnd) {
    throw new BillingCycleError(
      "invalid_state",
      "Subscriptions scheduled to cancel at period end cannot be closed manually"
    );
  }

  return createInvoiceWithLineItems(loaded, runAt);
}

export async function processSchedulePhaseTransitions(runAt: Date) {
  const db = getDb();

  const schedulableRows = await db
    .select()
    .from(subscriptionSchedules)
    .where(inArray(subscriptionSchedules.status, ["active", "not_started"]));

  for (const schedule of schedulableRows) {
    const phases = await db
      .select()
      .from(subscriptionSchedulePhases)
      .where(eq(subscriptionSchedulePhases.scheduleId, schedule.id))
      .orderBy(asc(subscriptionSchedulePhases.orderIndex));

    const currentPhase = phases.find(
      (phase) =>
        phase.startDate.getTime() <= runAt.getTime() &&
        phase.endDate.getTime() > runAt.getTime()
    );

    const lastPhase = phases[phases.length - 1];
    const allPhasesEnded =
      lastPhase && lastPhase.endDate.getTime() <= runAt.getTime();

    if (currentPhase) {
      await db
        .update(subscriptionSchedules)
        .set({
          status: "active",
          currentPhaseId: currentPhase.id,
          updatedAt: runAt,
        })
        .where(eq(subscriptionSchedules.id, schedule.id));

      await db
        .update(subscriptionItems)
        .set({
          priceId: currentPhase.priceId,
          updatedAt: runAt,
        })
        .where(eq(subscriptionItems.subscriptionId, schedule.subscriptionId));

      continue;
    }

    if (allPhasesEnded) {
      if (schedule.endBehavior === "cancel") {
        await db
          .update(subscriptionSchedules)
          .set({
            status: "completed",
            completedAt: runAt,
            currentPhaseId: null,
            updatedAt: runAt,
          })
          .where(eq(subscriptionSchedules.id, schedule.id));

        await db
          .update(subscriptions)
          .set({
            cancelAtPeriodEnd: true,
            updatedAt: runAt,
          })
          .where(eq(subscriptions.id, schedule.subscriptionId));
      } else {
        await db
          .update(subscriptionSchedules)
          .set({
            status: "released",
            releasedAt: runAt,
            currentPhaseId: null,
            updatedAt: runAt,
          })
          .where(eq(subscriptionSchedules.id, schedule.id));
      }
    }
  }
}

export async function createRenewalInvoices(runAt: Date) {
  await ensureTables();
  const dueSubscriptions = await loadDueSubscriptions(runAt);
  let canceledSubscriptions = 0;
  let createdInvoices = 0;
  let refreshedDrafts = 0;

  for (const loaded of dueSubscriptions) {
    if (loaded.subscription.cancelAtPeriodEnd) {
      const canceledAt = loaded.subscription.currentPeriodEnd;
      await getDb()
        .update(subscriptions)
        .set({
          status: "canceled",
          cancelAtPeriodEnd: false,
          canceledAt,
          endedAt: canceledAt,
          updatedAt: runAt,
        })
        .where(eq(subscriptions.id, loaded.subscription.id));
      canceledSubscriptions += 1;
      continue;
    }

    const result = await createRenewalInvoiceForLoadedSubscription(loaded, runAt);
    if (result.created) {
      createdInvoices += 1;
    } else if (result.refreshed) {
      refreshedDrafts += 1;
    }
  }

  return {
    processedSubscriptions: dueSubscriptions.length,
    canceledSubscriptions,
    createdInvoices,
    refreshedDrafts,
  };
}

export async function markOverdueInvoices(runAt: Date) {
  await ensureTables();
  const db = getDb();
  const overdueInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "sent"),
        eq(invoices.paymentStatus, "pending"),
        eq(invoices.collectionMethod, "send_invoice"),
        lte(invoices.dueDate, runAt),
        sql`${invoices.amountPaid} < ${invoices.amountDue}`
      )
    )
    .orderBy(asc(invoices.dueDate), asc(invoices.id));

  let pastDueInvoices = 0;

  for (const invoice of overdueInvoices) {
    await db.transaction(async (tx) => {
      await tx
        .update(invoices)
        .set({
          paymentStatus: "past_due",
          updatedAt: runAt,
        })
        .where(eq(invoices.id, invoice.id));

      await tx
        .update(subscriptions)
        .set({
          status: "past_due",
          updatedAt: runAt,
        })
        .where(
          and(
            eq(subscriptions.id, invoice.subscriptionId),
            or(
              eq(subscriptions.status, "active"),
              eq(subscriptions.status, "past_due")
            )
          )
        );
    });

    pastDueInvoices += 1;
  }

  return { pastDueInvoices };
}

export async function finalizeEligibleDraftInvoices(
  _runAt?: Date,
  _finalizationDelayMs?: number
) {
  return { finalizedInvoices: 0 };
}

export async function closeSubscriptionCycle(
  subscriptionId: string,
  runAt = new Date()
) {
  return runWithBillingLease(`close_cycle_${subscriptionId}`, async () => {
    await processSchedulePhaseTransitions(runAt);

    const loaded = await loadRenewableSubscription(subscriptionId);
    if (!loaded) {
      throw new BillingCycleError(
        "not_found",
        `No such subscription: '${subscriptionId}'`
      );
    }

    if (loaded.subscription.status === "canceled") {
      throw new BillingCycleError(
        "already_canceled",
        "This subscription has already been canceled"
      );
    }

    if (loaded.subscription.cancelAtPeriodEnd) {
      throw new BillingCycleError(
        "invalid_state",
        "Subscriptions scheduled to cancel at period end cannot be closed manually"
      );
    }

    if (loaded.subscription.currentPeriodEnd.getTime() > runAt.getTime()) {
      throw new BillingCycleError(
        "not_due",
        "The subscription does not have a cycle ready to close yet"
      );
    }

    const creation = await createRenewalInvoiceForLoadedSubscription(loaded, runAt);
    return { invoiceId: creation.invoiceId };
  }, runAt);
}

export async function processDueSubscriptions(
  options: ProcessDueSubscriptionsOptions = {}
) {
  await ensureTables();

  const runAt = options.runAt ?? new Date();
  const trigger = options.trigger ?? "manual";

  await acquireLease(runAt, trigger);

  const summary = emptySummary();

  try {
    await processSchedulePhaseTransitions(runAt);

    const creation = await createRenewalInvoices(runAt);
    summary.processed_subscriptions = creation.processedSubscriptions;
    summary.canceled_subscriptions = creation.canceledSubscriptions;
    summary.created_invoices = creation.createdInvoices;
    summary.refreshed_drafts = creation.refreshedDrafts;

    const overdue = await markOverdueInvoices(runAt);
    summary.past_due_invoices = overdue.pastDueInvoices;

    await releaseLease(runAt, summary, null);
    return summary;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown billing processor error";
    await releaseLease(runAt, summary, message);
    throw error;
  }
}

export async function getBillingProcessorState() {
  await ensureTables();
  const row = await ensureProcessorStateRow();
  return toProcessorState(row);
}
