import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

const bootstrapStatements = [
  `
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      active BOOLEAN DEFAULT true NOT NULL,
      default_price_id TEXT,
      description TEXT,
      metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
      livemode BOOLEAN DEFAULT false NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ
  `,
  `
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
  `,
  `
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS default_price_id TEXT
  `,
  `
    CREATE TABLE IF NOT EXISTS prices (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      active BOOLEAN DEFAULT true NOT NULL,
      billing_scheme TEXT NOT NULL,
      currency TEXT NOT NULL,
      nickname TEXT,
      metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
      livemode BOOLEAN DEFAULT false NOT NULL,
      type TEXT NOT NULL,
      unit_amount INTEGER NOT NULL,
      recurring_interval TEXT,
      recurring_interval_count INTEGER,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    UPDATE prices
    SET metadata = '{}'::jsonb
    WHERE metadata IS NULL
  `,
  `
    ALTER TABLE prices
    ALTER COLUMN metadata SET DEFAULT '{}'::jsonb
  `,
  `
    ALTER TABLE prices
    ALTER COLUMN metadata SET NOT NULL
  `,
  `
    ALTER TABLE prices
    ALTER COLUMN created_at SET DEFAULT now()
  `,
  `
    ALTER TABLE prices
    ALTER COLUMN created_at SET NOT NULL
  `,
  `
    ALTER TABLE prices
    ALTER COLUMN updated_at SET DEFAULT now()
  `,
  `
    ALTER TABLE prices
    ALTER COLUMN updated_at SET NOT NULL
  `,
  `
    UPDATE products
    SET metadata = '{}'::jsonb
    WHERE metadata IS NULL
  `,
  `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'created'
      ) THEN
        UPDATE products
        SET created_at = COALESCE(created_at, to_timestamp(created))
        WHERE created_at IS NULL;
      END IF;
    END $$;
  `,
  `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'updated'
      ) THEN
        UPDATE products
        SET updated_at = COALESCE(updated_at, to_timestamp(updated))
        WHERE updated_at IS NULL;
      END IF;
    END $$;
  `,
  `
    UPDATE products SET created_at = now() WHERE created_at IS NULL
  `,
  `
    UPDATE products SET updated_at = now() WHERE updated_at IS NULL
  `,
  `
    ALTER TABLE products
    ALTER COLUMN metadata SET DEFAULT '{}'::jsonb
  `,
  `
    ALTER TABLE products
    ALTER COLUMN metadata SET NOT NULL
  `,
  `
    ALTER TABLE products
    ALTER COLUMN created_at SET DEFAULT now()
  `,
  `
    ALTER TABLE products
    ALTER COLUMN created_at SET NOT NULL
  `,
  `
    ALTER TABLE products
    ALTER COLUMN updated_at SET DEFAULT now()
  `,
  `
    ALTER TABLE products
    ALTER COLUMN updated_at SET NOT NULL
  `,
  `
    ALTER TABLE products DROP COLUMN IF EXISTS created
  `,
  `
    ALTER TABLE products DROP COLUMN IF EXISTS updated
  `,
  `
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      name TEXT,
      email TEXT,
      description TEXT,
      metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
      livemode BOOLEAN DEFAULT false NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      customer_id TEXT,
      type TEXT NOT NULL,
      custom_type TEXT NOT NULL,
      billing_name TEXT,
      livemode BOOLEAN DEFAULT false NOT NULL,
      detached_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL,
      collection_method TEXT NOT NULL DEFAULT 'charge_automatically',
      default_payment_method_id TEXT,
      cancel_at_period_end BOOLEAN DEFAULT false NOT NULL,
      canceled_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      livemode BOOLEAN DEFAULT false NOT NULL,
      current_period_start TIMESTAMPTZ NOT NULL,
      current_period_end TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS collection_method TEXT
  `,
  `
    UPDATE subscriptions
    SET collection_method = 'charge_automatically'
    WHERE collection_method IS NULL
  `,
  `
    ALTER TABLE subscriptions
    ALTER COLUMN default_payment_method_id DROP NOT NULL
  `,
  `
    CREATE TABLE IF NOT EXISTS subscription_items (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      subscription_id TEXT NOT NULL,
      price_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      subscription_id TEXT NOT NULL,
      status TEXT NOT NULL,
      collection_method TEXT NOT NULL,
      currency TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      amount_due INTEGER NOT NULL,
      amount_paid INTEGER DEFAULT 0 NOT NULL,
      due_date TIMESTAMPTZ,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      auto_advance BOOLEAN DEFAULT true NOT NULL,
      finalized_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_subscription_period_idx
    ON invoices (organization_id, subscription_id, period_start, period_end)
  `,
  `
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      price_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1 NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS invoice_deliveries (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      recipient TEXT,
      payload JSONB DEFAULT '{}'::jsonb NOT NULL,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS billing_processor_state (
      id TEXT PRIMARY KEY NOT NULL,
      lease_owner TEXT,
      lease_expires_at TIMESTAMPTZ,
      last_started_at TIMESTAMPTZ,
      last_finished_at TIMESTAMPTZ,
      last_error TEXT,
      last_summary JSONB DEFAULT '{}'::jsonb NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS meters (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      event_name TEXT NOT NULL,
      default_aggregation TEXT NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      livemode BOOLEAN DEFAULT false NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS meter_events (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      meter_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      identifier TEXT NOT NULL,
      event_name TEXT NOT NULL,
      value INTEGER NOT NULL,
      event_timestamp TIMESTAMPTZ NOT NULL,
      livemode BOOLEAN DEFAULT false NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS meter_events_org_identifier_idx
    ON meter_events (organization_id, identifier)
  `,
  `
    CREATE INDEX IF NOT EXISTS meter_events_org_meter_customer_timestamp_idx
    ON meter_events (organization_id, meter_id, customer_id, event_timestamp)
  `,
  `
    ALTER TABLE prices
    ADD COLUMN IF NOT EXISTS meter TEXT
  `,
] as const;

declare global {
  var __stripeBillingPool: Pool | undefined;
  var __stripeBillingPGlite: PGlite | undefined;
}

function isLocalPostgres(databaseUrl: string) {
  return (
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1") ||
    databaseUrl.includes("sslmode=disable")
  );
}

function getProductionPool(databaseUrl: string) {
  if (!globalThis.__stripeBillingPool) {
    globalThis.__stripeBillingPool = new Pool({
      connectionString: databaseUrl,
      ssl: isLocalPostgres(databaseUrl) ? undefined : { rejectUnauthorized: false },
      max: 1,
    });
  }

  return globalThis.__stripeBillingPool;
}

function getLocalClient() {
  if (!globalThis.__stripeBillingPGlite) {
    globalThis.__stripeBillingPGlite = new PGlite("./local-data-pglite");
  }

  return globalThis.__stripeBillingPGlite;
}

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const client = getProductionPool(databaseUrl);
    return drizzleNodePg({ client, schema });
  }

  // Local development: use PGlite (Postgres in WASM)
  const client = getLocalClient();
  return drizzlePglite({ client, schema });
}

let migrationPromise: Promise<void> | null = null;
export async function ensureTables() {
  const db = getDb();

  if (!migrationPromise) {
    migrationPromise = (async () => {
      for (const statement of bootstrapStatements) {
        await db.execute(statement);
      }
    })();
  }

  await migrationPromise;
}
