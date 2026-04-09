import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  var __stripeBillingPool: Pool | undefined;
  var __stripeBillingPGlite: PGlite | undefined;
}

type AppSchema = typeof schema;
type AppDb = NodePgDatabase<AppSchema> | PgliteDatabase<AppSchema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

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

function getNodePgDb() {
  return drizzleNodePg({
    client: getProductionPool(process.env.DATABASE_URL!),
    schema,
  });
}

function getPgliteDb() {
  return drizzlePglite({
    client: getLocalClient(),
    schema,
  });
}

export function getDb(): AppDb {
  if (process.env.DATABASE_URL) {
    return getNodePgDb();
  }

  return getPgliteDb();
}

async function hasMigrationTable(db: AppDb) {
  const result = await db.execute<{ migration_table: string | null }>(sql`
    SELECT to_regclass('drizzle.__drizzle_migrations') AS migration_table
  `);

  return Boolean(result.rows[0]?.migration_table);
}

async function hasLegacyAppTables(db: AppDb) {
  const result = await db.execute<{ has_legacy_tables: boolean }>(sql`
    SELECT (
      to_regclass('public.products') IS NOT NULL OR
      to_regclass('public.customers') IS NOT NULL OR
      to_regclass('public.subscriptions') IS NOT NULL OR
      to_regclass('public.invoices') IS NOT NULL OR
      to_regclass('public.meters') IS NOT NULL
    ) AS has_legacy_tables
  `);

  return Boolean(result.rows[0]?.has_legacy_tables);
}

async function adoptLegacyMigrationHistory(db: AppDb) {
  if (await hasMigrationTable(db)) {
    return;
  }

  if (!(await hasLegacyAppTables(db))) {
    return;
  }

  const migrations = readMigrationFiles({
    migrationsFolder: MIGRATIONS_FOLDER,
  });

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(MIGRATIONS_SCHEMA)}`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(
      MIGRATIONS_TABLE
    )} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  for (const migration of migrations) {
    await db.execute(sql`
      INSERT INTO ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} (
        "hash",
        "created_at"
      )
      SELECT ${migration.hash}, ${migration.folderMillis}
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)}
        WHERE hash = ${migration.hash}
          AND created_at = ${migration.folderMillis}
      )
    `);
  }
}

let migrationPromise: Promise<void> | null = null;

export async function ensureTables() {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      try {
        const db = getDb();

        await adoptLegacyMigrationHistory(db);

        if (process.env.DATABASE_URL) {
          await migrateNodePg(getNodePgDb(), {
            migrationsFolder: MIGRATIONS_FOLDER,
          });
          return;
        }

        await migratePglite(getPgliteDb(), {
          migrationsFolder: MIGRATIONS_FOLDER,
        });
      } catch (error) {
        migrationPromise = null;
        throw error;
      }
    })();
  }

  await migrationPromise;
}
