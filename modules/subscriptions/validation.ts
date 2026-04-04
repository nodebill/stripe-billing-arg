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
    default_payment_method: paymentMethodIdSchema,
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
  .strict();

export const updateSubscriptionSchema = z
  .object({
    cancel_at_period_end: z.boolean(),
  })
  .strict();

export const listSubscriptionsSchema = z.object({
  customer: customerIdSchema,
  status: z.enum(["active", "canceled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  starting_after: subscriptionIdSchema.optional(),
  ending_before: subscriptionIdSchema.optional(),
});
