import { z } from "zod/v4";
import {
  customerIdSchema,
  paymentMethodIdSchema,
  priceIdSchema,
  subscriptionIdSchema,
} from "@/modules/shared/validation";

export const createSubscriptionSchema = z
  .object({
    customer: customerIdSchema,
    collection_method: z
      .enum(["charge_automatically", "send_invoice"])
      .default("charge_automatically"),
    default_payment_method: paymentMethodIdSchema.optional(),
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
