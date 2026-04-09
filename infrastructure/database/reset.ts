import { sql } from "drizzle-orm";
import { ensureTables, getDb } from "./client";

export type DatabaseResetScope = "billing" | "all";

const BILLING_TABLES = [
  "invoice_deliveries",
  "invoice_line_items",
  "invoices",
  "subscription_schedule_phases",
  "subscription_schedules",
  "subscription_items",
  "subscriptions",
  "meter_events",
  "meters",
  "payment_methods",
  "prices",
  "products",
  "customers",
  "billing_processor_state",
  "rate_limit",
] as const;

const AUTH_TABLES = [
  "session",
  "account",
  "verification",
  "apikey",
  "team_invites",
  "user",
] as const;

export function isLocalDatabaseUrl(databaseUrl: string) {
  return (
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1") ||
    databaseUrl.includes("sslmode=disable")
  );
}

export function getResetTableNames(scope: DatabaseResetScope) {
  if (scope === "all") {
    return [...BILLING_TABLES, ...AUTH_TABLES];
  }

  return [...BILLING_TABLES];
}

export function resetRequiresForce(databaseUrl?: string) {
  if (!databaseUrl) {
    return false;
  }

  return !isLocalDatabaseUrl(databaseUrl);
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function resetDatabase(input?: {
  scope?: DatabaseResetScope;
  force?: boolean;
  databaseUrl?: string;
}) {
  const scope = input?.scope ?? "billing";
  const databaseUrl = input?.databaseUrl ?? process.env.DATABASE_URL;

  if (resetRequiresForce(databaseUrl) && !input?.force) {
    throw new Error(
      [
        "Refusing to reset a non-local DATABASE_URL without --force.",
        "If this is your shared development database, rerun the command with --force.",
      ].join(" ")
    );
  }

  await ensureTables();

  const tables = getResetTableNames(scope);
  const statement = `TRUNCATE TABLE ${tables
    .map(quoteIdentifier)
    .join(", ")} RESTART IDENTITY CASCADE`;

  await getDb().execute(sql.raw(statement));

  return {
    scope,
    tables,
    usedDatabaseUrl: databaseUrl ?? null,
  };
}
