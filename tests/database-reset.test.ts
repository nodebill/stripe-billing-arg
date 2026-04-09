import assert from "node:assert/strict";
import test from "node:test";
import {
  getResetTableNames,
  isLocalDatabaseUrl,
  resetRequiresForce,
} from "../infrastructure/database/reset";

test("billing reset preserves auth tables", () => {
  const tables = getResetTableNames("billing");

  assert.ok(tables.includes("products"));
  assert.ok(tables.includes("rate_limit"));
  assert.equal(tables.includes("user"), false);
  assert.equal(tables.includes("team_invites"), false);
});

test("full reset includes auth tables", () => {
  const tables = getResetTableNames("all");

  assert.ok(tables.includes("user"));
  assert.ok(tables.includes("team_invites"));
  assert.ok(tables.includes("apikey"));
});

test("force is only required for non-local database urls", () => {
  assert.equal(resetRequiresForce(undefined), false);
  assert.equal(
    isLocalDatabaseUrl("postgres://postgres:postgres@localhost:5432/app"),
    true
  );
  assert.equal(
    isLocalDatabaseUrl("postgres://postgres:postgres@127.0.0.1:5432/app"),
    true
  );
  assert.equal(
    isLocalDatabaseUrl("postgres://postgres:postgres@db.example.com/app?sslmode=disable"),
    true
  );
  assert.equal(
    resetRequiresForce(
      "postgresql://postgres.example.supabase.com:6543/postgres"
    ),
    true
  );
});
