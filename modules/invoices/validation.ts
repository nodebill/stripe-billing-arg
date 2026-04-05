import { z } from "zod/v4";
import { customerIdSchema, invoiceIdSchema } from "@/modules/shared/validation";

export const listInvoicesSchema = z.object({
  customer: customerIdSchema,
  limit: z.coerce.number().int().min(1).max(100).default(10),
  starting_after: invoiceIdSchema.optional(),
  ending_before: invoiceIdSchema.optional(),
});
