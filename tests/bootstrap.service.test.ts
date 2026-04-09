import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { auth, bootstrapFirstAdmin } from "../infrastructure/auth";
import { ensureTables, getDb } from "../infrastructure/database/client";
import {
  account,
  apikey,
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
  rateLimit,
  session,
  subscriptionItems,
  subscriptionSchedulePhases,
  subscriptionSchedules,
  subscriptions,
  teamInvites,
  user,
  verification,
} from "../infrastructure/database/schema";
import { bootstrapManifest } from "../modules/bootstrap/manifest";
import { bootstrapAccountAndCatalog } from "../modules/bootstrap/service";

const runtime = globalThis as typeof globalThis & {
  __stripeBillingPGlite?: { close: () => Promise<void> };
  __stripeBillingPool?: { end: () => Promise<void> };
};

async function resetBillingTables() {
  await ensureTables();
  const db = getDb();

  await db.delete(invoiceDeliveries);
  await db.delete(invoiceLineItems);
  await db.delete(invoices);
  await db.delete(subscriptionSchedulePhases);
  await db.delete(subscriptionSchedules);
  await db.delete(subscriptionItems);
  await db.delete(subscriptions);
  await db.delete(meterEvents);
  await db.delete(paymentMethods);
  await db.delete(prices);
  await db.delete(meters);
  await db.delete(products);
  await db.delete(customers);
  await db.delete(billingProcessorState);
  await db.delete(rateLimit);
}

async function resetAllTables() {
  await resetBillingTables();
  const db = getDb();

  await db.delete(session);
  await db.delete(account);
  await db.delete(verification);
  await db.delete(apikey);
  await db.delete(teamInvites);
  await db.delete(user);
}

async function countRows(table: typeof user | typeof meters | typeof products) {
  const rows = await getDb().select().from(table);
  return rows.length;
}

async function createRegularUser(email: string) {
  await auth.api.createUser({
    body: {
      email,
      name: "Regular user",
      password: "password-for-regular-user",
      role: "user",
    },
  });
}

test("creates the first admin and base catalog on an empty database", async () => {
  await resetAllTables();

  const result = await bootstrapAccountAndCatalog({
    admin: {
      email: "admin@example.com",
      name: "Bootstrap Admin",
      password: "password-for-bootstrap-admin",
    },
  });

  assert.equal(result.admin.status, "created");
  assert.equal(result.admin.user?.email, "admin@example.com");
  assert.equal(result.admin.user?.role, "admin");
  assert.equal(result.meters.length, 1);
  assert.equal(result.meters[0]?.status, "created");
  assert.equal(result.meters[0]?.value.event_name, "processed_volume");
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0]?.status, "created");
  assert.equal(result.products[0]?.value.name, "Procesamiento de transferencias");
  assert.equal(result.products[0]?.value.default_price, null);
  assert.deepEqual(result.products[0]?.value.metadata, {});
  assert.deepEqual(result.warnings, []);
});

test("rerunning bootstrap is idempotent and skips existing auth users", async () => {
  await resetAllTables();

  await bootstrapAccountAndCatalog({
    admin: {
      email: "admin@example.com",
      name: "Bootstrap Admin",
      password: "password-for-bootstrap-admin",
    },
  });

  const rerun = await bootstrapAccountAndCatalog({
    admin: {
      email: "ignored@example.com",
      name: "Ignored Admin",
      password: "password-for-ignored-admin",
    },
  });

  assert.equal(rerun.admin.status, "skipped_existing_users");
  assert.equal(rerun.meters[0]?.status, "existing");
  assert.equal(rerun.products[0]?.status, "existing");
  assert.equal(await countRows(user), 1);
  assert.equal(await countRows(meters), 1);
  assert.equal(await countRows(products), 1);
  assert.match(rerun.warnings[0] ?? "", /credentials were ignored/i);
});

test("restores catalog after a billing-only reset without recreating auth", async () => {
  await resetAllTables();
  await bootstrapFirstAdmin({
    email: "existing-admin@example.com",
    name: "Existing Admin",
    password: "password-for-existing-admin",
  });
  await resetBillingTables();

  const result = await bootstrapAccountAndCatalog();

  assert.equal(result.admin.status, "skipped_existing_users");
  assert.equal(result.admin.user?.email, "existing-admin@example.com");
  assert.equal(result.meters[0]?.status, "created");
  assert.equal(result.products[0]?.status, "created");
  assert.equal(await countRows(user), 1);
});

test("fails when auth users exist without an admin", async () => {
  await resetAllTables();
  await createRegularUser("user-only@example.com");

  await assert.rejects(
    () => bootstrapAccountAndCatalog(),
    /none have the admin role/i
  );
});

test("fails when admin credentials are missing on an empty auth database", async () => {
  await resetAllTables();

  await assert.rejects(
    () => bootstrapAccountAndCatalog(),
    /credentials are required/i
  );
});

test("normalizes an existing seeded product instead of duplicating it", async () => {
  await resetAllTables();
  await bootstrapFirstAdmin({
    email: "existing-admin@example.com",
    name: "Existing Admin",
    password: "password-for-existing-admin",
  });

  const db = getDb();
  await db.insert(products).values({
    id: "prod_existing_seed",
    name: bootstrapManifest.products[0]!.name,
    active: false,
    defaultPriceId: null,
    description: "Old description",
    metadata: { legacy: "true" },
    livemode: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });

  const result = await bootstrapAccountAndCatalog();
  const refreshed = await db
    .select()
    .from(products)
    .where(eq(products.id, "prod_existing_seed"));

  assert.equal(result.products[0]?.status, "updated");
  assert.equal(refreshed[0]?.description, bootstrapManifest.products[0]?.description);
  assert.equal(refreshed[0]?.active, true);
  assert.deepEqual(refreshed[0]?.metadata, {});
  assert.equal(await countRows(products), 1);
});

test("fails when multiple products share the seeded name", async () => {
  await resetAllTables();
  await bootstrapFirstAdmin({
    email: "existing-admin@example.com",
    name: "Existing Admin",
    password: "password-for-existing-admin",
  });

  const db = getDb();
  const now = new Date("2026-01-01T00:00:00Z");
  await db.insert(products).values([
    {
      id: "prod_dup_one",
      name: bootstrapManifest.products[0]!.name,
      active: true,
      defaultPriceId: null,
      description: bootstrapManifest.products[0]!.description,
      metadata: {},
      livemode: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "prod_dup_two",
      name: bootstrapManifest.products[0]!.name,
      active: true,
      defaultPriceId: null,
      description: bootstrapManifest.products[0]!.description,
      metadata: {},
      livemode: false,
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
  ]);

  await assert.rejects(
    () => bootstrapAccountAndCatalog(),
    /multiple products named/i
  );
});

test("reactivates and renames the seeded meter instead of duplicating it", async () => {
  await resetAllTables();
  await bootstrapFirstAdmin({
    email: "existing-admin@example.com",
    name: "Existing Admin",
    password: "password-for-existing-admin",
  });

  const db = getDb();
  await db.insert(meters).values({
    id: "meter_existing_seed",
    displayName: "Legacy TPV",
    eventName: bootstrapManifest.meters[0]!.event_name,
    defaultAggregation: bootstrapManifest.meters[0]!.default_aggregation.formula,
    status: "inactive",
    livemode: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });

  const result = await bootstrapAccountAndCatalog();
  const refreshed = await db
    .select()
    .from(meters)
    .where(eq(meters.id, "meter_existing_seed"));

  assert.equal(result.meters[0]?.status, "updated");
  assert.equal(refreshed[0]?.status, "active");
  assert.equal(refreshed[0]?.displayName, bootstrapManifest.meters[0]?.display_name);
  assert.equal(await countRows(meters), 1);
});

test("seeded product stays without default_price when no prices exist", async () => {
  await resetAllTables();

  const result = await bootstrapAccountAndCatalog({
    admin: {
      email: "admin@example.com",
      name: "Bootstrap Admin",
      password: "password-for-bootstrap-admin",
    },
  });

  assert.equal(result.products[0]?.value.default_price, null);
});

test.after(async () => {
  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
});
