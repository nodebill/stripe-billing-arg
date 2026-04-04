import { z } from "zod/v4";
import {
  priceIdSchema,
  productIdSchema,
} from "@/modules/shared/validation";

const basePriceSchema = {
  product: productIdSchema,
  currency: z
    .string()
    .regex(/^[a-z]{3}$/, "Currency must be a lowercase 3-letter code"),
  unit_amount: z.coerce
    .number()
    .int()
    .positive("Unit amount must be greater than zero"),
  nickname: z.string().min(1, "Nickname cannot be empty").optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  active: z.boolean().optional(),
} as const;

export const createPriceSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...basePriceSchema,
      type: z.literal("one_time"),
    })
    .strict(),
  z
    .object({
      ...basePriceSchema,
      type: z.literal("recurring"),
      recurring: z
        .object({
          interval: z.enum(["month", "year"]),
          interval_count: z.literal(1).optional(),
        })
        .transform((value) => ({
          interval: value.interval,
          interval_count: 1 as const,
        })),
    })
    .strict(),
]);

export const updatePriceSchema = z
  .object({
    active: z.boolean().optional(),
    nickname: z.string().min(1, "Nickname cannot be empty").nullable().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const listPricesSchema = z.object({
  product: productIdSchema,
  limit: z.coerce.number().int().min(1).max(100).default(10),
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  type: z.enum(["one_time", "recurring"]).optional(),
  starting_after: priceIdSchema.optional(),
  ending_before: priceIdSchema.optional(),
});
