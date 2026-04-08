import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
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
import { createCustomer } from "../modules/customers/service";
import {
  importSubscriptions,
  parseSubscriptionImportCsv,
} from "../modules/subscriptions/import";
import { createMeter } from "../modules/meters/service";
import {
  attachPaymentMethod,
  createPaymentMethod,
} from "../modules/payment-methods/service";
import { createPrice } from "../modules/prices/service";
import { createProduct } from "../modules/products/service";
import { createSubscription } from "../modules/subscriptions/service";

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

async function createAttachedPaymentMethod(customerId: string) {
  const paymentMethod = await createPaymentMethod({
    type: "custom",
    billing_details: {
      name: `PM ${customerId}`,
    },
  });

  await attachPaymentMethod(paymentMethod.id, {
    customer: customerId,
  });

  return paymentMethod;
}

async function createRecurringPriceForProduct(
  productId: string,
  interval: "month" | "year",
  unitAmount = 2500
) {
  const price = await createPrice({
    product: productId,
    currency: "ars",
    unit_amount: unitAmount,
    type: "recurring",
    recurring: {
      interval,
      interval_count: 1,
      usage_type: "licensed",
    },
  });

  if (!price || "error" in price) {
    throw new Error("Expected recurring price fixture to be created");
  }

  return price;
}

async function createMeteredPriceForProduct(productId: string) {
  const meter = await createMeter({
    display_name: `Meter ${Date.now()}`,
    event_name: `metered_${Date.now()}`,
    default_aggregation: { formula: "sum" },
  });

  if ("error" in meter) {
    throw new Error(meter.error);
  }

  const price = await createPrice({
    product: productId,
    currency: "ars",
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
    throw new Error("Expected metered price fixture to be created");
  }

  return { meter, price };
}

function getFirstDayOfCurrentUtcMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

test("imports valid subscriptions for multiple customers", async () => {
  await resetDb();

  const product = await createProduct({ name: "Subscriptions import" });
  const monthlyPrice = await createRecurringPriceForProduct(product.id, "month");
  const yearlyPrice = await createRecurringPriceForProduct(product.id, "year", 12000);

  const customerOne = await createCustomer({ email: "one@example.com" });
  const customerTwo = await createCustomer({ email: "two@example.com" });
  const customerThree = await createCustomer({ email: "three@example.com" });
  const paymentMethodOne = await createAttachedPaymentMethod(customerOne.id);
  const paymentMethodThree = await createAttachedPaymentMethod(customerThree.id);

  const csv = [
    "customer,price,collection_method,default_payment_method,billing_cycle_mode,billing_day_of_month,billing_month,backdate_start_date,proration_behavior",
    `${customerOne.id},${monthlyPrice.id},charge_automatically,${paymentMethodOne.id},start_today,,,,`,
    `${customerTwo.id},${monthlyPrice.id},send_invoice,,align_renewal,15,,,`,
    `${customerThree.id},${yearlyPrice.id},charge_automatically,${paymentMethodThree.id},align_renewal,20,10,,none`,
  ].join("\n");

  const result = await importSubscriptions(csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 3);
  assert.equal(result.failed_count, 0);
  assert.equal(result.created[0]?.customer, customerOne.id);
  assert.equal(result.created[1]?.collection_method, "send_invoice");

  const monthlyAlignedEnd = new Date(result.created[1]!.current_period_end * 1000);
  assert.equal(monthlyAlignedEnd.getUTCDate(), 15);

  const yearlyAlignedEnd = new Date(result.created[2]!.current_period_end * 1000);
  assert.equal(yearlyAlignedEnd.getUTCDate(), 20);
  assert.equal(yearlyAlignedEnd.getUTCMonth() + 1, 10);
});

test("subscription import defaults blank modal-style fields", async () => {
  await resetDb();

  const product = await createProduct({ name: "Defaults import" });
  const monthlyPrice = await createRecurringPriceForProduct(product.id, "month");
  const customer = await createCustomer({ email: "defaults@example.com" });
  const paymentMethod = await createAttachedPaymentMethod(customer.id);

  const csv = [
    "customer,price,collection_method,default_payment_method,billing_cycle_mode,billing_day_of_month,billing_month,backdate_start_date,proration_behavior",
    `${customer.id},${monthlyPrice.id},,${paymentMethod.id},,,,,`,
  ].join("\n");

  const result = await importSubscriptions(csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 1);
  assert.equal(result.created[0]?.collection_method, "charge_automatically");
  assert.equal(result.created[0]?.default_payment_method, paymentMethod.id);
});

test("backdated subscription rows convert YYYY-MM-DD to UTC midnight timestamps", async () => {
  await resetDb();

  const product = await createProduct({ name: "Backdate import" });
  const monthlyPrice = await createRecurringPriceForProduct(product.id, "month");
  const customer = await createCustomer({ email: "backdate@example.com" });
  const paymentMethod = await createAttachedPaymentMethod(customer.id);
  const backdate = getFirstDayOfCurrentUtcMonth();
  const expectedTimestamp = Math.floor(
    Date.parse(`${backdate}T00:00:00.000Z`) / 1000
  );

  const csv = [
    "customer,price,collection_method,default_payment_method,billing_cycle_mode,billing_day_of_month,billing_month,backdate_start_date,proration_behavior",
    `${customer.id},${monthlyPrice.id},charge_automatically,${paymentMethod.id},backdate_start,,,${backdate},none`,
  ].join("\n");

  const result = await importSubscriptions(csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 1);
  assert.equal(result.created[0]?.current_period_start, expectedTimestamp);
});

test("subscription import reports row-level failures without blocking valid rows", async () => {
  await resetDb();

  const product = await createProduct({ name: "Failures import" });
  const monthlyPrice = await createRecurringPriceForProduct(product.id, "month");
  const { price: meteredPrice } = await createMeteredPriceForProduct(product.id);
  const customer = await createCustomer({ email: "valid@example.com" });
  const conflictCustomer = await createCustomer({ email: "conflict@example.com" });
  const validPaymentMethod = await createAttachedPaymentMethod(customer.id);
  const conflictPaymentMethod = await createAttachedPaymentMethod(conflictCustomer.id);
  const unattachedPaymentMethod = await createPaymentMethod({
    type: "custom",
    billing_details: { name: "Detached" },
  });

  await createSubscription({
    customer: conflictCustomer.id,
    collection_method: "charge_automatically",
    default_payment_method: conflictPaymentMethod.id,
    proration_behavior: "none",
    items: [{ price: meteredPrice.id }],
  });

  const csv = [
    "customer,price,collection_method,default_payment_method,billing_cycle_mode,billing_day_of_month,billing_month,backdate_start_date,proration_behavior",
    `${customer.id},${monthlyPrice.id},charge_automatically,${validPaymentMethod.id},start_today,,,,`,
    `bad_customer,${monthlyPrice.id},charge_automatically,${validPaymentMethod.id},start_today,,,,`,
    `cus_missing,${monthlyPrice.id},charge_automatically,${validPaymentMethod.id},start_today,,,,`,
    `${customer.id},price_missing,charge_automatically,${validPaymentMethod.id},start_today,,,,`,
    `${customer.id},${monthlyPrice.id},charge_automatically,${unattachedPaymentMethod.id},start_today,,,,`,
    `${conflictCustomer.id},${meteredPrice.id},charge_automatically,${conflictPaymentMethod.id},start_today,,,,`,
    `${customer.id},${meteredPrice.id},charge_automatically,${validPaymentMethod.id},backdate_start,,,${getFirstDayOfCurrentUtcMonth()},create_prorations`,
  ].join("\n");

  const result = await importSubscriptions(csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 1);
  assert.equal(result.failed_count, 6);
  assert.match(result.errors[0]?.message ?? "", /valid cus_/i);
  assert.match(result.errors[1]?.message ?? "", /No such customer/i);
  assert.match(result.errors[2]?.message ?? "", /invalid_price|active recurring/i);
  assert.match(result.errors[3]?.message ?? "", /attached to a customer/i);
  assert.match(result.errors[4]?.message ?? "", /at most one active or past_due subscription/i);
  assert.match(result.errors[5]?.message ?? "", /not supported for metered prices/i);
});

test("subscription import rejects malformed files at file level", async () => {
  await resetDb();

  const duplicateHeaders = parseSubscriptionImportCsv(
    "customer,price,collection_method,default_payment_method,billing_cycle_mode,billing_day_of_month,billing_month,backdate_start_date,proration_behavior,price\ncus_1,price_1,,,,,,,,"
  );
  assert.ok("type" in duplicateHeaders);
  if (!("type" in duplicateHeaders)) {
    throw new Error("Expected duplicate header error");
  }
  assert.equal(duplicateHeaders.type, "file_error");

  const missingHeaders = await importSubscriptions(
    "customer,price\ncus_1,price_1"
  );
  assert.ok("type" in missingHeaders);
  if (!("type" in missingHeaders)) {
    throw new Error("Expected missing header error");
  }
  assert.equal(missingHeaders.type, "file_error");

  const emptyFile = await importSubscriptions("");
  assert.ok("type" in emptyFile);
  if (!("type" in emptyFile)) {
    throw new Error("Expected empty file error");
  }
  assert.equal(emptyFile.type, "file_error");
});

test.after(async () => {
  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
});
