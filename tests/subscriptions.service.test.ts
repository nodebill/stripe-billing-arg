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
  subscriptionItems,
  subscriptions,
  customers,
} from "../infrastructure/database/schema";
import {
  createRenewalInvoices,
  finalizeEligibleDraftInvoices,
  getBillingProcessorState,
  markOverdueInvoices,
  processDueSubscriptions,
} from "../modules/billing/service";
import { deleteCustomer, createCustomer } from "../modules/customers/service";
import { listInvoices } from "../modules/invoices/service";
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
  createSubscription,
  getSubscription,
  listSubscriptions,
  SubscriptionError,
  updateSubscription,
} from "../modules/subscriptions/service";
import { addRecurringInterval } from "../modules/shared/time";

const ORGANIZATION_ID = "org_test";
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
  const customer = await createCustomer(ORGANIZATION_ID, {
    email: `customer-${Date.now()}@example.com`,
  });
  const paymentMethod = await createPaymentMethod(ORGANIZATION_ID, {
    type: "custom",
    billing_details: {
      name: "Primary method",
    },
  });
  await attachPaymentMethod(ORGANIZATION_ID, paymentMethod.id, {
    customer: customer.id,
  });

  const product = await createProduct(ORGANIZATION_ID, {
    name: `Pro ${Date.now()}`,
  });
  const price = await createPrice(ORGANIZATION_ID, {
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
  const meter = await createMeter(ORGANIZATION_ID, {
    display_name: `Meter ${Date.now()}`,
    event_name: `meter_event_${Date.now()}`,
    default_aggregation: { formula: aggregation },
  });

  if ("error" in meter) {
    throw new Error(meter.error);
  }

  const price = await createPrice(ORGANIZATION_ID, {
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

async function expireSubscription(subscriptionId: string, daysAgo = 1) {
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

  const pastEnd = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
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

  const auto = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    collection_method: "charge_automatically",
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  assert.equal(auto.collection_method, "charge_automatically");
  assert.equal(auto.default_payment_method, fixture.paymentMethod.id);

  const manual = await createSubscription(ORGANIZATION_ID, {
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
      createSubscription(ORGANIZATION_ID, {
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

  const subscription = await createSubscription(ORGANIZATION_ID, {
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

  const subscription = await createSubscription(ORGANIZATION_ID, {
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

  const subscription = await createSubscription(ORGANIZATION_ID, {
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

  await createSubscription(ORGANIZATION_ID, {
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

  const subscription = await createSubscription(ORGANIZATION_ID, {
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

  const subscription = await createSubscription(ORGANIZATION_ID, {
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

  await createSubscription(ORGANIZATION_ID, {
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

test("metered subscriptions reject create_prorations when an initial proration would be required", async () => {
  await resetDb();
  const fixture = await createMeteredFixture();

  await assert.rejects(
    () =>
      createSubscription(ORGANIZATION_ID, {
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

  const firstSubscription = await createSubscription(ORGANIZATION_ID, {
    customer: first.customer.id,
    default_payment_method: first.paymentMethod.id,
    items: [{ price: first.price.id }],
  });
  await createSubscription(ORGANIZATION_ID, {
    customer: second.customer.id,
    default_payment_method: second.paymentMethod.id,
    items: [{ price: second.price.id }],
  });

  const list = await listSubscriptions(ORGANIZATION_ID, {
    customer: first.customer.id,
    limit: 10,
  });

  assert.equal(list.data.length, 1);
  assert.equal(list.data[0]?.id, firstSubscription.id);
});

test("subscription reads do not mutate overdue billing state", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  const { pastStart, pastEnd } = await expireSubscription(subscription.id, 40);
  const reloaded = await getSubscription(ORGANIZATION_ID, subscription.id);

  assert.ok(reloaded);
  assert.equal(reloaded.current_period_start, Math.floor(pastStart.getTime() / 1000));
  assert.equal(reloaded.current_period_end, Math.floor(pastEnd.getTime() / 1000));
});

test("existing subscriptions keep working after their price is archived", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  await updatePrice(ORGANIZATION_ID, fixture.price.id, { active: false });

  const reloaded = await getSubscription(ORGANIZATION_ID, subscription.id);
  assert.ok(reloaded);
  assert.equal(reloaded.status, "active");
});

test("blocks duplicate active or past_due metered subscriptions for the same customer and meter", async () => {
  await resetDb();
  const fixture = await createMeteredFixture();

  await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  await assert.rejects(
    () =>
      createSubscription(ORGANIZATION_ID, {
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
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  await expireSubscription(subscription.id, 2);

  const createdAt = new Date("2026-04-04T10:00:00.000Z");
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
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  await expireSubscription(subscription.id, 2);

  const createdAt = new Date("2026-04-04T10:00:00.000Z");
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
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  await expireSubscription(subscription.id, 2);

  const runAt = new Date("2026-04-04T12:00:00.000Z");
  await createRenewalInvoices(runAt);
  await createRenewalInvoices(runAt);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows.length, 1);
});

test("auto-charge renewals produce a paid invoice and advance the billing period", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const { pastEnd } = await expireSubscription(subscription.id, 2);

  const summary = await processDueSubscriptions({
    runAt: new Date("2026-04-04T13:00:00.000Z"),
    trigger: "test_auto_charge",
  });

  assert.equal(summary.created_invoices, 1);
  assert.equal(summary.paid_invoices, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.status, "paid");

  const renewed = await getSubscription(ORGANIZATION_ID, subscription.id);
  assert.ok(renewed);
  assert.equal(renewed.status, "active");
  assert.equal(renewed.current_period_start, Math.floor(pastEnd.getTime() / 1000));
  assert.ok(renewed.current_period_end > renewed.current_period_start);
});

test("send-invoice renewals create an open invoice and mocked delivery", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    items: [{ price: fixture.price.id }],
  });
  const { pastEnd } = await expireSubscription(subscription.id, 2);

  const summary = await processDueSubscriptions({
    runAt: new Date("2026-04-04T14:00:00.000Z"),
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

  const renewed = await getSubscription(ORGANIZATION_ID, subscription.id);
  assert.ok(renewed);
  assert.equal(renewed.status, "active");
  assert.equal(renewed.current_period_start, Math.floor(pastEnd.getTime() / 1000));

  const invoiceList = await listInvoices(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    limit: 10,
  });
  assert.equal(invoiceList.data.length, 1);
  assert.equal(invoiceList.data[0]?.latest_delivery?.status, "sent");
});

test("metered renewals bill prior-period usage and keep invoice periods on the next cycle", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("sum");
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const { pastStart, pastEnd } = await expireSubscription(subscription.id, 2);

  await createMeterEvent(ORGANIZATION_ID, {
    event_name: fixture.meter.event_name,
    identifier: `evt_${Date.now()}_1`,
    payload: {
      stripe_customer_id: fixture.customer.id,
      value: 3,
    },
    timestamp: Math.floor(new Date(pastStart.getTime() + 60_000).getTime() / 1000),
  });
  await createMeterEvent(ORGANIZATION_ID, {
    event_name: fixture.meter.event_name,
    identifier: `evt_${Date.now()}_2`,
    payload: {
      stripe_customer_id: fixture.customer.id,
      value: 5,
    },
    timestamp: Math.floor(new Date(pastEnd.getTime() - 60_000).getTime() / 1000),
  });

  const summary = await processDueSubscriptions({
    runAt: new Date("2026-04-04T14:30:00.000Z"),
    trigger: "test_metered_sum",
  });

  assert.equal(summary.created_invoices, 1);
  assert.equal(summary.paid_invoices, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.subtotal, 600);
  assert.equal(invoiceRows[0]?.amountDue, 600);
  assert.equal(invoiceRows[0]?.periodStart.getTime(), pastEnd.getTime());

  const lineItems = await getDb().select().from(invoiceLineItems);
  assert.equal(lineItems[0]?.quantity, 8);
  assert.equal(lineItems[0]?.amount, 600);
  assert.equal(lineItems[0]?.periodStart.getTime(), pastStart.getTime());
  assert.equal(lineItems[0]?.periodEnd.getTime(), pastEnd.getTime());

  const renewed = await getSubscription(ORGANIZATION_ID, subscription.id);
  assert.ok(renewed);
  assert.equal(renewed.current_period_start, Math.floor(pastEnd.getTime() / 1000));
});

test("metered renewals support decimal unit amounts and round half up to minor units", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("sum", {
    unit_amount_decimal: "0.01",
  });
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const { pastStart, pastEnd } = await expireSubscription(subscription.id, 2);

  assert.equal(fixture.price.unit_amount, null);
  assert.equal(fixture.price.unit_amount_decimal, "0.01");

  await createMeterEvent(ORGANIZATION_ID, {
    event_name: fixture.meter.event_name,
    identifier: `evt_${Date.now()}_decimal`,
    payload: {
      stripe_customer_id: fixture.customer.id,
      value: 1050,
    },
    timestamp: Math.floor(new Date(pastStart.getTime() + 60_000).getTime() / 1000),
  });

  const summary = await processDueSubscriptions({
    runAt: new Date("2026-04-04T14:35:00.000Z"),
    trigger: "test_metered_decimal",
  });

  assert.equal(summary.created_invoices, 1);
  assert.equal(summary.paid_invoices, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows[0]?.subtotal, 11);
  assert.equal(invoiceRows[0]?.amountDue, 11);
  assert.equal(invoiceRows[0]?.periodStart.getTime(), pastEnd.getTime());

  const lineItems = await getDb().select().from(invoiceLineItems);
  assert.equal(lineItems[0]?.quantity, 1050);
  assert.equal(lineItems[0]?.amount, 11);
  assert.equal(lineItems[0]?.periodStart.getTime(), pastStart.getTime());
  assert.equal(lineItems[0]?.periodEnd.getTime(), pastEnd.getTime());
});

test("zero-usage metered renewals create zero-amount invoices and still advance subscriptions", async () => {
  await resetDb();
  const fixture = await createMeteredFixture("count");
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  const { pastEnd } = await expireSubscription(subscription.id, 2);

  const summary = await processDueSubscriptions({
    runAt: new Date("2026-04-04T14:45:00.000Z"),
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

  const renewed = await getSubscription(ORGANIZATION_ID, subscription.id);
  assert.ok(renewed);
  assert.equal(renewed.current_period_start, Math.floor(pastEnd.getTime() / 1000));
});

test("overdue send-invoice renewals move invoices and subscriptions to past_due", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    collection_method: "send_invoice",
    items: [{ price: fixture.price.id }],
  });
  await expireSubscription(subscription.id, 3);

  await processDueSubscriptions({
    runAt: new Date("2026-04-04T15:00:00.000Z"),
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

  const pastDueSubscription = await getSubscription(ORGANIZATION_ID, subscription.id);
  assert.ok(pastDueSubscription);
  assert.equal(pastDueSubscription.status, "past_due");
});

test("cancel_at_period_end cancels at the boundary without creating a renewal invoice", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  await updateSubscription(ORGANIZATION_ID, subscription.id, {
    cancel_at_period_end: true,
  });
  await expireSubscription(subscription.id, 2);

  const summary = await processDueSubscriptions({
    runAt: new Date("2026-04-04T17:00:00.000Z"),
    trigger: "test_cancel_at_period_end",
  });

  assert.equal(summary.canceled_subscriptions, 1);

  const invoiceRows = await getDb().select().from(invoices);
  assert.equal(invoiceRows.length, 0);

  const canceled = await getSubscription(ORGANIZATION_ID, subscription.id);
  assert.ok(canceled);
  assert.equal(canceled.status, "canceled");
});

test("blocks customer deletion while active or past_due subscriptions exist", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  let result = await deleteCustomer(ORGANIZATION_ID, fixture.customer.id);
  assert.equal(result, "has_subscriptions");

  await dbSetAllSubscriptionsPastDue();
  result = await deleteCustomer(ORGANIZATION_ID, fixture.customer.id);
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
  const subscription = await createSubscription(ORGANIZATION_ID, {
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

  await detachPaymentMethod(ORGANIZATION_ID, fixture.paymentMethod.id);
  const canceled = await getSubscription(ORGANIZATION_ID, subscription.id);

  assert.ok(canceled);
  assert.equal(canceled.status, "canceled");
});

test("billing processor stores its last run summary in processor state", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();
  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });
  await expireSubscription(subscription.id, 2);

  const summary = await processDueSubscriptions({
    runAt: new Date("2026-04-04T18:00:00.000Z"),
    trigger: "test_processor_state",
  });

  assert.equal(summary.created_invoices, 1);

  const state = await getBillingProcessorState();
  assert.equal(state.last_summary?.created_invoices, 1);
  assert.equal(state.last_summary?.paid_invoices, 1);
});

test.after(async () => {
  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
});
