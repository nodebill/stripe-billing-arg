import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { ensureTables, getDb } from "../infrastructure/database/client";
import { customers } from "../infrastructure/database/schema";
import {
  createCustomer,
  getCustomer,
  searchCustomers,
} from "../modules/customers/service";

const runtime = globalThis as typeof globalThis & {
  __stripeBillingPGlite?: { close: () => Promise<void> };
  __stripeBillingPool?: { end: () => Promise<void> };
};

async function resetDb() {
  await ensureTables();
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
    externalId: "crm_shared",
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
    externalId: "crm_page",
    limit: 2,
  });

  assert.equal(firstPage.has_more, true);
  assert.equal(firstPage.next_page, second.id);
  assert.deepEqual(
    firstPage.data.map((customer) => customer.id),
    [third.id, second.id]
  );

  const secondPage = await searchCustomers({
    externalId: "crm_page",
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

test.after(async () => {
  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
});
