import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { ensureTables, getDb } from "../infrastructure/database/client";
import { customers, paymentMethods } from "../infrastructure/database/schema";
import {
  createCustomer,
  getCustomer,
  listTaxIds,
  searchCustomers,
} from "../modules/customers/service";

const runtime = globalThis as typeof globalThis & {
  __stripeBillingPGlite?: { close: () => Promise<void> };
  __stripeBillingPool?: { end: () => Promise<void> };
};

async function resetDb() {
  await ensureTables();
  await getDb().delete(paymentMethods);
  await getDb().delete(customers);
}

async function setCustomerTimestamp(customerId: string, unix: number) {
  await getDb()
    .update(customers)
    .set({
      createdAt: new Date(unix * 1000),
      updatedAt: new Date(unix * 1000),
    })
    .where(eq(customers.id, customerId));
}

test("customer creation persists arbitrary metadata including external_id", async () => {
  await resetDb();

  const created = await createCustomer({
    email: "metadata@example.com",
    metadata: {
      external_id: "crm_123",
      source: "import",
    },
  });

  const fetched = await getCustomer(created.id);

  assert.ok(fetched);
  assert.deepEqual(fetched.metadata, {
    external_id: "crm_123",
    source: "import",
  });
});

test("customer creation can persist a tax ID in the same insert", async () => {
  await resetDb();

  const created = await createCustomer({
    email: "taxid@example.com",
    taxId: {
      type: "ar_cuit",
      value: "30-12345678-9",
    },
  });

  const taxIds = await listTaxIds(created.id);
  assert.notEqual(taxIds, "not_found");
  if (taxIds === "not_found") return;

  assert.equal(taxIds.data.length, 1);
  assert.equal(taxIds.data[0]?.type, "ar_cuit");
  assert.equal(taxIds.data[0]?.value, "30-12345678-9");
  assert.equal(taxIds.data[0]?.customer, created.id);
  assert.match(taxIds.data[0]?.id ?? "", /^txi_/);
  assert.equal(typeof taxIds.data[0]?.created, "number");
});

test("customer creation can create an attached custom payment method", async () => {
  await resetDb();

  const created = await createCustomer({
    email: "pm@example.com",
    paymentMethodBillingName: "Cuenta corriente",
  });

  const attachedPaymentMethods = await getDb()
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.customerId, created.id));

  assert.equal(attachedPaymentMethods.length, 1);
  assert.equal(attachedPaymentMethods[0]?.billingName, "Cuenta corriente");
  assert.equal(attachedPaymentMethods[0]?.customerId, created.id);
});

test("customer search returns only exact external_id matches in descending order", async () => {
  await resetDb();

  const first = await createCustomer({
    email: "first@example.com",
    metadata: { external_id: "crm_shared" },
  });
  const second = await createCustomer({
    email: "second@example.com",
    metadata: { external_id: "crm_shared" },
  });
  await createCustomer({
    email: "different@example.com",
    metadata: { external_id: "crm_other" },
  });
  await createCustomer({
    email: "missing@example.com",
  });

  await setCustomerTimestamp(first.id, 1_700_000_000);
  await setCustomerTimestamp(second.id, 1_700_000_100);

  const results = await searchCustomers({
    query_mode: "metadata",
    metadataKey: "external_id",
    metadataValue: "crm_shared",
  });

  assert.equal(results.object, "search_result");
  assert.equal(results.has_more, false);
  assert.equal(results.next_page, null);
  assert.deepEqual(
    results.data.map((customer) => customer.id),
    [second.id, first.id]
  );
});

test("customer search paginates with page based on the last returned customer id", async () => {
  await resetDb();

  const first = await createCustomer({
    email: "page-1@example.com",
    metadata: { external_id: "crm_page" },
  });
  const second = await createCustomer({
    email: "page-2@example.com",
    metadata: { external_id: "crm_page" },
  });
  const third = await createCustomer({
    email: "page-3@example.com",
    metadata: { external_id: "crm_page" },
  });

  await setCustomerTimestamp(first.id, 1_700_000_000);
  await setCustomerTimestamp(second.id, 1_700_000_100);
  await setCustomerTimestamp(third.id, 1_700_000_200);

  const firstPage = await searchCustomers({
    query_mode: "metadata",
    metadataKey: "external_id",
    metadataValue: "crm_page",
    limit: 2,
  });

  assert.equal(firstPage.has_more, true);
  assert.equal(firstPage.next_page, second.id);
  assert.deepEqual(
    firstPage.data.map((customer) => customer.id),
    [third.id, second.id]
  );

  const secondPage = await searchCustomers({
    query_mode: "metadata",
    metadataKey: "external_id",
    metadataValue: "crm_page",
    limit: 2,
    page: firstPage.next_page ?? undefined,
  });

  assert.equal(secondPage.has_more, false);
  assert.equal(secondPage.next_page, null);
  assert.deepEqual(
    secondPage.data.map((customer) => customer.id),
    [first.id]
  );
});

test("customer free-text search matches name, email, id, and external_id", async () => {
  await resetDb();

  const byName = await createCustomer({
    name: "Acme Holdings",
    email: "billing@acme.test",
  });
  const byEmail = await createCustomer({
    email: "ops-team@example.com",
  });
  const byExternalId = await createCustomer({
    email: "external@example.com",
    metadata: { external_id: "crm_9000" },
  });

  await setCustomerTimestamp(byName.id, 1_700_000_000);
  await setCustomerTimestamp(byEmail.id, 1_700_000_100);
  await setCustomerTimestamp(byExternalId.id, 1_700_000_200);

  const byNameResults = await searchCustomers({
    query_mode: "text",
    searchTerm: "acme",
  });
  assert.deepEqual(byNameResults.data.map((customer) => customer.id), [byName.id]);

  const byEmailResults = await searchCustomers({
    query_mode: "text",
    searchTerm: "ops-team",
  });
  assert.deepEqual(byEmailResults.data.map((customer) => customer.id), [byEmail.id]);

  const byIdResults = await searchCustomers({
    query_mode: "text",
    searchTerm: byExternalId.id.slice(0, 10),
  });
  assert.deepEqual(byIdResults.data.map((customer) => customer.id), [byExternalId.id]);

  const byExternalIdResults = await searchCustomers({
    query_mode: "text",
    searchTerm: "crm_9000",
  });
  assert.deepEqual(
    byExternalIdResults.data.map((customer) => customer.id),
    [byExternalId.id]
  );
});

test.after(async () => {
  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
});
