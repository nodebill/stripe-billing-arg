import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { ensureTables, getDb } from "../infrastructure/database/client";
import {
  billingProcessorState,
  invoiceDeliveries,
  invoiceLineItems,
  invoices,
  meterEvents,
  meters,
  paymentMethods,
  prices,
  products,
  subscriptionSchedulePhases,
  subscriptionSchedules,
  subscriptionItems,
  subscriptions,
  customers,
} from "../infrastructure/database/schema";
import {
  closeSubscriptionCycle as closeSubscriptionCycleInBilling,
  createRenewalInvoices,
  finalizeEligibleDraftInvoices,
  getBillingProcessorState,
  markOverdueInvoices,
  processDueSubscriptions,
  processSchedulePhaseTransitions,
} from "../modules/billing/service";
import { deleteCustomer, createCustomer } from "../modules/customers/service";
import { getInvoice, listInvoices } from "../modules/invoices/service";
import { createMeterEvent } from "../modules/meter-events/service";
import { createMeter } from "../modules/meters/service";
import {
  attachPaymentMethod,
  createPaymentMethod,
  detachPaymentMethod,
} from "../modules/payment-methods/service";
import { createPrice, updatePrice } from "../modules/prices/service";
import { createProduct } from "../modules/products/service";
import {
  createSubscriptionSchedule,
  getSubscriptionSchedule,
  updateSubscriptionSchedule,
} from "../modules/subscription-schedules/service";
import {
  bulkCloseSubscriptionCycles,
  createSubscription,
  getSubscription,
  listSubscriptions,
  SubscriptionError,
  updateSubscription,
} from "../modules/subscriptions/service";
import { addRecurringInterval } from "../modules/shared/time";

const runtime = globalThis as typeof globalThis & {
  __stripeBillingPGlite?: { close: () => Promise<void> };
  __stripeBillingPool?: { end: () => Promise<void> };
};

async function resetDb() {
  await ensureTables();
  const db = getDb();

  await db.delete(invoiceDeliveries);
  await db.delete(invoiceLineItems);
  await db.delete(invoices);
  await db.delete(subscriptionSchedulePhases);
  await db.delete(subscriptionSchedules);
  await db.delete(subscriptionItems);
  await db.delete(subscriptions);
  await db.delete(meterEvents);
  await db.delete(paymentMethods);
  await db.delete(prices);
  await db.delete(meters);
  await db.delete(products);
  await db.delete(customers);
  await db.delete(billingProcessorState);
}

async function createRecurringFixture() {
  const customer = await createCustomer({
    email: `customer-${Date.now()}@example.com`,
  });
  const paymentMethod = await createPaymentMethod({
    type: "custom",
    billing_details: {
      name: "Primary method",
    },
  });
  await attachPaymentMethod(paymentMethod.id, {
    customer: customer.id,
  });

  const product = await createProduct({
    name: `Pro ${Date.now()}`,
  });
  const price = await createPrice({
    product: product.id,
    currency: "usd",
    unit_amount: 2500,
    type: "recurring",
    recurring: {
      interval: "month",
      interval_count: 1,
      usage_type: "licensed",
    },
  });

  if (!price || "error" in price) {
    throw new Error("Expected recurring price fixture to be created");
  }

  return {
    customer,
    paymentMethod,
    product,
    price,
  };
}

async function createMeteredFixture(
  aggregation: "sum" | "count" = "sum",
  amount:
    | {
        unit_amount: number;
        unit_amount_decimal?: undefined;
      }
    | {
        unit_amount?: undefined;
        unit_amount_decimal: string;
      } = {
    unit_amount: aggregation === "sum" ? 75 : 500,
  }
) {
  const base = await createRecurringFixture();
  const meter = await createMeter({
    display_name: `Meter ${Date.now()}`,
    event_name: `meter_event_${Date.now()}`,
    default_aggregation: { formula: aggregation },
  });

  if ("error" in meter) {
    throw new Error(meter.error);
  }

  const price = await createPrice({
    product: base.product.id,
    currency: "usd",
    ...amount,
    type: "recurring",
    recurring: {
      interval: "month",
      interval_count: 1,
      usage_type: "metered",
    },
    meter: meter.id,
  });

  if (!price || "error" in price) {
    throw new Error(
      price && "error" in price
        ? price.error
        : "Expected metered price fixture to be created"
    );
  }

  return {
    ...base,
    meter,
    price,
  };
}

async function createRecurringPriceForProduct(
  productId: string,
  unitAmount: number
) {
  const price = await createPrice({
    product: productId,
    currency: "usd",
    unit_amount: unitAmount,
    type: "recurring",
    recurring: {
      interval: "month",
      interval_count: 1,
      usage_type: "licensed",
    },
  });

  if (!price || "error" in price) {
    throw new Error("Expected recurring price to be created");
  }

  return price;
}

async function createMeteredRecurringPriceForProduct(
  productId: string,
  meterId: string,
  unitAmount: number
) {
  const price = await createPrice({
    product: productId,
    currency: "usd",
    unit_amount: unitAmount,
    type: "recurring",
    recurring: {
      interval: "month",
      interval_count: 1,
      usage_type: "metered",
    },
    meter: meterId,
  });

  if (!price || "error" in price) {
    throw new Error("Expected metered recurring price to be created");
  }

  return price;
}

async function insertMeterEventRow(params: {
  meterId: string;
  customerId: string;
  eventName: string;
  value: number;
  timestamp: Date;
  identifier?: string;
}) {
  const now = new Date();
  await getDb().insert(meterEvents).values({
    id: `mtevt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    meterId: params.meterId,
    customerId: params.customerId,
    identifier:
      params.identifier ??
      `evt_${params.timestamp.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    eventName: params.eventName,
    value: params.value,
    eventTimestamp: params.timestamp,
    invoiceLineItemId: null,
    livemode: false,
    createdAt: now,
    updatedAt: now,
  });
}

async function expireSubscription(
  subscriptionId: string,
  daysAgo = 1,
  referenceDate = new Date()
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);

  const current = rows[0];
  if (!current) {
    throw new Error(`No such subscription '${subscriptionId}'`);
  }

  const pastEnd = new Date(
    referenceDate.getTime() - daysAgo * 24 * 60 * 60 * 1000
  );
  const pastStart = new Date(pastEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  await db
    .update(subscriptions)
    .set({
      currentPeriodStart: pastStart,
      currentPeriodEnd: pastEnd,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId));

  return { pastStart, pastEnd };
}

function getStartOfCurrentUtcMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
}

test("creates subscriptions with either auto-charge or send-invoice collection methods", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const auto = await createSubscription({
    customer: fixture.customer.id,
    collection_method: "charge_automatically",
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  assert.equal(auto.collection_method, "charge_automatically");
  assert.equal(auto.default_payment_method, fixture.paymentMethod.id);

  const manual = await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    items: [{ price: fixture.price.id }],
  });

  assert.equal(manual.collection_method, "send_invoice");
  assert.equal(manual.default_payment_method, null);
});

test("integer prices expose a mirrored unit_amount_decimal value", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  assert.equal(fixture.price.unit_amount, 2500);
  assert.equal(fixture.price.unit_amount_decimal, "2500");
});

test("rejects auto-charge subscriptions without a default payment method", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  await assert.rejects(
    () =>
      createSubscription({
        customer: fixture.customer.id,
        collection_method: "charge_automatically",
        items: [{ price: fixture.price.id }],
      }),
    (error: unknown) =>
      error instanceof SubscriptionError &&
      error.code === "default_payment_method_required"
  );
});

test("default subscription creation keeps current_period_start near now", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const before = Date.now();

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  const after = Date.now();
  assert.ok(subscription.current_period_start * 1000 >= before - 1000);
  assert.ok(subscription.current_period_start * 1000 <= after + 1000);
  assert.ok(subscription.current_period_end > subscription.current_period_start);
});

test("billing_cycle_anchor_config can align the first renewal without an initial invoice", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    billing_cycle_anchor_config: {
      day_of_month: 1,
    },
    proration_behavior: "none",
    items: [{ price: fixture.price.id }],
  });

  assert.equal(new Date(subscription.current_period_end * 1000).getUTCDate(), 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows.length, 0);
});

test("anchored auto-charge subscriptions create an immediate paid proration invoice", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    billing_cycle_anchor_config: {
      day_of_month: 1,
    },
    proration_behavior: "create_prorations",
    items: [{ price: fixture.price.id }],
  });

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows.length, 1);
  assert.equal(invoiceRows[0]?.status, "paid");
  assert.equal(invoiceRows[0]?.amountPaid, invoiceRows[0]?.amountDue);
  assert.equal(
    Math.floor((invoiceRows[0]?.periodEnd.getTime() ?? 0) / 1000),
    subscription.current_period_end
  );

  const lineItems = await getDb().select().from(invoiceLineItems);
  assert.equal(lineItems.length, 1);
  assert.equal(
    Math.floor((lineItems[0]?.periodEnd.getTime() ?? 0) / 1000),
    subscription.current_period_end
  );
});

test("anchored send-invoice subscriptions create an open invoice and mocked delivery", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    billing_cycle_anchor_config: {
      day_of_month: 1,
    },
    proration_behavior: "create_prorations",
    items: [{ price: fixture.price.id }],
  });

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows.length, 1);
  assert.equal(invoiceRows[0]?.status, "open");
  assert.ok(invoiceRows[0]?.dueDate);

  const deliveryRows = await getDb().select().from(invoiceDeliveries);
  assert.equal(deliveryRows.length, 1);
  assert.equal(deliveryRows[0]?.status, "sent");
});

test("backdating to the first day of the current month updates the active period without an invoice when proration is none", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const backdate = getStartOfCurrentUtcMonth();

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    backdate_start_date: Math.floor(backdate.getTime() / 1000),
    proration_behavior: "none",
    items: [{ price: fixture.price.id }],
  });

  const expectedEnd = addRecurringInterval(backdate, "month");
  assert.equal(subscription.current_period_start, Math.floor(backdate.getTime() / 1000));
  assert.equal(subscription.current_period_end, Math.floor(expectedEnd.getTime() / 1000));

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows.length, 0);
});

test("arbitrary backdate dates resolve the current active period that contains now", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const now = new Date();
  const backdate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 17, 0, 0, 0)
  );

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    backdate_start_date: Math.floor(backdate.getTime() / 1000),
    proration_behavior: "none",
    items: [{ price: fixture.price.id }],
  });

  const createdAt = new Date(subscription.created * 1000);
  let expectedStart = backdate;
  let expectedEnd = addRecurringInterval(expectedStart, "month");

  while (expectedEnd.getTime() <= createdAt.getTime()) {
    expectedStart = expectedEnd;
    expectedEnd = addRecurringInterval(expectedStart, "month");
  }

  assert.equal(subscription.current_period_start, Math.floor(expectedStart.getTime() / 1000));
  assert.equal(subscription.current_period_end, Math.floor(expectedEnd.getTime() / 1000));
});

test("backdated licensed subscriptions can create a catch-up proration invoice", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const now = new Date();
  const backdate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1, 0, 0, 0)
  );

  await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    backdate_start_date: Math.floor(backdate.getTime() / 1000),
    proration_behavior: "create_prorations",
    items: [{ price: fixture.price.id }],
  });

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows.length, 1);
  assert.equal(invoiceRows[0]?.status, "paid");
  assert.ok((invoiceRows[0]?.amountDue ?? 0) > 0);
  assert.equal(invoiceRows[0]?.periodStart.getTime(), backdate.getTime());
  assert.ok((invoiceRows[0]?.periodEnd.getTime() ?? 0) > backdate.getTime());
});

test("preserve_exact_cycle keeps a historical first period pending manual catch-up", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("sum", { unit_amount: 1 });
  const historicalStart = new Date("2026-03-01T00:00:00.000Z");

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    backdate_start_date: Math.floor(historicalStart.getTime() / 1000),
    backdate_behavior: "preserve_exact_cycle",
    items: [{ price: fixture.price.id }],
  });

  assert.equal(subscription.current_period_start, Math.floor(historicalStart.getTime() / 1000));
  assert.equal(
    subscription.current_period_end,
    Math.floor(new Date("2026-04-01T00:00:00.000Z").getTime() / 1000)
  );
  assert.equal(subscription.billing_anchor_start, Math.floor(historicalStart.getTime() / 1000));
  assert.equal(subscription.renewal_mode, "manual_until_current");

  const invoicesRows = await getDb().select().from(invoices);
  assert.equal(invoicesRows.length, 0);
});

test("automatic renewal processing ignores subscriptions in manual catch-up mode", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("sum", { unit_amount: 1 });

  await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    backdate_start_date: Math.floor(new Date("2026-03-01T00:00:00.000Z").getTime() / 1000),
    backdate_behavior: "preserve_exact_cycle",
    items: [{ price: fixture.price.id }],
  });

  const summary = await processDueSubscriptions({
    runAt: new Date("2026-04-09T12:00:00.000Z"),
    trigger: "test_manual_mode_ignored",
  });

  assert.equal(summary.processed_subscriptions, 0);
  assert.equal(summary.created_invoices, 0);
  assert.equal((await getDb().select().from(invoices)).length, 0);
});

test("metered subscriptions reject create_prorations when an initial proration would be required", async () => {
  await resetDb();
  const fixture = await createMeteredFixture();

  await assert.rejects(
    () =>
      createSubscription({
        customer: fixture.customer.id,
        default_payment_method: fixture.paymentMethod.id,
        billing_cycle_anchor_config: {
          day_of_month: 1,
        },
        proration_behavior: "create_prorations",
        items: [{ price: fixture.price.id }],
      }),
    (error: unknown) =>
      error instanceof SubscriptionError &&
      error.code === "invalid_proration_behavior"
  );
});

test("lists subscriptions only for the requested customer", async () => {
  await resetDb();
  const first = await createRecurringFixture();
  const second = await createRecurringFixture();

  const firstSubscription = await createSubscription({
    customer: first.customer.id,
    default_payment_method: first.paymentMethod.id,
    items: [{ price: first.price.id }],
  });
  await createSubscription({
    customer: second.customer.id,
    default_payment_method: second.paymentMethod.id,
    items: [{ price: second.price.id }],
  });

  const list = await listSubscriptions({
    customer: first.customer.id,
    limit: 10,
  });

  assert.equal(list.data.length, 1);
  assert.equal(list.data[0]?.id, firstSubscription.id);
});

test("lists active subscriptions globally when customer is omitted", async () => {
  await resetDb();
  const first = await createRecurringFixture();
  const second = await createRecurringFixture();

  const firstSubscription = await createSubscription({
    customer: first.customer.id,
    default_payment_method: first.paymentMethod.id,
    items: [{ price: first.price.id }],
  });
  const secondSubscription = await createSubscription({
    customer: second.customer.id,
    default_payment_method: second.paymentMethod.id,
    items: [{ price: second.price.id }],
  });

  const list = await listSubscriptions({
    status: "active",
    limit: 200,
  });

  assert.equal(list.data.length, 2);
  assert.deepEqual(
    new Set(list.data.map((subscription) => subscription.id)),
    new Set([firstSubscription.id, secondSubscription.id])
  );
});

test("filters subscriptions by exact subscription id", async () => {
  await resetDb();
  const first = await createRecurringFixture();
  const second = await createRecurringFixture();

  const firstSubscription = await createSubscription({
    customer: first.customer.id,
    default_payment_method: first.paymentMethod.id,
    items: [{ price: first.price.id }],
  });
  await createSubscription({
    customer: second.customer.id,
    default_payment_method: second.paymentMethod.id,
    items: [{ price: second.price.id }],
  });

  const list = await listSubscriptions({
    subscription: firstSubscription.id,
    status: "active",
    limit: 200,
  });

  assert.equal(list.data.length, 1);
  assert.equal(list.data[0]?.id, firstSubscription.id);
});

test("globally lists invoices when customer is omitted", async () => {
  await resetDb();
  const first = await createRecurringFixture();
  const second = await createRecurringFixture();

  const firstSubscription = await createSubscription({
    customer: first.customer.id,
    default_payment_method: first.paymentMethod.id,
    items: [{ price: first.price.id }],
  });
  const secondSubscription = await createSubscription({
    customer: second.customer.id,
    default_payment_method: second.paymentMethod.id,
    items: [{ price: second.price.id }],
  });

  const runAt = new Date("2026-04-04T13:00:00.000Z");
  await expireSubscription(firstSubscription.id, 2, runAt);
  await expireSubscription(secondSubscription.id, 2, runAt);

  await processDueSubscriptions({
    runAt,
    trigger: "test_global_invoice_list",
  });

  const list = await listInvoices({
    limit: 200,
  });

  assert.equal(list.data.length, 2);
  assert.deepEqual(
    new Set(list.data.map((invoice) => invoice.customer)),
    new Set([first.customer.id, second.customer.id])
  );
});

test("bulk close processes overdue subscriptions and skips subscriptions that are not due", async () => {
  await resetDb();
  const first = await createRecurringFixture();
  const second = await createRecurringFixture();

  const overdueSubscription = await createSubscription({
    customer: first.customer.id,
    default_payment_method: first.paymentMethod.id,
    items: [{ price: first.price.id }],
  });
  const currentSubscription = await createSubscription({
    customer: first.customer.id,
    default_payment_method: first.paymentMethod.id,
    items: [{ price: first.price.id }],
  });
  await createSubscription({
    customer: second.customer.id,
    default_payment_method: second.paymentMethod.id,
    items: [{ price: second.price.id }],
  });

  await expireSubscription(overdueSubscription.id, 2);

  const result = await bulkCloseSubscriptionCycles({
    customer: first.customer.id,
  });

  assert.equal(result.matched_subscriptions, 2);
  assert.equal(result.processed_subscriptions, 1);
  assert.equal(result.skipped_subscriptions, 1);
  assert.equal(result.failed_subscriptions, 0);

  const processed = result.results.find(
    (entry) => entry.subscription_id === overdueSubscription.id
  );
  assert.equal(processed?.status, "processed");
  assert.ok(processed?.invoice);

  const skipped = result.results.find(
    (entry) => entry.subscription_id === currentSubscription.id
  );
  assert.equal(skipped?.status, "skipped");
  assert.match(skipped?.message ?? "", /not have a cycle ready to close yet/i);
});

test("subscription reads do not mutate overdue billing state", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  const { pastStart, pastEnd } = await expireSubscription(subscription.id, 40);
  const reloaded = await getSubscription(subscription.id);

  assert.ok(reloaded);
  assert.equal(reloaded.current_period_start, Math.floor(pastStart.getTime() / 1000));
  assert.equal(reloaded.current_period_end, Math.floor(pastEnd.getTime() / 1000));
});

test("existing subscriptions keep working after their price is archived", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  await updatePrice(fixture.price.id, { active: false });

  const reloaded = await getSubscription(subscription.id);
  assert.ok(reloaded);
  assert.equal(reloaded.status, "active");
});

test("blocks duplicate active or past_due metered subscriptions for the same customer and meter", async () => {
  await resetDb();
  const fixture = await createMeteredFixture();

  await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  await assert.rejects(
    () =>
      createSubscription({
        customer: fixture.customer.id,
        default_payment_method: fixture.paymentMethod.id,
        items: [{ price: fixture.price.id }],
      }),
    (error: unknown) =>
      error instanceof SubscriptionError &&
      error.code === "metered_subscription_conflict"
  );
});

test("creates draft renewal invoices before finalization", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const createdAt = new Date("2026-04-04T10:00:00.000Z");
  await expireSubscription(subscription.id, 2, createdAt);
  const creation = await createRenewalInvoices(createdAt);

  assert.equal(creation.processedSubscriptions, 1);
  assert.equal(creation.createdInvoices, 1);

  const db = getDb();
  const invoiceRows = await db.select().from(invoices);
  assert.equal(invoiceRows.length, 1);
  assert.equal(invoiceRows[0]?.status, "draft");
});

test("future grace-period threshold is policy-driven during finalization", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const createdAt = new Date("2026-04-04T10:00:00.000Z");
  await expireSubscription(subscription.id, 2, createdAt);
  await createRenewalInvoices(createdAt);

  const noFinalize = await finalizeEligibleDraftInvoices(
    new Date("2026-04-04T10:30:00.000Z"),
    60 * 60 * 1000
  );
  assert.equal(noFinalize.finalizedInvoices, 0);

  let invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.status, "draft");

  const finalized = await finalizeEligibleDraftInvoices(
    new Date("2026-04-04T11:01:00.000Z"),
    60 * 60 * 1000
  );
  assert.equal(finalized.finalizedInvoices, 1);

  invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.status, "open");
});

test("renewal processing is idempotent across repeated runs", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const runAt = new Date("2026-04-04T12:00:00.000Z");
  await expireSubscription(subscription.id, 2, runAt);
  await createRenewalInvoices(runAt);
  await createRenewalInvoices(runAt);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows.length, 1);
});

test("invoice period reflects consumed cycle while subscription advances to the next cycle", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const runAt = new Date("2026-04-04T12:00:00.000Z");
  const { pastStart, pastEnd } = await expireSubscription(subscription.id, 2, runAt);

  await processDueSubscriptions({ runAt, trigger: "test_period_consistency" });

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows.length, 1);
  assert.equal(invoiceRows[0]?.periodStart.getTime(), pastStart.getTime());
  assert.equal(invoiceRows[0]?.periodEnd.getTime(), pastEnd.getTime());

  const renewed = await getSubscription(subscription.id);
  assert.ok(renewed);
  assert.equal(renewed.current_period_start, Math.floor(pastEnd.getTime() / 1000));
  assert.ok(renewed.current_period_end > renewed.current_period_start);
});

test("auto-charge renewals produce a paid invoice and advance the billing period", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const runAt = new Date("2026-04-04T13:00:00.000Z");
  const { pastEnd } = await expireSubscription(subscription.id, 2, runAt);

  const summary = await processDueSubscriptions({
    runAt,
    trigger: "test_auto_charge",
  });

  assert.equal(summary.created_invoices, 1);
  assert.equal(summary.paid_invoices, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.status, "paid");

  const renewed = await getSubscription(subscription.id);
  assert.ok(renewed);
  assert.equal(renewed.status, "active");
  assert.equal(renewed.current_period_start, Math.floor(pastEnd.getTime() / 1000));
  assert.ok(renewed.current_period_end > renewed.current_period_start);
});

test("send-invoice renewals create an open invoice and mocked delivery", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    items: [{ price: fixture.price.id }],
  });
  const runAt = new Date("2026-04-04T14:00:00.000Z");
  const { pastEnd } = await expireSubscription(subscription.id, 2, runAt);

  const summary = await processDueSubscriptions({
    runAt,
    trigger: "test_send_invoice",
  });

  assert.equal(summary.created_invoices, 1);
  assert.equal(summary.sent_invoices, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.status, "open");
  assert.ok(invoiceRows[0]?.dueDate);

  const deliveryRows = await getDb().select().from(invoiceDeliveries);
  assert.equal(deliveryRows.length, 1);
  assert.equal(deliveryRows[0]?.status, "sent");

  const renewed = await getSubscription(subscription.id);
  assert.ok(renewed);
  assert.equal(renewed.status, "active");
  assert.equal(renewed.current_period_start, Math.floor(pastEnd.getTime() / 1000));

  const invoiceList = await listInvoices({
    customer: fixture.customer.id,
    limit: 10,
  });
  assert.equal(invoiceList.data.length, 1);
  assert.equal(invoiceList.data[0]?.latest_delivery?.status, "sent");
});

test("metered renewals bill prior-period usage and set invoice periods to the consumed cycle", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("sum");
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const runAt = new Date();
  const { pastStart, pastEnd } = await expireSubscription(subscription.id, 2, runAt);

  await createMeterEvent({
    event_name: fixture.meter.event_name,
    identifier: `evt_${Date.now()}_1`,
    payload: {
      stripe_customer_id: fixture.customer.id,
      value: 3,
    },
    timestamp: Math.floor(new Date(pastStart.getTime() + 60_000).getTime() / 1000),
  });
  await createMeterEvent({
    event_name: fixture.meter.event_name,
    identifier: `evt_${Date.now()}_2`,
    payload: {
      stripe_customer_id: fixture.customer.id,
      value: 5,
    },
    timestamp: Math.floor(new Date(pastEnd.getTime() - 60_000).getTime() / 1000),
  });

  const summary = await processDueSubscriptions({
    runAt,
    trigger: "test_metered_sum",
  });

  assert.equal(summary.created_invoices, 1);
  assert.equal(summary.paid_invoices, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.subtotal, 600);
  assert.equal(invoiceRows[0]?.amountDue, 726);
  assert.equal(invoiceRows[0]?.periodStart.getTime(), pastStart.getTime());
  assert.equal(invoiceRows[0]?.periodEnd.getTime(), pastEnd.getTime());

  const lineItems = await getDb().select().from(invoiceLineItems);
  assert.equal(lineItems[0]?.quantity, 8);
  assert.equal(lineItems[0]?.amount, 600);
  assert.equal(lineItems[0]?.periodStart.getTime(), pastStart.getTime());
  assert.equal(lineItems[0]?.periodEnd.getTime(), pastEnd.getTime());

  const renewed = await getSubscription(subscription.id);
  assert.ok(renewed);
  assert.equal(renewed.current_period_start, Math.floor(pastEnd.getTime() / 1000));
});

test("metered renewals support decimal unit amounts and round half up to minor units", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("sum", {
    unit_amount_decimal: "0.01",
  });
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const runAt = new Date();
  const { pastStart, pastEnd } = await expireSubscription(subscription.id, 2, runAt);

  assert.equal(fixture.price.unit_amount, null);
  assert.equal(fixture.price.unit_amount_decimal, "0.01");

  await createMeterEvent({
    event_name: fixture.meter.event_name,
    identifier: `evt_${Date.now()}_decimal`,
    payload: {
      stripe_customer_id: fixture.customer.id,
      value: 1050,
    },
    timestamp: Math.floor(new Date(pastStart.getTime() + 60_000).getTime() / 1000),
  });

  const summary = await processDueSubscriptions({
    runAt,
    trigger: "test_metered_decimal",
  });

  assert.equal(summary.created_invoices, 1);
  assert.equal(summary.paid_invoices, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.subtotal, 11);
  assert.equal(invoiceRows[0]?.amountDue, 13);
  assert.equal(invoiceRows[0]?.periodStart.getTime(), pastStart.getTime());
  assert.equal(invoiceRows[0]?.periodEnd.getTime(), pastEnd.getTime());

  const lineItems = await getDb().select().from(invoiceLineItems);
  assert.equal(lineItems[0]?.quantity, 1050);
  assert.equal(lineItems[0]?.amount, 11);
  assert.equal(lineItems[0]?.periodStart.getTime(), pastStart.getTime());
  assert.equal(lineItems[0]?.periodEnd.getTime(), pastEnd.getTime());
});

test("zero-usage metered renewals create zero-amount invoices and still advance subscriptions", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("count");
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const runAt = new Date("2026-04-04T14:45:00.000Z");
  const { pastEnd } = await expireSubscription(subscription.id, 2, runAt);

  const summary = await processDueSubscriptions({
    runAt,
    trigger: "test_metered_zero",
  });

  assert.equal(summary.created_invoices, 1);
  assert.equal(summary.paid_invoices, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.subtotal, 0);
  assert.equal(invoiceRows[0]?.amountDue, 0);
  assert.equal(invoiceRows[0]?.status, "paid");

  const lineItems = await getDb().select().from(invoiceLineItems);
  assert.equal(lineItems[0]?.quantity, 0);
  assert.equal(lineItems[0]?.amount, 0);

  const renewed = await getSubscription(subscription.id);
  assert.ok(renewed);
  assert.equal(renewed.current_period_start, Math.floor(pastEnd.getTime() / 1000));
});

test("overdue send-invoice renewals move invoices and subscriptions to past_due", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    items: [{ price: fixture.price.id }],
  });
  const createRunAt = new Date("2026-04-04T15:00:00.000Z");
  await expireSubscription(subscription.id, 3, createRunAt);

  await processDueSubscriptions({
    runAt: createRunAt,
    trigger: "test_past_due_create",
  });

  await getDb()
    .update(invoices)
    .set({
      dueDate: new Date("2026-04-04T14:00:00.000Z"),
      updatedAt: new Date("2026-04-04T14:00:00.000Z"),
    })
    .where(eq(invoices.subscriptionId, subscription.id));

  const overdue = await markOverdueInvoices(new Date("2026-04-04T16:00:00.000Z"));
  assert.equal(overdue.pastDueInvoices, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.status, "past_due");

  const pastDueSubscription = await getSubscription(subscription.id);
  assert.ok(pastDueSubscription);
  assert.equal(pastDueSubscription.status, "past_due");
});

test("cancel_at_period_end cancels at the boundary without creating a renewal invoice", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  await updateSubscription(subscription.id, {
    cancel_at_period_end: true,
  });
  const runAt = new Date("2026-04-04T17:00:00.000Z");
  await expireSubscription(subscription.id, 2, runAt);

  const summary = await processDueSubscriptions({
    runAt,
    trigger: "test_cancel_at_period_end",
  });

  assert.equal(summary.canceled_subscriptions, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows.length, 0);

  const canceled = await getSubscription(subscription.id);
  assert.ok(canceled);
  assert.equal(canceled.status, "canceled");
});

test("blocks customer deletion while active or past_due subscriptions exist", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  let result = await deleteCustomer(fixture.customer.id);
  assert.equal(result, "has_subscriptions");

  await dbSetAllSubscriptionsPastDue();
  result = await deleteCustomer(fixture.customer.id);
  assert.equal(result, "has_subscriptions");
});

async function dbSetAllSubscriptionsPastDue() {
  await getDb()
    .update(subscriptions)
    .set({
      status: "past_due",
      updatedAt: new Date(),
    });
}

test("detaching a payment method cancels dependent active and past_due subscriptions", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  await getDb()
    .update(subscriptions)
    .set({
      status: "past_due",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscription.id));

  await detachPaymentMethod(fixture.paymentMethod.id);
  const canceled = await getSubscription(subscription.id);

  assert.ok(canceled);
  assert.equal(canceled.status, "canceled");
});

test("billing processor stores its last run summary in processor state", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const runAt = new Date("2026-04-04T18:00:00.000Z");
  await expireSubscription(subscription.id, 2, runAt);

  const summary = await processDueSubscriptions({
    runAt,
    trigger: "test_processor_state",
  });

  assert.equal(summary.created_invoices, 1);

  const state = await getBillingProcessorState();
  assert.equal(state.last_summary?.created_invoices, 1);
  assert.equal(state.last_summary?.paid_invoices, 1);
});

test("future schedules become active when their first phase starts", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const futurePrice = await createRecurringPriceForProduct(
    fixture.product.id,
    5000
  );

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  const startDate = Math.floor(Date.now() / 1000) + 3600;
  const schedule = await createSubscriptionSchedule({
    subscription: subscription.id,
    end_behavior: "release",
    phases: [
      {
        price: futurePrice.id,
        start_date: startDate,
        end_date: startDate + 7 * 24 * 60 * 60,
      },
    ],
  });

  assert.equal(schedule.status, "not_started");

  await processSchedulePhaseTransitions(new Date((startDate + 60) * 1000));

  const activated = await getSubscriptionSchedule(schedule.id);
  assert.equal(activated?.status, "active");

  const itemRows = await getDb()
    .select()
    .from(subscriptionItems)
    .where(eq(subscriptionItems.subscriptionId, subscription.id))
    .limit(1);

  assert.equal(itemRows[0]?.priceId, futurePrice.id);
});

test("updating a schedule keeps the current phase and only replaces future phases", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const discountPrice = await createRecurringPriceForProduct(
    fixture.product.id,
    1000
  );
  const futurePrice = await createRecurringPriceForProduct(
    fixture.product.id,
    1500
  );
  const replacementPrice = await createRecurringPriceForProduct(
    fixture.product.id,
    1750
  );

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  const nowUnix = Math.floor(Date.now() / 1000);
  const schedule = await createSubscriptionSchedule({
    subscription: subscription.id,
    end_behavior: "release",
    phases: [
      {
        price: discountPrice.id,
        start_date: nowUnix - 3600,
        end_date: nowUnix + 3600,
      },
      {
        price: futurePrice.id,
        start_date: nowUnix + 3600,
        end_date: nowUnix + 7200,
      },
    ],
  });

  const updated = await updateSubscriptionSchedule(schedule.id, {
    phases: [
      {
        price: replacementPrice.id,
        start_date: nowUnix + 3600,
        end_date: nowUnix + 7200,
      },
    ],
  });

  assert.equal(updated.status, "active");
  assert.equal(updated.phases.length, 2);
  assert.equal(updated.phases[0]?.price, discountPrice.id);
  assert.equal(updated.phases[1]?.price, replacementPrice.id);

  const itemRows = await getDb()
    .select()
    .from(subscriptionItems)
    .where(eq(subscriptionItems.subscriptionId, subscription.id))
    .limit(1);

  assert.equal(itemRows[0]?.priceId, discountPrice.id);
});

test("licensed renewals segment invoice line items across old and new mid-cycle prices", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const newPrice = await createRecurringPriceForProduct(fixture.product.id, 5000);

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    items: [{ price: fixture.price.id }],
  });

  const { pastStart, pastEnd } = await expireSubscription(subscription.id);
  const midpointUnix = Math.floor(
    (pastStart.getTime() + (pastEnd.getTime() - pastStart.getTime()) / 2) / 1000
  );

  await createSubscriptionSchedule({
    subscription: subscription.id,
    end_behavior: "release",
    phases: [
      {
        price: newPrice.id,
        start_date: midpointUnix,
        end_date: midpointUnix + 90 * 24 * 60 * 60,
      },
    ],
  });

  await processDueSubscriptions({ runAt: new Date() });

  const invoiceRows = await getDb().select().from(invoices).limit(1);
  const lineItemRows = await getDb()
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceRows[0]!.id))
    .orderBy(invoiceLineItems.periodStart);

  assert.equal(lineItemRows.length, 2);
  assert.equal(lineItemRows[0]?.priceId, fixture.price.id);
  assert.equal(lineItemRows[0]?.amount, 1250);
  assert.equal(lineItemRows[1]?.priceId, newPrice.id);
  assert.equal(lineItemRows[1]?.amount, 2500);
  assert.equal(invoiceRows[0]?.subtotal, 3750);
});

test("metered renewals segment usage by price change boundaries", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("sum", { unit_amount: 100 });
  const lowerPrice = await createMeteredRecurringPriceForProduct(
    fixture.product.id,
    fixture.meter.id,
    25
  );

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    items: [{ price: fixture.price.id }],
  });

  const { pastStart, pastEnd } = await expireSubscription(subscription.id);
  const midpoint = new Date(
    pastStart.getTime() + (pastEnd.getTime() - pastStart.getTime()) / 2
  );

  await createMeterEvent({
    event_name: fixture.meter.event_name,
    payload: {
      stripe_customer_id: fixture.customer.id,
      value: 10,
    },
    timestamp: Math.floor((pastStart.getTime() + 60_000) / 1000),
  });

  await createMeterEvent({
    event_name: fixture.meter.event_name,
    payload: {
      stripe_customer_id: fixture.customer.id,
      value: 4,
    },
    timestamp: Math.floor((midpoint.getTime() + 60_000) / 1000),
  });

  await createSubscriptionSchedule({
    subscription: subscription.id,
    end_behavior: "release",
    phases: [
      {
        price: lowerPrice.id,
        start_date: Math.floor(midpoint.getTime() / 1000),
        end_date: Math.floor(midpoint.getTime() / 1000) + 90 * 24 * 60 * 60,
      },
    ],
  });

  await processDueSubscriptions({ runAt: new Date() });

  const invoiceRows = await getDb().select().from(invoices).limit(1);
  const lineItemRows = await getDb()
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceRows[0]!.id))
    .orderBy(invoiceLineItems.periodStart);

  assert.equal(lineItemRows.length, 2);
  assert.equal(lineItemRows[0]?.priceId, fixture.price.id);
  assert.equal(lineItemRows[0]?.quantity, 10);
  assert.equal(lineItemRows[0]?.amount, 1000);
  assert.equal(lineItemRows[1]?.priceId, lowerPrice.id);
  assert.equal(lineItemRows[1]?.quantity, 4);
  assert.equal(lineItemRows[1]?.amount, 100);
  assert.equal(invoiceRows[0]?.subtotal, 1100);
});

test("manual cycle close bills one historical metered cycle and returns the subscription to automatic mode", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("sum", { unit_amount: 1 });
  const cycleStart = new Date("2026-03-01T00:00:00.000Z");
  const cycleEnd = new Date("2026-04-01T00:00:00.000Z");
  const closeRunAt = new Date("2026-04-09T12:00:00.000Z");

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    backdate_start_date: Math.floor(cycleStart.getTime() / 1000),
    backdate_behavior: "preserve_exact_cycle",
    items: [{ price: fixture.price.id }],
  });

  await insertMeterEventRow({
    meterId: fixture.meter.id,
    customerId: fixture.customer.id,
    eventName: fixture.meter.event_name,
    value: 10,
    timestamp: new Date("2026-03-31T12:00:00.000Z"),
  });
  await insertMeterEventRow({
    meterId: fixture.meter.id,
    customerId: fixture.customer.id,
    eventName: fixture.meter.event_name,
    value: 7,
    timestamp: new Date("2026-04-02T12:00:00.000Z"),
  });

  const result = await closeSubscriptionCycleInBilling(subscription.id, closeRunAt);
  const invoice = await getInvoice(result.invoiceId);
  const renewed = await getSubscription(subscription.id);

  assert.ok(invoice);
  assert.ok(renewed);
  assert.equal(invoice.status, "open");
  assert.equal(invoice.subtotal, 10);
  assert.equal(invoice.amount_due, 12);
  assert.equal(invoice.line_items.length, 1);
  assert.equal(invoice.line_items[0]?.billing_reason, "metered_recurring");
  assert.equal(invoice.line_items[0]?.quantity, 10);
  assert.equal(invoice.line_items[0]?.amount, 10);
  assert.equal(invoice.line_items[0]?.period_start, Math.floor(cycleStart.getTime() / 1000));
  assert.equal(invoice.line_items[0]?.period_end, Math.floor(cycleEnd.getTime() / 1000));
  assert.equal(renewed.current_period_start, Math.floor(cycleEnd.getTime() / 1000));
  assert.equal(
    renewed.current_period_end,
    Math.floor(new Date("2026-05-01T00:00:00.000Z").getTime() / 1000)
  );
  assert.equal(renewed.renewal_mode, "automatic");
});

test("late metered usage is billed in the next invoice as a carryforward line item using the original cycle price", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("sum", { unit_amount: 100 });
  const discountedPrice = await createMeteredRecurringPriceForProduct(
    fixture.product.id,
    fixture.meter.id,
    25
  );

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    backdate_start_date: Math.floor(new Date("2026-03-01T00:00:00.000Z").getTime() / 1000),
    backdate_behavior: "preserve_exact_cycle",
    items: [{ price: fixture.price.id }],
  });

  await createSubscriptionSchedule({
    subscription: subscription.id,
    end_behavior: "release",
    phases: [
      {
        price: discountedPrice.id,
        start_date: Math.floor(new Date("2026-04-15T00:00:00.000Z").getTime() / 1000),
        end_date: Math.floor(new Date("2026-07-15T00:00:00.000Z").getTime() / 1000),
      },
    ],
  });

  await insertMeterEventRow({
    meterId: fixture.meter.id,
    customerId: fixture.customer.id,
    eventName: fixture.meter.event_name,
    value: 10,
    timestamp: new Date("2026-03-31T12:00:00.000Z"),
  });

  const firstClose = await closeSubscriptionCycleInBilling(
    subscription.id,
    new Date("2026-04-09T12:00:00.000Z")
  );
  const firstInvoice = await getInvoice(firstClose.invoiceId);
  assert.ok(firstInvoice);
  assert.equal(firstInvoice.line_items[0]?.amount, 1000);

  await insertMeterEventRow({
    meterId: fixture.meter.id,
    customerId: fixture.customer.id,
    eventName: fixture.meter.event_name,
    value: 4,
    timestamp: new Date("2026-03-30T12:00:00.000Z"),
  });
  await insertMeterEventRow({
    meterId: fixture.meter.id,
    customerId: fixture.customer.id,
    eventName: fixture.meter.event_name,
    value: 2,
    timestamp: new Date("2026-04-20T12:00:00.000Z"),
  });

  const summary = await processDueSubscriptions({
    runAt: new Date("2026-05-02T12:00:00.000Z"),
    trigger: "test_metered_carryforward",
  });

  assert.equal(summary.created_invoices, 1);

  const invoiceRows = await getDb()
    .select()
    .from(invoices)
    .where(eq(invoices.subscriptionId, subscription.id))
    .orderBy(invoices.periodStart);
  assert.equal(invoiceRows.length, 2);

  const carryforwardInvoice = await getInvoice(invoiceRows[1]!.id);
  assert.ok(carryforwardInvoice);
  assert.equal(carryforwardInvoice.line_items.length, 3);

  const carryforwardLine = carryforwardInvoice.line_items.find(
    (lineItem) => lineItem.billing_reason === "metered_carryforward"
  );
  const currentLine = carryforwardInvoice.line_items.find(
    (lineItem) =>
      lineItem.billing_reason === "metered_recurring" &&
      lineItem.price === discountedPrice.id
  );

  assert.ok(carryforwardLine);
  assert.ok(currentLine);
  assert.equal(carryforwardLine.price, fixture.price.id);
  assert.equal(carryforwardLine.quantity, 4);
  assert.equal(carryforwardLine.amount, 400);
  assert.equal(
    carryforwardLine.period_start,
    Math.floor(new Date("2026-03-01T00:00:00.000Z").getTime() / 1000)
  );
  assert.equal(
    carryforwardLine.period_end,
    Math.floor(new Date("2026-04-01T00:00:00.000Z").getTime() / 1000)
  );
  assert.equal(currentLine.price, discountedPrice.id);
  assert.equal(currentLine.quantity, 2);
  assert.equal(currentLine.amount, 50);
});

test("renewals keep past schedule segments after a temporary schedule has already released", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const discountPrice = await createRecurringPriceForProduct(
    fixture.product.id,
    1000
  );

  const subscription = await createSubscription({
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    items: [{ price: fixture.price.id }],
  });

  const runAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
  const periodEnd = new Date(runAt.getTime() - 24 * 60 * 60 * 1000);
  const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  const discountStart = Math.floor(
    (periodStart.getTime() + 10 * 24 * 60 * 60 * 1000) / 1000
  );
  const discountEnd = Math.floor(
    (periodStart.getTime() + 15 * 24 * 60 * 60 * 1000) / 1000
  );
  const revertEnd = Math.floor(
    (periodStart.getTime() + 20 * 24 * 60 * 60 * 1000) / 1000
  );

  await getDb()
    .update(subscriptions)
    .set({
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscription.id));

  await createSubscriptionSchedule({
    subscription: subscription.id,
    end_behavior: "release",
    phases: [
      {
        price: discountPrice.id,
        start_date: discountStart,
        end_date: discountEnd,
      },
      {
        price: fixture.price.id,
        start_date: discountEnd,
        end_date: revertEnd,
      },
    ],
  });

  await processDueSubscriptions({ runAt });

  const invoiceRows = await getDb().select().from(invoices).limit(1);
  const lineItemRows = await getDb()
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceRows[0]!.id))
    .orderBy(invoiceLineItems.periodStart);

  assert.equal(lineItemRows.length, 3);
  assert.deepEqual(
    lineItemRows.map((row) => row.priceId),
    [fixture.price.id, discountPrice.id, fixture.price.id]
  );
  assert.deepEqual(
    lineItemRows.map((row) => row.amount),
    [833, 167, 1250]
  );
  assert.equal(invoiceRows[0]?.subtotal, 2250);
});

test.after(async () => {
  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
});
