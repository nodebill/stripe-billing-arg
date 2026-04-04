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
