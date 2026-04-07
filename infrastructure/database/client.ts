import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

const bootstrapStatements = [
  `
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
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
    CREATE TABLE IF NOT EXISTS prices (
      id TEXT PRIMARY KEY NOT NULL,
      product_id TEXT NOT NULL,
      active BOOLEAN DEFAULT true NOT NULL,
      billing_scheme TEXT NOT NULL,
      currency TEXT NOT NULL,
      nickname TEXT,
      metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
      livemode BOOLEAN DEFAULT false NOT NULL,
      type TEXT NOT NULL,
      unit_amount INTEGER,
      unit_amount_decimal TEXT NOT NULL,
      recurring_interval TEXT,
      recurring_interval_count INTEGER,
      meter TEXT,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY NOT NULL,
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
    CREATE TABLE IF NOT EXISTS subscription_items (
      id TEXT PRIMARY KEY NOT NULL,
      subscription_id TEXT NOT NULL,
      price_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY NOT NULL,
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
    ON invoices (subscription_id, period_start, period_end)
  `,
  `
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id TEXT PRIMARY KEY NOT NULL,
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
    CREATE UNIQUE INDEX IF NOT EXISTS meter_events_identifier_idx
    ON meter_events (identifier)
  `,
  `
    CREATE INDEX IF NOT EXISTS meter_events_meter_customer_timestamp_idx
    ON meter_events (meter_id, customer_id, event_timestamp)
  `,
  `
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified BOOLEAN DEFAULT false NOT NULL,
      image TEXT,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      role TEXT,
      banned BOOLEAN DEFAULT false,
      ban_reason TEXT,
      ban_expires TIMESTAMPTZ
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS "session" (
      id TEXT PRIMARY KEY NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL,
      impersonated_by TEXT
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS session_user_id_idx
    ON "session" (user_id)
  `,
  `
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      refresh_token_expires_at TIMESTAMPTZ,
      scope TEXT,
      password TEXT,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS account_user_id_idx
    ON account (user_id)
  `,
  `
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY NOT NULL,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS verification_identifier_idx
    ON verification (identifier)
  `,
  `
    CREATE TABLE IF NOT EXISTS apikey (
      id TEXT PRIMARY KEY NOT NULL,
      config_id TEXT DEFAULT 'default' NOT NULL,
      name TEXT,
      start TEXT,
      reference_id TEXT NOT NULL,
      prefix TEXT,
      key TEXT NOT NULL,
      refill_interval INTEGER,
      refill_amount INTEGER,
      last_refill_at TIMESTAMPTZ,
      enabled BOOLEAN DEFAULT true,
      rate_limit_enabled BOOLEAN DEFAULT true,
      rate_limit_time_window INTEGER DEFAULT 3600000,
      rate_limit_max INTEGER DEFAULT 1000,
      request_count INTEGER DEFAULT 0,
      remaining INTEGER,
      last_request TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      permissions TEXT,
      metadata TEXT
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS apikey_config_id_idx
    ON apikey (config_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS apikey_reference_id_idx
    ON apikey (reference_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS apikey_key_idx
    ON apikey (key)
  `,
  `
    CREATE TABLE IF NOT EXISTS rate_limit (
      id TEXT PRIMARY KEY NOT NULL,
      key TEXT NOT NULL UNIQUE,
      count INTEGER NOT NULL,
      last_request BIGINT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS team_invites (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_by_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS team_invites_token_hash_idx
    ON team_invites (token_hash)
  `,
  `
    CREATE INDEX IF NOT EXISTS team_invites_email_idx
    ON team_invites (email)
  `,
  `
    CREATE INDEX IF NOT EXISTS team_invites_created_by_user_id_idx
    ON team_invites (created_by_user_id)
  `,
  `
    ALTER TABLE products DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE prices DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE customers DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE payment_methods DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE subscriptions DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE subscription_items DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE invoices DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE invoice_line_items DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE invoice_deliveries DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE meters DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE meter_events DROP COLUMN IF EXISTS organization_id
  `,
  `
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS address JSONB
  `,
  `
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_id JSONB
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

  const client = getLocalClient();
  return drizzlePglite({ client, schema });
}

let migrationPromise: Promise<void> | null = null;

export async function ensureTables() {
  const db = getDb();

  if (!migrationPromise) {
    migrationPromise = (async () => {
      try {
        for (const statement of bootstrapStatements) {
          await db.execute(statement);
        }
      } catch (error) {
        migrationPromise = null;
        throw error;
      }
    })();
  }

  await migrationPromise;
}
