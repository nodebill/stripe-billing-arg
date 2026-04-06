import assert from "node:assert/strict";
import test from "node:test";
import { createSubscriptionSchema } from "../modules/subscriptions/validation";

const baseInput = {
  customer: "cus_test",
  collection_method: "charge_automatically" as const,
  default_payment_method: "pm_test",
  items: [{ price: "price_test" }],
};

test("accepts billing_cycle_anchor_config and defaults proration_behavior", () => {
  const parsed = createSubscriptionSchema.safeParse({
    ...baseInput,
    billing_cycle_anchor_config: {
      day_of_month: 1,
    },
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  assert.equal(parsed.data.proration_behavior, "create_prorations");
  assert.deepEqual(parsed.data.billing_cycle_anchor_config, {
    day_of_month: 1,
  });
});

test("rejects billing_cycle_anchor and billing_cycle_anchor_config together", () => {
  const parsed = createSubscriptionSchema.safeParse({
    ...baseInput,
    billing_cycle_anchor: Math.floor(Date.now() / 1000) + 3600,
    billing_cycle_anchor_config: {
      day_of_month: 1,
    },
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /mutually exclusive/i);
});

test("rejects backdate_start_date combined with billing cycle anchors", () => {
  const parsed = createSubscriptionSchema.safeParse({
    ...baseInput,
    backdate_start_date: Math.floor(Date.now() / 1000) - 86400,
    billing_cycle_anchor_config: {
      day_of_month: 1,
    },
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /cannot be combined/i);
});

test("rejects non-future billing_cycle_anchor values", () => {
  const parsed = createSubscriptionSchema.safeParse({
    ...baseInput,
    billing_cycle_anchor: Math.floor(Date.now() / 1000) - 1,
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /future timestamp/i);
});

test("rejects non-past backdate_start_date values", () => {
  const parsed = createSubscriptionSchema.safeParse({
    ...baseInput,
    backdate_start_date: Math.floor(Date.now() / 1000) + 60,
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /past timestamp/i);
});
