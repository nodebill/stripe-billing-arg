import assert from "node:assert/strict";
import test from "node:test";
import { ensureTables, getDb } from "../infrastructure/database/client";
import {
  customers,
  invoiceDeliveries,
  invoiceLineItems,
  invoices,
  paymentMethods,
  subscriptions,
} from "../infrastructure/database/schema";
import {
  importCustomers,
  parseCustomerImportCsv,
} from "../modules/customers/import";

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
  await db.delete(subscriptions);
  await db.delete(paymentMethods);
  await db.delete(customers);
}

test("imports valid customer rows including external_id and address", async () => {
  await resetDb();

  const csv = [
    "name,email,description,external_id,address_line1,address_line2,address_city,address_state,address_postal_code,address_country",
    "Jane Smith,jane@example.com,VIP account,crm_123,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR",
    "ACME,,,,,,,,,",
  ].join("\n");

  const result = await importCustomers(csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 2);
  assert.equal(result.failed_count, 0);
  assert.equal(result.created[0]?.metadata.external_id, "crm_123");
  assert.deepEqual(result.created[0]?.address, {
    line1: "Av. Corrientes 1234",
    city: "Buenos Aires",
    state: "CABA",
    postal_code: "C1043",
    country: "AR",
  });
});

test("invalid customer rows fail individually", async () => {
  await resetDb();

  const csv = [
    "name,email,description,external_id,address_line1,address_line2,address_city,address_state,address_postal_code,address_country",
    "Jane Smith,not-an-email,VIP account,crm_123,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR",
    "John Smith,john@example.com,Valid row,crm_456,Av. Santa Fe 1,,Buenos Aires,CABA,C1000,AR",
    "Address only,address@example.com,,crm_789,,Piso 4,Buenos Aires,CABA,C1001,AR",
  ].join("\n");

  const result = await importCustomers(csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 1);
  assert.equal(result.failed_count, 2);
  assert.deepEqual(
    result.errors.map((error) => error.row),
    [2, 4]
  );
});

test("blank rows are ignored during customer import", async () => {
  await resetDb();

  const csv = [
    "name,email,description,external_id,address_line1,address_line2,address_city,address_state,address_postal_code,address_country",
    "",
    "Jane Smith,jane@example.com,VIP account,crm_123,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR",
    "",
  ].join("\n");

  const result = await importCustomers(csv);

  assert.ok(!("type" in result));
  assert.equal(result.total_rows, 1);
  assert.equal(result.created_count, 1);
});

test("customer import rejects malformed files at file level", async () => {
  await resetDb();

  const duplicateHeaders = parseCustomerImportCsv(
    "name,email,description,external_id,address_line1,address_line2,address_city,address_state,address_postal_code,address_country,email\nJane,jane@example.com,,,,,,,,,"
  );
  assert.ok("type" in duplicateHeaders);
  if (!("type" in duplicateHeaders)) {
    throw new Error("Expected duplicate header error");
  }
  assert.equal(duplicateHeaders.type, "file_error");

  const missingHeaders = await importCustomers(
    "name,email\nJane,jane@example.com"
  );
  assert.ok("type" in missingHeaders);
  if (!("type" in missingHeaders)) {
    throw new Error("Expected missing header error");
  }
  assert.equal(missingHeaders.type, "file_error");

  const emptyFile = await importCustomers("");
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
