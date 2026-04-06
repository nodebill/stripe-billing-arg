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

const externalIdQueryPattern =
  /^metadata\['external_id'\]:'((?:\\.|[^'])*)'$/;

export const searchCustomersSchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    page: customerIdSchema.optional(),
  })
  .transform(({ query, ...rest }, ctx) => {
    const match = externalIdQueryPattern.exec(query);

    if (!match) {
      ctx.addIssue({
        code: "custom",
        message: "Only metadata['external_id']:'value' queries are supported",
      });
      return z.NEVER;
    }

    const externalId = match[1]
      .replace(/\\\\/g, "\\")
      .replace(/\\'/g, "'")
      .trim();

    if (externalId.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "external_id query value is required",
      });
      return z.NEVER;
    }

    return {
      ...rest,
      externalId,
    };
  });
