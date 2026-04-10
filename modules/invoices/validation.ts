import { z } from "zod/v4";
import { customerIdSchema, invoiceIdSchema } from "@/modules/shared/validation";

export const listInvoicesSchema = z.object({
  customer: customerIdSchema.optional(),
  status: z.enum(["draft", "invoiced", "sent"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(10),
  starting_after: invoiceIdSchema.optional(),
  ending_before: invoiceIdSchema.optional(),
});

export const invoiceBatchActionSchema = z
  .object({
    invoice_ids: z
      .array(invoiceIdSchema)
      .min(1, "Select at least one invoice")
      .max(200, "You can process at most 200 invoices at once"),
  })
  .strict();
