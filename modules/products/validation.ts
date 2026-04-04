import { z } from "zod/v4";

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const listProductsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
});
