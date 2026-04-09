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

test("imports valid customer rows including metadata and address", async () => {
  await resetDb();

  const csv = [
    "name,email,description,address_line1,address_line2,address_city,address_state,address_postal_code,address_country,tax_id_type,tax_id_value,payment_method_billing_name,metadata.external_id,metadata.segment",
    "Jane Smith,jane@example.com,VIP account,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR,ar_cuit,30-12345678-9,Cuenta corriente,crm_123,enterprise",
    "ACME,,,,,,,,,,,,,",
  ].join("\n");

  const result = await importCustomers(csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 2);
  assert.equal(result.failed_count, 0);
  assert.equal(result.created[0]?.metadata.external_id, "crm_123");
  assert.equal(result.created[0]?.metadata.segment, "enterprise");
  assert.deepEqual(result.created[0]?.address, {
    line1: "Av. Corrientes 1234",
    city: "Buenos Aires",
    state: "CABA",
    postal_code: "C1043",
    country: "AR",
  });

  const storedCustomers = await getDb().select().from(customers);
  const importedWithTaxId = storedCustomers.find(
    (customer) => customer.email === "jane@example.com"
  );
  assert.equal(importedWithTaxId?.taxId?.type, "ar_cuit");
  assert.equal(importedWithTaxId?.taxId?.value, "30-12345678-9");

  const storedPaymentMethods = await getDb().select().from(paymentMethods);
  const importedPaymentMethod = storedPaymentMethods.find(
    (paymentMethod) => paymentMethod.customerId === importedWithTaxId?.id
  );
  assert.equal(importedPaymentMethod?.billingName, "Cuenta corriente");
});

test("supports the legacy external_id header as metadata.external_id", async () => {
  await resetDb();

  const csv = [
    "name,email,description,address_line1,address_line2,address_city,address_state,address_postal_code,address_country,tax_id_type,tax_id_value,payment_method_billing_name,external_id,metadata.segment",
    "Jane Smith,jane@example.com,VIP account,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR,,,,crm_legacy,enterprise",
  ].join("\n");

  const result = await importCustomers(csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 1);
  assert.equal(result.failed_count, 0);
  assert.deepEqual(result.created[0]?.metadata, {
    external_id: "crm_legacy",
    segment: "enterprise",
  });
});

test("metadata.external_id overrides the legacy external_id header", async () => {
  await resetDb();

  const csv = [
    "name,email,description,address_line1,address_line2,address_city,address_state,address_postal_code,address_country,tax_id_type,tax_id_value,payment_method_billing_name,external_id,metadata.external_id",
    "Jane Smith,jane@example.com,VIP account,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR,,,,crm_legacy,crm_new",
  ].join("\n");

  const result = await importCustomers(csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 1);
  assert.equal(result.failed_count, 0);
  assert.equal(result.created[0]?.metadata.external_id, "crm_new");
});

test("invalid customer rows fail individually", async () => {
  await resetDb();

  const csv = [
    "name,email,description,address_line1,address_line2,address_city,address_state,address_postal_code,address_country,tax_id_type,tax_id_value,payment_method_billing_name,metadata.external_id",
    "Jane Smith,not-an-email,VIP account,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR,,,,crm_123",
    "John Smith,john@example.com,Valid row,Av. Santa Fe 1,,Buenos Aires,CABA,C1000,AR,ar_cuit,30-11111111-1,Tarjeta empresa,crm_456",
    "Address only,address@example.com,,,Piso 4,Buenos Aires,CABA,C1001,AR,,,,crm_789",
    "Tax ID partial,tax@example.com,Partial tax row,,,,,,,,ar_cuit,,crm_999",
  ].join("\n");

  const result = await importCustomers(csv);

  assert.ok(!("type" in result));
  assert.equal(result.created_count, 1);
  assert.equal(result.failed_count, 3);
  assert.deepEqual(
    result.errors.map((error) => error.row),
    [2, 4, 5]
  );
});

test("blank rows are ignored during customer import", async () => {
  await resetDb();

  const csv = [
    "name,email,description,address_line1,address_line2,address_city,address_state,address_postal_code,address_country,tax_id_type,tax_id_value,payment_method_billing_name,metadata.external_id",
    "",
    "Jane Smith,jane@example.com,VIP account,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR,,,,crm_123",
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
    "name,email,description,address_line1,address_line2,address_city,address_state,address_postal_code,address_country,tax_id_type,tax_id_value,payment_method_billing_name,email\nJane,jane@example.com,,,,,,,,,,,"
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

  const invalidMetadataHeader = await importCustomers(
    "name,email,description,address_line1,address_line2,address_city,address_state,address_postal_code,address_country,tax_id_type,tax_id_value,payment_method_billing_name,metadata.\nJane,jane@example.com,,,,,,,,,,,"
  );
  assert.ok("type" in invalidMetadataHeader);
  if (!("type" in invalidMetadataHeader)) {
    throw new Error("Expected invalid metadata header error");
  }
  assert.equal(invalidMetadataHeader.type, "file_error");

  const partialTaxIdHeaders = await importCustomers(
    "name,email,description,address_line1,address_line2,address_city,address_state,address_postal_code,address_country,tax_id_type\nJane,jane@example.com,,,,,,,,ar_cuit"
  );
  assert.ok("type" in partialTaxIdHeaders);
  if (!("type" in partialTaxIdHeaders)) {
    throw new Error("Expected tax ID header pair error");
  }
  assert.equal(partialTaxIdHeaders.type, "file_error");

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
