import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { SEND_INVOICE_DUE_DAYS } from "@/modules/billing/policy";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  billingProcessorState,
  customers,
  invoiceDeliveries,
  invoiceLineItems,
  invoices,
  prices,
  subscriptionItems,
  subscriptions,
} from "@/infrastructure/database/schema";
import { getMeterUsageTotal } from "@/modules/meter-events/service";
import { multiplyIntegerByDecimalAndRound } from "@/modules/shared/fixed-decimal";
import { addRecurringInterval, toUnix } from "@/modules/shared/time";
import type {
  BillingProcessorState,
  BillingProcessorSummary,
  ProcessDueSubscriptionsOptions,
} from "./types";

const PROCESSOR_STATE_ID = "subscription_billing";
const PROCESSOR_LEASE_MS = 5 * 60 * 1000;
type SubscriptionRow = typeof subscriptions.$inferSelect;
type LoadedDueSubscription = {
  subscription: SubscriptionRow;
  price: typeof prices.$inferSelect;
  customerEmail: string | null;
};

function emptySummary(): BillingProcessorSummary {
  return {
    processed_subscriptions: 0,
    canceled_subscriptions: 0,
    created_invoices: 0,
    finalized_invoices: 0,
    paid_invoices: 0,
    sent_invoices: 0,
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
            finalized_invoices: Number(summary.finalized_invoices ?? 0),
            paid_invoices: Number(summary.paid_invoices ?? 0),
            sent_invoices: Number(summary.sent_invoices ?? 0),
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

async function loadDueSubscriptions(runAt: Date): Promise<LoadedDueSubscription[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        inArray(subscriptions.status, ["active", "past_due"]),
        lte(subscriptions.currentPeriodEnd, runAt)
      )
    )
    .orderBy(
      asc(subscriptions.currentPeriodEnd),
      asc(subscriptions.createdAt),
      asc(subscriptions.id)
    );

  const loaded: LoadedDueSubscription[] = [];

  for (const row of rows) {
    const itemRows = await db
      .select()
      .from(subscriptionItems)
      .where(eq(subscriptionItems.subscriptionId, row.id))
      .orderBy(asc(subscriptionItems.createdAt), asc(subscriptionItems.id))
      .limit(1);

    const item = itemRows[0];
    if (!item) {
      continue;
    }

    const priceRows = await db
      .select()
      .from(prices)
      .where(eq(prices.id, item.priceId))
      .limit(1);

    const price = priceRows[0];
    if (!price?.recurringInterval) {
      continue;
    }

    const customerRows = await db
      .select({ email: customers.email })
      .from(customers)
      .where(eq(customers.id, row.customerId))
      .limit(1);

    loaded.push({
      subscription: row,
      price,
      customerEmail: customerRows[0]?.email ?? null,
    });
  }

  return loaded;
}

export async function createRenewalInvoices(runAt: Date) {
  await ensureTables();
  const db = getDb();
  const dueSubscriptions = await loadDueSubscriptions(runAt);
  let canceledSubscriptions = 0;
  let createdInvoices = 0;

  for (const loaded of dueSubscriptions) {
    const { subscription, price } = loaded;

    if (subscription.cancelAtPeriodEnd) {
      const canceledAt = subscription.currentPeriodEnd;
      await db
        .update(subscriptions)
        .set({
          status: "canceled",
          cancelAtPeriodEnd: false,
          canceledAt,
          endedAt: canceledAt,
          updatedAt: runAt,
        })
        .where(eq(subscriptions.id, subscription.id));

      canceledSubscriptions += 1;
      continue;
    }

    const nextPeriodStart = subscription.currentPeriodEnd;
    const nextPeriodEnd = addRecurringInterval(
      subscription.currentPeriodEnd,
      price.recurringInterval as "month" | "year"
    );

    const existing = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.subscriptionId, subscription.id),
          eq(invoices.periodStart, nextPeriodStart),
          eq(invoices.periodEnd, nextPeriodEnd)
        )
      )
      .limit(1);

    if (existing[0]) {
      continue;
    }

    const invoiceId = `in_${nanoid()}`;
    const lineItemId = `il_${nanoid()}`;
    const usagePeriodStart = subscription.currentPeriodStart;
    const usagePeriodEnd = subscription.currentPeriodEnd;
    const usageQuantity = price.meter
      ? await getMeterUsageTotal(price.meter,
          subscription.customerId,
          Math.floor(usagePeriodStart.getTime() / 1000),
          Math.floor(usagePeriodEnd.getTime() / 1000)
        )
      : 1;
    const lineItemAmount = multiplyIntegerByDecimalAndRound(
      usageQuantity,
      price.unitAmountDecimal
    );
    const lineItemPeriodStart = price.meter ? usagePeriodStart : nextPeriodStart;
    const lineItemPeriodEnd = price.meter ? usagePeriodEnd : nextPeriodEnd;

    await db.transaction(async (tx) => {
      await tx.insert(invoices).values({
        id: invoiceId,
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        status: "draft",
        collectionMethod: subscription.collectionMethod,
        currency: price.currency,
        subtotal: lineItemAmount,
        amountDue: lineItemAmount,
        amountPaid: 0,
        dueDate: null,
        periodStart: nextPeriodStart,
        periodEnd: nextPeriodEnd,
        autoAdvance: true,
        finalizedAt: null,
        paidAt: null,
        createdAt: runAt,
        updatedAt: runAt,
      });

      await tx.insert(invoiceLineItems).values({
        id: lineItemId,
        invoiceId,
        priceId: price.id,
        quantity: usageQuantity,
        amount: lineItemAmount,
        currency: price.currency,
        periodStart: lineItemPeriodStart,
        periodEnd: lineItemPeriodEnd,
        createdAt: runAt,
        updatedAt: runAt,
      });
    });

    createdInvoices += 1;
  }

  return {
    processedSubscriptions: dueSubscriptions.length,
    canceledSubscriptions,
    createdInvoices,
  };
}

export async function finalizeEligibleDraftInvoices(
  runAt: Date,
  finalizationDelayMs = 0
) {
  await ensureTables();
  const db = getDb();
  const finalizeBefore = new Date(runAt.getTime() - finalizationDelayMs);
  const dueDate = new Date(runAt.getTime() + SEND_INVOICE_DUE_DAYS * 86400_000);

  const draftInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "draft"),
        eq(invoices.autoAdvance, true),
        lte(invoices.createdAt, finalizeBefore)
      )
    )
    .orderBy(asc(invoices.createdAt), asc(invoices.id));

  let finalizedInvoices = 0;

  for (const invoice of draftInvoices) {
    await db
      .update(invoices)
      .set({
        status: "open",
        dueDate:
          invoice.collectionMethod === "send_invoice" ? dueDate : invoice.dueDate,
        finalizedAt: runAt,
        updatedAt: runAt,
      })
      .where(eq(invoices.id, invoice.id));

    finalizedInvoices += 1;
  }

  return { finalizedInvoices };
}

async function hasDelivery(invoiceId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: invoiceDeliveries.id })
    .from(invoiceDeliveries)
    .where(eq(invoiceDeliveries.invoiceId, invoiceId))
    .limit(1);

  return Boolean(rows[0]);
}

export async function collectOpenInvoices(runAt: Date) {
  await ensureTables();
  const db = getDb();
  const openInvoices = await db
    .select()
    .from(invoices)
    .where(eq(invoices.status, "open"))
    .orderBy(asc(invoices.createdAt), asc(invoices.id));

  let paidInvoices = 0;
  let sentInvoices = 0;

  for (const invoice of openInvoices) {
    if (invoice.collectionMethod === "charge_automatically") {
      await db.transaction(async (tx) => {
        await tx
          .update(invoices)
          .set({
            status: "paid",
            amountPaid: invoice.amountDue,
            paidAt: runAt,
            updatedAt: runAt,
          })
          .where(eq(invoices.id, invoice.id));

        await tx
          .update(subscriptions)
          .set({
            status: "active",
            currentPeriodStart: invoice.periodStart,
            currentPeriodEnd: invoice.periodEnd,
            updatedAt: runAt,
          })
          .where(eq(subscriptions.id, invoice.subscriptionId));
      });

      paidInvoices += 1;
      continue;
    }

    if (await hasDelivery(invoice.id)) {
      continue;
    }

    const customerRows = await db
      .select({ email: customers.email })
      .from(customers)
      .where(eq(customers.id, invoice.customerId))
      .limit(1);

    await db.transaction(async (tx) => {
      await tx.insert(invoiceDeliveries).values({
        id: `idel_${nanoid()}`,
        invoiceId: invoice.id,
        channel: "mock_email",
        status: "sent",
        recipient: customerRows[0]?.email ?? null,
        payload: {
          invoice_id: invoice.id,
          customer_id: invoice.customerId,
          subscription_id: invoice.subscriptionId,
        },
        sentAt: runAt,
        createdAt: runAt,
        updatedAt: runAt,
      });

      const subscriptionRows = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, invoice.subscriptionId))
        .limit(1);

      const subscription = subscriptionRows[0];
      if (subscription && subscription.status !== "canceled") {
        await tx
          .update(subscriptions)
          .set({
            currentPeriodStart: invoice.periodStart,
            currentPeriodEnd: invoice.periodEnd,
            status: subscription.status === "past_due" ? "past_due" : "active",
            updatedAt: runAt,
          })
          .where(eq(subscriptions.id, invoice.subscriptionId));
      }
    });

    sentInvoices += 1;
  }

  return { paidInvoices, sentInvoices };
}

export async function markOverdueInvoices(runAt: Date) {
  await ensureTables();
  const db = getDb();
  const overdueInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "open"),
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
          status: "past_due",
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

export async function processDueSubscriptions(
  options: ProcessDueSubscriptionsOptions = {}
) {
  await ensureTables();

  const runAt = options.runAt ?? new Date();
  const trigger = options.trigger ?? "manual";
  const finalizationDelayMs = options.finalizationDelayMs ?? 0;

  await acquireLease(runAt, trigger);

  const summary = emptySummary();

  try {
    const creation = await createRenewalInvoices(runAt);
    summary.processed_subscriptions = creation.processedSubscriptions;
    summary.canceled_subscriptions = creation.canceledSubscriptions;
    summary.created_invoices = creation.createdInvoices;

    const finalization = await finalizeEligibleDraftInvoices(
      runAt,
      finalizationDelayMs
    );
    summary.finalized_invoices = finalization.finalizedInvoices;

    const collection = await collectOpenInvoices(runAt);
    summary.paid_invoices = collection.paidInvoices;
    summary.sent_invoices = collection.sentInvoices;

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
