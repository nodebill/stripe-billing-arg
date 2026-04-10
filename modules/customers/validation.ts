import { z } from "zod/v4";
import { customerIdSchema } from "@/modules/shared/validation";

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  description: z.string().optional(),
  address: addressSchema.optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  description: z.string().nullable().optional(),
  address: addressSchema.nullable().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const createTaxIdSchema = z.object({
  type: z.string().min(1),
  value: z.string().min(1),
});

export const listCustomersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  email: z.string().optional(),
  starting_after: customerIdSchema.optional(),
  ending_before: customerIdSchema.optional(),
});

const metadataQueryPattern =
  /^metadata\['([A-Za-z0-9_]+)'\]:'((?:\\.|[^'])*)'$/;

export const searchCustomersSchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    page: customerIdSchema.optional(),
  })
  .transform(({ query, ...rest }, ctx) => {
    const match = metadataQueryPattern.exec(query);

    if (!match) {
      return {
        ...rest,
        query_mode: "text" as const,
        searchTerm: query.trim(),
      };
    }

    const metadataKey = match[1];
    const metadataValue = match[2]
      .replace(/\\\\/g, "\\")
      .replace(/\\'/g, "'")
      .trim();

    if (metadataValue.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "metadata query value is required",
      });
      return z.NEVER;
    }

    return {
      ...rest,
      query_mode: "metadata" as const,
      metadataKey,
      metadataValue,
    };
  });
