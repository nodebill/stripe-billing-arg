import assert from "node:assert/strict";
import test from "node:test";
import { searchCustomersSchema } from "../modules/customers/validation";

test("customer search validation accepts Stripe-style external_id queries", () => {
  const parsed = searchCustomersSchema.parse({
    query: "metadata['external_id']:'crm_123'",
  });

  assert.equal(parsed.query_mode, "metadata");
  assert.equal(parsed.metadataKey, "external_id");
  assert.equal(parsed.metadataValue, "crm_123");
  assert.equal(parsed.limit, 10);
  assert.equal(parsed.page, undefined);
});

test("customer search validation supports escaped single quotes", () => {
  const parsed = searchCustomersSchema.parse({
    query: "metadata['external_id']:'crm\\'123'",
    limit: "5",
  });

  assert.equal(parsed.query_mode, "metadata");
  assert.equal(parsed.metadataKey, "external_id");
  assert.equal(parsed.metadataValue, "crm'123");
  assert.equal(parsed.limit, 5);
});

test("customer search validation accepts free-text search terms", () => {
  const parsed = searchCustomersSchema.parse({
    query: "Acme Customer",
    limit: "25",
  });

  assert.equal(parsed.query_mode, "text");
  assert.equal(parsed.searchTerm, "Acme Customer");
  assert.equal(parsed.limit, 25);
});

test("customer search validation rejects empty external_id values", () => {
  const parsed = searchCustomersSchema.safeParse({
    query: "metadata['external_id']:''",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /required/i);
});
