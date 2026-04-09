import assert from "node:assert/strict";
import test from "node:test";
import { listInvoicesSchema } from "../modules/invoices/validation";

test("accepts global invoice list requests with limit 200", () => {
  const parsed = listInvoicesSchema.safeParse({
    limit: 200,
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  assert.equal(parsed.data.limit, 200);
  assert.equal(parsed.data.customer, undefined);
});

test("rejects invoice list limits above 200", () => {
  const parsed = listInvoicesSchema.safeParse({
    limit: 201,
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /200/);
});
