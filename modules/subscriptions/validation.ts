import { z } from "zod/v4";
import {
  customerIdSchema,
  paymentMethodIdSchema,
  priceIdSchema,
  subscriptionIdSchema,
} from "@/modules/shared/validation";

const unixTimestampSchema = z.coerce
  .number()
  .int("Timestamp must be an integer number of seconds")
  .positive("Timestamp must be greater than zero");

const billingCycleAnchorConfigSchema = z
  .object({
    day_of_month: z.number().int().min(1).max(31),
    month: z.number().int().min(1).max(12).optional(),
    hour: z.number().int().min(0).max(23).optional(),
    minute: z.number().int().min(0).max(59).optional(),
    second: z.number().int().min(0).max(59).optional(),
  })
  .strict();

export const createSubscriptionSchema = z
  .object({
    customer: customerIdSchema,
    collection_method: z
      .enum(["charge_automatically", "send_invoice"])
      .default("charge_automatically"),
    default_payment_method: paymentMethodIdSchema.optional(),
    billing_cycle_anchor: unixTimestampSchema.optional(),
    billing_cycle_anchor_config: billingCycleAnchorConfigSchema.optional(),
    backdate_start_date: unixTimestampSchema.optional(),
    backdate_behavior: z
      .enum(["advance_to_current_period", "preserve_exact_cycle"])
      .default("advance_to_current_period"),
    proration_behavior: z
      .enum(["create_prorations", "none"])
      .default("create_prorations"),
    items: z
      .array(
        z
          .object({
            price: priceIdSchema,
          })
          .strict()
      )
      .length(1, "Exactly one subscription item is required in this version"),
  })
  .superRefine((value, ctx) => {
    const now = Math.floor(Date.now() / 1000);

    if (
      value.collection_method === "charge_automatically" &&
      !value.default_payment_method
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "A default payment method is required when collection_method is charge_automatically",
        path: ["default_payment_method"],
      });
    }

    if (value.billing_cycle_anchor && value.billing_cycle_anchor_config) {
      ctx.addIssue({
        code: "custom",
        message:
          "billing_cycle_anchor and billing_cycle_anchor_config are mutually exclusive",
        path: ["billing_cycle_anchor"],
      });
    }

    if (
      value.backdate_start_date &&
      (value.billing_cycle_anchor || value.billing_cycle_anchor_config)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "backdate_start_date cannot be combined with billing_cycle_anchor or billing_cycle_anchor_config in this version",
        path: ["backdate_start_date"],
      });
    }

    if (value.billing_cycle_anchor && value.billing_cycle_anchor <= now) {
      ctx.addIssue({
        code: "custom",
        message: "billing_cycle_anchor must be a future timestamp",
        path: ["billing_cycle_anchor"],
      });
    }

    if (value.backdate_start_date && value.backdate_start_date >= now) {
      ctx.addIssue({
        code: "custom",
        message: "backdate_start_date must be a past timestamp",
        path: ["backdate_start_date"],
      });
    }

    if (
      value.backdate_behavior === "preserve_exact_cycle" &&
      !value.backdate_start_date
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "backdate_start_date is required when backdate_behavior is preserve_exact_cycle",
        path: ["backdate_start_date"],
      });
    }
  })
  .strict();

export const updateSubscriptionSchema = z
  .object({
    cancel_at_period_end: z.boolean(),
  })
  .strict();

export const listSubscriptionsSchema = z.object({
  customer: customerIdSchema,
  status: z.enum(["active", "past_due", "canceled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  starting_after: subscriptionIdSchema.optional(),
  ending_before: subscriptionIdSchema.optional(),
});

export const closeSubscriptionCycleSchema = z.object({}).strict();
