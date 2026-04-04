import { z } from "zod/v4";
import {
  meterIdSchema,
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
          usage_type: z.enum(["licensed", "metered"]).optional(),
        })
        .transform((value) => ({
          interval: value.interval,
          interval_count: 1 as const,
          usage_type: (value.usage_type ?? "licensed") as "licensed" | "metered",
        })),
      meter: meterIdSchema.optional(),
    })
    .strict()
    .refine(
      (data) => {
        if (data.recurring.usage_type === "metered") return data.meter != null;
        return true;
      },
      { message: "meter is required when usage_type is 'metered'" }
    )
    .refine(
      (data) => {
        if (data.meter != null) return data.recurring.usage_type === "metered";
        return true;
      },
      { message: "usage_type must be 'metered' when meter is provided" }
    ),
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
