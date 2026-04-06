import assert from "node:assert/strict";
import test from "node:test";
import { createPriceSchema } from "../modules/prices/validation";

const recurringBase = {
  product: "prod_test",
  currency: "usd",
  type: "recurring" as const,
  recurring: {
    interval: "month" as const,
    interval_count: 1 as const,
    usage_type: "metered" as const,
  },
  meter: "meter_test",
};

test("accepts decimal metered prices and normalizes recurring defaults", () => {
  const parsed = createPriceSchema.parse({
    ...recurringBase,
    unit_amount_decimal: "0.01",
  });

  assert.equal(parsed.unit_amount_decimal, "0.01");
  assert.equal(parsed.type, "recurring");
  if (parsed.type !== "recurring") {
    throw new Error("Expected recurring price");
  }
  assert.equal(parsed.recurring.interval_count, 1);
  assert.equal(parsed.recurring.usage_type, "metered");
});

test("rejects prices that provide both unit_amount and unit_amount_decimal", () => {
  const parsed = createPriceSchema.safeParse({
    ...recurringBase,
    unit_amount: 100,
    unit_amount_decimal: "0.01",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /exactly one/i);
});

test("rejects prices that provide neither unit_amount nor unit_amount_decimal", () => {
  const parsed = createPriceSchema.safeParse(recurringBase);

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /exactly one/i);
});

test("rejects invalid decimal amounts", () => {
  const tooPrecise = createPriceSchema.safeParse({
    ...recurringBase,
    unit_amount_decimal: "0.1234567890123",
  });
  const zero = createPriceSchema.safeParse({
    ...recurringBase,
    unit_amount_decimal: "0",
  });

  assert.equal(tooPrecise.success, false);
  assert.equal(zero.success, false);
});
