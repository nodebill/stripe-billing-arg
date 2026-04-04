import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { ensureTables, getDb } from "../infrastructure/database/client";
import {
  customers,
  paymentMethods,
  prices,
  products,
  subscriptionItems,
  subscriptions,
} from "../infrastructure/database/schema";
import { createCustomer, deleteCustomer } from "../modules/customers/service";
import {
  attachPaymentMethod,
  createPaymentMethod,
  detachPaymentMethod,
} from "../modules/payment-methods/service";
import { createPrice, updatePrice } from "../modules/prices/service";
import { createProduct } from "../modules/products/service";
import {
  cancelSubscription,
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

  await db.delete(subscriptionItems);
  await db.delete(subscriptions);
  await db.delete(paymentMethods);
  await db.delete(prices);
  await db.delete(products);
  await db.delete(customers);
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

test("creates a subscription for one attached payment method and one recurring price", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  assert.equal(subscription.customer, fixture.customer.id);
  assert.equal(subscription.default_payment_method, fixture.paymentMethod.id);
  assert.equal(subscription.status, "active");
  assert.equal(subscription.items.length, 1);
  assert.equal(subscription.items[0]?.price, fixture.price.id);
});

test("rejects invalid subscription creation inputs at the service layer", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  await assert.rejects(
    () =>
      createSubscription(ORGANIZATION_ID, {
        customer: fixture.customer.id,
        default_payment_method: fixture.paymentMethod.id,
        items: [],
      }),
    (error: unknown) =>
      error instanceof SubscriptionError && error.code === "invalid_items"
  );

  const secondCustomer = await createCustomer(ORGANIZATION_ID, {
    email: `other-${Date.now()}@example.com`,
  });
  await assert.rejects(
    () =>
      createSubscription(ORGANIZATION_ID, {
        customer: secondCustomer.id,
        default_payment_method: fixture.paymentMethod.id,
        items: [{ price: fixture.price.id }],
      }),
    (error: unknown) =>
      error instanceof SubscriptionError &&
      error.code === "payment_method_customer_mismatch"
  );

  const oneTimePrice = await createPrice(ORGANIZATION_ID, {
    product: fixture.product.id,
    currency: "usd",
    unit_amount: 999,
    type: "one_time",
  });

  if (!oneTimePrice) {
    throw new Error("Expected one-time price fixture to be created");
  }

  await assert.rejects(
    () =>
      createSubscription(ORGANIZATION_ID, {
        customer: fixture.customer.id,
        default_payment_method: fixture.paymentMethod.id,
        items: [{ price: oneTimePrice.id }],
      }),
    (error: unknown) =>
      error instanceof SubscriptionError && error.code === "invalid_price"
  );

  await updatePrice(ORGANIZATION_ID, fixture.price.id, { active: false });

  await assert.rejects(
    () =>
      createSubscription(ORGANIZATION_ID, {
        customer: fixture.customer.id,
        default_payment_method: fixture.paymentMethod.id,
        items: [{ price: fixture.price.id }],
      }),
    (error: unknown) =>
      error instanceof SubscriptionError && error.code === "invalid_price"
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

test("normalizes a period-end cancellation to canceled when the current period has ended", async () => {
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

  const db = getDb();
  const pastStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const pastEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);

  await db
    .update(subscriptions)
    .set({
      currentPeriodStart: pastStart,
      currentPeriodEnd: pastEnd,
    })
    .where(eq(subscriptions.id, subscription.id));

  const normalized = await getSubscription(ORGANIZATION_ID, subscription.id);

  assert.ok(normalized);
  assert.equal(normalized.status, "canceled");
  assert.equal(normalized.cancel_at_period_end, false);
  assert.equal(normalized.ended_at, Math.floor(pastEnd.getTime() / 1000));
});

test("rolls the billing period forward for active subscriptions when read", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  const db = getDb();
  const pastStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const pastEnd = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  await db
    .update(subscriptions)
    .set({
      currentPeriodStart: pastStart,
      currentPeriodEnd: pastEnd,
    })
    .where(eq(subscriptions.id, subscription.id));

  const normalized = await getSubscription(ORGANIZATION_ID, subscription.id);

  assert.ok(normalized);
  assert.equal(normalized.status, "active");
  assert.ok(normalized.current_period_end > Math.floor(Date.now() / 1000));
});

test("supports cancel at period end and immediate cancellation", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  const scheduled = await updateSubscription(ORGANIZATION_ID, subscription.id, {
    cancel_at_period_end: true,
  });
  assert.equal(scheduled.cancel_at_period_end, true);

  const resumed = await updateSubscription(ORGANIZATION_ID, subscription.id, {
    cancel_at_period_end: false,
  });
  assert.equal(resumed.cancel_at_period_end, false);

  const canceled = await cancelSubscription(ORGANIZATION_ID, subscription.id);
  assert.equal(canceled.status, "canceled");

  await assert.rejects(
    () =>
      updateSubscription(ORGANIZATION_ID, subscription.id, {
        cancel_at_period_end: true,
      }),
    (error: unknown) =>
      error instanceof SubscriptionError && error.code === "already_canceled"
  );
});

test("detaching a payment method immediately cancels dependent subscriptions", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  const subscription = await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  await detachPaymentMethod(ORGANIZATION_ID, fixture.paymentMethod.id);
  const canceled = await getSubscription(ORGANIZATION_ID, subscription.id);

  assert.ok(canceled);
  assert.equal(canceled.status, "canceled");
});

test("blocks customer deletion while active subscriptions exist", async () => {
  await resetDb();
  const fixture = await createRecurringFixture();

  await createSubscription(ORGANIZATION_ID, {
    customer: fixture.customer.id,
    default_payment_method: fixture.paymentMethod.id,
    items: [{ price: fixture.price.id }],
  });

  const result = await deleteCustomer(ORGANIZATION_ID, fixture.customer.id);
  assert.equal(result, "has_subscriptions");
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

test.after(async () => {
  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
});
