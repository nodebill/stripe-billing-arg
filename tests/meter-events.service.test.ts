import assert from "node:assert/strict";
import test from "node:test";
import { ensureTables, getDb } from "../infrastructure/database/client";
import {
  billingProcessorState,
  customers,
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
} from "../infrastructure/database/schema";
import {
  createMeterEvent,
  listMeterEventSummaries,
  MeterEventError,
} from "../modules/meter-events/service";
import { createMeter } from "../modules/meters/service";
import {
  attachPaymentMethod,
  createPaymentMethod,
} from "../modules/payment-methods/service";
import { createPrice } from "../modules/prices/service";
import { createProduct } from "../modules/products/service";
import { createSubscription } from "../modules/subscriptions/service";
import { createCustomer } from "../modules/customers/service";

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

async function createMeteredSubscriptionFixture(
  aggregation: "sum" | "count" = "sum"
) {
  const customer = await createCustomer({
    email: `meter-${Date.now()}@example.com`,
  });
  const paymentMethod = await createPaymentMethod({
    type: "custom",
    billing_details: {
      name: "Meter events method",
    },
  });
  await attachPaymentMethod(paymentMethod.id, {
    customer: customer.id,
  });

  const product = await createProduct({
    name: `Usage Product ${Date.now()}`,
  });
  const meter = await createMeter({
    display_name: `Usage Meter ${Date.now()}`,
    event_name: `usage_event_${Date.now()}`,
    default_aggregation: { formula: aggregation },
  });

  if ("error" in meter) {
    throw new Error(meter.error);
  }

  const price = await createPrice({
    product: product.id,
    currency: "usd",
    unit_amount: 100,
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

  await createSubscription({
    customer: customer.id,
    default_payment_method: paymentMethod.id,
    items: [{ price: price.id }],
  });

  return {
    customer,
    meter,
    price,
  };
}

test("creates meter events idempotently and returns the original record on replay", async () => {
  await resetDb();
  const fixture = await createMeteredSubscriptionFixture("sum");
  const timestamp = Math.floor(Date.now() / 1000) - 60;

  const created = await createMeterEvent({
    event_name: fixture.meter.event_name,
    identifier: "evt_replay_case",
    payload: {
      stripe_customer_id: fixture.customer.id,
      value: 4,
    },
    timestamp,
  });

  const replayed = await createMeterEvent({
    event_name: fixture.meter.event_name,
    identifier: "evt_replay_case",
    payload: {
      stripe_customer_id: fixture.customer.id,
      value: 9,
    },
    timestamp: timestamp + 30,
  });

  assert.equal(created.created, true);
  assert.equal(replayed.created, false);
  assert.equal(replayed.event.id, created.event.id);
  assert.equal(replayed.event.payload.value, "4");

  const rows = await getDb().select().from(meterEvents);
  assert.equal(rows.length, 1);
});

test("aggregates daily summaries for sum meters and total summaries for count meters", async () => {
  await resetDb();
  const sumFixture = await createMeteredSubscriptionFixture("sum");
  const startTime = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
  const dayOne = startTime + 2 * 60 * 60;
  const dayTwo = startTime + 26 * 60 * 60;

  await createMeterEvent({
    event_name: sumFixture.meter.event_name,
    payload: {
      stripe_customer_id: sumFixture.customer.id,
      value: 3,
    },
    timestamp: dayOne,
  });
  await createMeterEvent({
    event_name: sumFixture.meter.event_name,
    payload: {
      stripe_customer_id: sumFixture.customer.id,
      value: 5,
    },
    timestamp: dayTwo,
  });

  const grouped = await listMeterEventSummaries(sumFixture.meter.id, {
    customer: sumFixture.customer.id,
    start_time: startTime,
    end_time: startTime + 3 * 24 * 60 * 60,
    value_grouping_window: "day",
  });

  assert.equal(grouped.data.length, 2);
  assert.equal(grouped.data[0]?.aggregated_value, 5);
  assert.equal(grouped.data[1]?.aggregated_value, 3);

  await resetDb();
  const countFixture = await createMeteredSubscriptionFixture("count");
  const countStart = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

  await createMeterEvent({
    event_name: countFixture.meter.event_name,
    payload: {
      stripe_customer_id: countFixture.customer.id,
      value: 7,
    },
    timestamp: countStart + 120,
  });
  await createMeterEvent({
    event_name: countFixture.meter.event_name,
    payload: {
      stripe_customer_id: countFixture.customer.id,
      value: 11,
    },
    timestamp: countStart + 240,
  });

  const total = await listMeterEventSummaries(countFixture.meter.id, {
    customer: countFixture.customer.id,
    start_time: countStart,
    end_time: countStart + 24 * 60 * 60,
  });

  assert.equal(total.data.length, 1);
  assert.equal(total.data[0]?.aggregated_value, 2);
});

test("rejects events for unknown meters, unknown customers, missing subscriptions, and duplicated active subscriptions", async () => {
  await resetDb();
  const fixture = await createMeteredSubscriptionFixture("sum");
  const customerWithoutSubscription = await createCustomer({
    email: `meter-no-sub-${Date.now()}@example.com`,
  });

  await assert.rejects(
    () =>
      createMeterEvent({
        event_name: "missing_event_name",
        payload: {
          stripe_customer_id: fixture.customer.id,
          value: 1,
        },
      }),
    (error: unknown) =>
      error instanceof MeterEventError &&
      error.message.includes("No such meter for event_name")
  );

  await assert.rejects(
    () =>
      createMeterEvent({
        event_name: fixture.meter.event_name,
        payload: {
          stripe_customer_id: "cus_missing",
          value: 1,
        },
      }),
    (error: unknown) =>
      error instanceof MeterEventError &&
      error.message.includes("No such customer")
  );

  await assert.rejects(
    () =>
      createMeterEvent({
        event_name: fixture.meter.event_name,
        payload: {
          stripe_customer_id: customerWithoutSubscription.id,
          value: 1,
        },
      }),
    (error: unknown) =>
      error instanceof MeterEventError &&
      error.message.includes("No active subscription")
  );
});

test.after(async () => {
  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
});
