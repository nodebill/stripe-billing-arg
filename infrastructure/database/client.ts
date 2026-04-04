import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    // Production: use Supabase Postgres via node-postgres
    // Will be set up when we pick a hosted provider
    throw new Error(
      "Production database not yet configured. Set up Supabase and install pg/postgres driver."
    );
  }

  // Local development: use PGlite (Postgres in WASM)
  const client = new PGlite("./local-data-pglite");
  return drizzlePglite({ client, schema });
}

export const db = createDb();

let migrationPromise: Promise<void> | null = null;
export async function ensureTables() {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          name TEXT NOT NULL,
          active BOOLEAN DEFAULT true NOT NULL,
          description TEXT,
          metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
          livemode BOOLEAN DEFAULT false NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
        )
      `);

      await db.execute(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ
      `);
      await db.execute(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
      `);
      await db.execute(`
        UPDATE products
        SET metadata = '{}'::jsonb
        WHERE metadata IS NULL
      `);
      await db.execute(`
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
      `);
      await db.execute(`
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
      `);
      await db.execute(`
        UPDATE products SET created_at = now() WHERE created_at IS NULL
      `);
      await db.execute(`
        UPDATE products SET updated_at = now() WHERE updated_at IS NULL
      `);
      await db.execute(`
        ALTER TABLE products
        ALTER COLUMN metadata SET DEFAULT '{}'::jsonb
      `);
      await db.execute(`
        ALTER TABLE products
        ALTER COLUMN metadata SET NOT NULL
      `);
      await db.execute(`
        ALTER TABLE products
        ALTER COLUMN created_at SET DEFAULT now()
      `);
      await db.execute(`
        ALTER TABLE products
        ALTER COLUMN created_at SET NOT NULL
      `);
      await db.execute(`
        ALTER TABLE products
        ALTER COLUMN updated_at SET DEFAULT now()
      `);
      await db.execute(`
        ALTER TABLE products
        ALTER COLUMN updated_at SET NOT NULL
      `);
      await db.execute(`
        ALTER TABLE products DROP COLUMN IF EXISTS created
      `);
      await db.execute(`
        ALTER TABLE products DROP COLUMN IF EXISTS updated
      `);
    })();
  }

  await migrationPromise;
}
