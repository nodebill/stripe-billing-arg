import { z } from "zod/v4";
import {
  customerIdSchema,
  invoiceIdSchema,
  utcDateStringSchema,
} from "@/modules/shared/validation";

export const listInvoicesSchema = z
  .object({
    customer: customerIdSchema.optional(),
    status: z.enum(["draft", "open", "paid", "past_due"]).optional(),
    date_from: utcDateStringSchema.optional(),
    date_to: utcDateStringSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(10),
    starting_after: invoiceIdSchema.optional(),
    ending_before: invoiceIdSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.date_from && value.date_to && value.date_from > value.date_to) {
      ctx.addIssue({
        code: "custom",
        message: "date_to must be on or after date_from",
        path: ["date_to"],
      });
    }
  });
