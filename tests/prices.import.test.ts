import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { ensureTables, getDb } from "../infrastructure/database/client";
import { meterEvents, meters, prices, products } from "../infrastructure/database/schema";
import {
  importPricesForProduct,
  parsePriceImportCsv,
} from "../modules/prices/import";
import { createMeter, deactivateMeter } from "../modules/meters/service";
import { createProduct, getProduct } from "../modules/products/service";

const runtime = globalThis as typeof globalThis & {
  __stripeBillingPGlite?: { close: () => Promise<void> };
  __stripeBillingPool?: { end: () => Promise<void> };
};

async function resetDb() {
  await ensureTables();
  const db = getDb();

  await db.delete(meterEvents);
  await db.delete(prices);
  await db.delete(meters);
  await db.delete(products);
}

test("imports valid one-time and recurring rows with metadata", async () => {
  await resetDb();

  const product = await createProduct({ name: "Import target" });
  const csv = [
    "currency,type,unit_amount,unit_amount_decimal,nickname,active,interval,usage_type,meter,metadata.region,metadata.plan_code",
    "ars,one_time,1000,,Setup fee,true,,,,ar,setup",
    "ars,recurring,2500,,Base mensual,true,month,licensed,,ar,base",
    "",
  ].join("\n");

  const result = await importPricesForProduct(product.id, csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 2);
  assert.equal(result.failed_count, 0);
  assert.equal(result.total_rows, 2);
  assert.deepEqual(
    result.created.map((price) => price.metadata),
    [
      { region: "ar", plan_code: "setup" },
      { region: "ar", plan_code: "base" },
    ]
  );
});

test("imports metered recurring rows when the meter is active", async () => {
  await resetDb();

  const product = await createProduct({ name: "Metered import target" });
  const meter = await createMeter({
    display_name: "Processed volume",
    event_name: `processed_${Date.now()}`,
    default_aggregation: { formula: "sum" },
  });

  if ("error" in meter) {
    throw new Error(meter.error);
  }

  const csv = [
    "currency,type,unit_amount,unit_amount_decimal,nickname,active,interval,usage_type,meter",
    `ars,recurring,,0.01,Volumen,true,month,metered,${meter.id}`,
  ].join("\n");

  const result = await importPricesForProduct(product.id, csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 1);
  assert.equal(result.failed_count, 0);
  assert.equal(result.created[0]?.meter, meter.id);
});

test("returns partial success when some rows are invalid", async () => {
  await resetDb();

  const product = await createProduct({ name: "Partial import target" });
  const csv = [
    "currency,type,unit_amount,unit_amount_decimal,nickname,active,interval,usage_type,meter",
    "ars,one_time,1000,5,Too many amounts,true,,,",
    "ars,recurring,2500,,Base mensual,true,month,licensed,",
    "ars,recurring,4000,,Missing interval,true,,licensed,",
  ].join("\n");

  const result = await importPricesForProduct(product.id, csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 1);
  assert.equal(result.failed_count, 2);
  assert.deepEqual(
    result.errors.map((error) => error.row),
    [2, 4]
  );
});

test("reports missing or inactive meters per row without blocking valid rows", async () => {
  await resetDb();

  const product = await createProduct({ name: "Meter errors target" });
  const activeMeter = await createMeter({
    display_name: "Active meter",
    event_name: `active_${Date.now()}`,
    default_aggregation: { formula: "sum" },
  });
  const inactiveMeter = await createMeter({
    display_name: "Inactive meter",
    event_name: `inactive_${Date.now()}`,
    default_aggregation: { formula: "sum" },
  });

  if ("error" in activeMeter || "error" in inactiveMeter) {
    throw new Error("Expected both fixture meters to be created");
  }

  await deactivateMeter(inactiveMeter.id);

  const csv = [
    "currency,type,unit_amount,unit_amount_decimal,nickname,active,interval,usage_type,meter",
    "ars,recurring,1200,,Licensed,true,month,licensed,",
    `ars,recurring,,0.01,Unknown,true,month,metered,meter_missing`,
    `ars,recurring,,0.01,Inactive,true,month,metered,${inactiveMeter.id}`,
    "ars,recurring,,0.01,Missing,true,month,metered,",
  ].join("\n");

  const result = await importPricesForProduct(product.id, csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 1);
  assert.equal(result.failed_count, 3);
  assert.match(result.errors[0]?.message ?? "", /No such meter/);
  assert.match(result.errors[1]?.message ?? "", /not active/);
  assert.match(result.errors[2]?.message ?? "", /meter is required/i);
});

test("file-level CSV contract errors abort the whole import", async () => {
  await resetDb();

  const product = await createProduct({ name: "Bad file target" });

  const duplicateHeaders = parsePriceImportCsv(
    "currency,type,unit_amount,unit_amount_decimal,nickname,active,interval,usage_type,meter,meter\nars,one_time,1000,,Test,true,,,"
  );
  assert.ok("type" in duplicateHeaders);
  if (!("type" in duplicateHeaders)) {
    throw new Error("Expected duplicate header error");
  }
  assert.equal(duplicateHeaders.type, "file_error");

  const missingHeaders = await importPricesForProduct(
    product.id,
    "currency,type\nars,one_time"
  );
  assert.ok("type" in missingHeaders);
  if (!("type" in missingHeaders)) {
    throw new Error("Expected missing header error");
  }
  assert.equal(missingHeaders.type, "file_error");

  const emptyFile = await importPricesForProduct(product.id, "");
  assert.ok("type" in emptyFile);
  if (!("type" in emptyFile)) {
    throw new Error("Expected empty file error");
  }
  assert.equal(emptyFile.type, "file_error");
});

test("the first successfully created active row becomes the default price", async () => {
  await resetDb();

  const product = await createProduct({ name: "Default price target" });
  const csv = [
    "currency,type,unit_amount,unit_amount_decimal,nickname,active,interval,usage_type,meter",
    "ars,one_time,1000,0.01,Bad row,true,,,",
    "ars,one_time,1500,,First valid,true,,,",
    "ars,one_time,2500,,Second valid,true,,,",
  ].join("\n");

  const result = await importPricesForProduct(product.id, csv);
  assert.ok(!("type" in result));
  assert.equal(result.created_count, 2);

  const refreshedProduct = await getProduct(product.id);
  assert.ok(refreshedProduct);
  assert.equal(refreshedProduct?.default_price, result.created[0]?.id);
});

test("rows with inconsistent column counts fail individually", async () => {
  await resetDb();

  const product = await createProduct({ name: "Column count target" });
  const csv = [
    "currency,type,unit_amount,unit_amount_decimal,nickname,active,interval,usage_type,meter",
    "ars,one_time,1000,,Valid,true,,,",
    "ars,one_time,1000",
  ].join("\n");

  const result = await importPricesForProduct(product.id, csv);

  assert.ok(!("type" in result));
  assert.equal(result.total_rows, 2);
  assert.equal(result.created_count, 1);
  assert.equal(result.failed_count, 1);
  assert.match(result.errors[0]?.message ?? "", /header defines/);
});

test("created rows are persisted in descending creation order in the database", async () => {
  await resetDb();

  const product = await createProduct({ name: "Persistence target" });
  const csv = [
    "currency,type,unit_amount,unit_amount_decimal,nickname,active,interval,usage_type,meter",
    "ars,one_time,1000,,Uno,true,,,",
    "ars,one_time,2000,,Dos,true,,,",
  ].join("\n");

  const result = await importPricesForProduct(product.id, csv);
  assert.ok(!("type" in result));

  const stored = await getDb()
    .select({ id: prices.id, productId: prices.productId })
    .from(prices)
    .where(eq(prices.productId, product.id));

  assert.equal(stored.length, 2);
  assert.deepEqual(
    stored.map((row) => row.id).sort(),
    result.created.map((price) => price.id).sort()
  );
});

test.after(async () => {
  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
});
