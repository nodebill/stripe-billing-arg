import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { ensureTables, getDb } from "../infrastructure/database/client";
import {
  billingProcessorState,
  invoiceDeliveries,
  invoiceLineItems,
  invoices,
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
  await db.delete(paymentMethods);
  await db.delete(prices);
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
    },
  });

  if (!price) {
    throw new Error("Expected recurring price fixture to be created");
  }

  return {
    customer,
    paymentMethod,
    product,
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
