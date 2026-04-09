import assert from "node:assert/strict";
import test from "node:test";
import {
  bulkCloseSubscriptionCyclesSchema,
  createSubscriptionSchema,
  listSubscriptionsSchema,
} from "../modules/subscriptions/validation";

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

test("accepts global subscription list filters with limit 200", () => {
  const parsed = listSubscriptionsSchema.safeParse({
    status: "active",
    limit: 200,
    customer: "cus_test",
    subscription: "sub_test",
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  assert.equal(parsed.data.limit, 200);
  assert.equal(parsed.data.customer, "cus_test");
  assert.equal(parsed.data.subscription, "sub_test");
});

test("rejects subscription list limits above 200", () => {
  const parsed = listSubscriptionsSchema.safeParse({
    limit: 201,
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /200/);
});

test("requires at least one filter for bulk cycle close", () => {
  const parsed = bulkCloseSubscriptionCyclesSchema.safeParse({});

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.match(parsed.error.issues[0]?.message ?? "", /at least one filter/i);
});
