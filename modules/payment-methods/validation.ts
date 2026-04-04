import { z } from "zod/v4";

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
    customer: z
      .string()
      .regex(
        /^cus_[A-Za-z0-9_-]+$/,
        "Customer must be a valid cus_ id"
      ),
  })
  .strict();

export const listCustomerPaymentMethodsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
});
