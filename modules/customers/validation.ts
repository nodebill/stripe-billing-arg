import { z } from "zod/v4";
import { customerIdSchema } from "@/modules/shared/validation";

export const createCustomerSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  description: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const listCustomersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  email: z.string().optional(),
  starting_after: customerIdSchema.optional(),
  ending_before: customerIdSchema.optional(),
});
