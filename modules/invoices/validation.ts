import { z } from "zod/v4";
import {
  customerIdSchema,
  invoiceIdSchema,
  utcDateStringSchema,
} from "@/modules/shared/validation";

export const listInvoicesSchema = z
  .object({
    customer: customerIdSchema.optional(),
    status: z.enum(["draft", "invoiced", "sent"]).optional(),
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

export const invoiceBatchActionSchema = z
  .object({
    invoice_ids: z
      .array(invoiceIdSchema)
      .min(1, "Select at least one invoice")
      .max(200, "You can process at most 200 invoices at once"),
  })
  .strict();
