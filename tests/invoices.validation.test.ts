import assert from "node:assert/strict";
import test from "node:test";
import { listInvoicesSchema } from "../modules/invoices/validation";

test("accepts global invoice list requests with limit 200", () => {
  const parsed = listInvoicesSchema.safeParse({
    limit: 200,
    status: "draft",
    date_from: "2026-04-01",
    date_to: "2026-04-30",
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  assert.equal(parsed.data.limit, 200);
  assert.equal(parsed.data.customer, undefined);
  assert.equal(parsed.data.status, "draft");
  assert.equal(parsed.data.date_from, "2026-04-01");
  assert.equal(parsed.data.date_to, "2026-04-30");
});

test("rejects invoice list limits above 200", () => {
  const parsed = listInvoicesSchema.safeParse({
    limit: 201,
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /200/);
});

test("rejects invoice date ranges where date_to is before date_from", () => {
  const parsed = listInvoicesSchema.safeParse({
    date_from: "2026-04-30",
    date_to: "2026-04-01",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /date_to/i);
});
