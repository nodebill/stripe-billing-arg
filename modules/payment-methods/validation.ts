import { z } from "zod/v4";
import {
  customerIdSchema,
  paymentMethodIdSchema,
} from "@/modules/shared/validation";

export const createPaymentMethodSchema = z
  .object({
    type: z.literal("custom"),
    billing_details: z
      .object({
        name: z.string().min(1, "Name cannot be empty").optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const updatePaymentMethodSchema = z
  .object({
    billing_details: z
      .object({
        name: z.string().min(1, "Name cannot be empty").nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const attachPaymentMethodSchema = z
  .object({
    customer: customerIdSchema,
  })
  .strict();

export const listCustomerPaymentMethodsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  starting_after: paymentMethodIdSchema.optional(),
  ending_before: paymentMethodIdSchema.optional(),
});
