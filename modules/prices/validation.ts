import { z } from "zod/v4";
import {
  meterIdSchema,
  priceIdSchema,
  productIdSchema,
} from "@/modules/shared/validation";
import type { CreatePriceInput, ImportedPriceInput } from "./types";

const unitAmountDecimalSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,12})?$/, {
    message:
      "unit_amount_decimal must be a positive decimal string with up to 12 fractional digits",
  })
  .refine((value) => Number(value) > 0, {
    message: "unit_amount_decimal must be greater than zero",
  });

const sharedPriceFields = {
  currency: z
    .string()
    .regex(/^[a-z]{3}$/, "Currency must be a lowercase 3-letter code"),
  unit_amount: z.coerce
    .number()
    .int()
    .positive("Unit amount must be greater than zero")
    .optional(),
  unit_amount_decimal: unitAmountDecimalSchema.optional(),
  nickname: z.string().min(1, "Nickname cannot be empty").optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  active: z.boolean().optional(),
} as const;

const recurringShape = z
  .object({
    interval: z.enum(["month", "year"]),
    interval_count: z.literal(1).optional(),
    usage_type: z.enum(["licensed", "metered"]).optional(),
  })
  .transform((value) => ({
    interval: value.interval,
    interval_count: 1 as const,
    usage_type: (value.usage_type ?? "licensed") as "licensed" | "metered",
  }));

function validateAmountFields(
  data: {
    unit_amount?: number;
    unit_amount_decimal?: string;
  },
  ctx: z.core.$RefinementCtx<unknown>
) {
  const amountFields =
    Number(data.unit_amount !== undefined) +
    Number(data.unit_amount_decimal !== undefined);

  if (amountFields !== 1) {
    ctx.addIssue({
      code: "custom",
      message: "Provide exactly one of unit_amount or unit_amount_decimal",
    });
  }
}

const createOneTimePriceSchema = z
  .object({
    product: productIdSchema,
    ...sharedPriceFields,
    type: z.literal("one_time"),
  })
  .strict()
  .superRefine(validateAmountFields);

const createRecurringPriceSchema = z
  .object({
    product: productIdSchema,
    ...sharedPriceFields,
    type: z.literal("recurring"),
    recurring: recurringShape,
    meter: meterIdSchema.optional(),
  })
  .strict()
  .superRefine(validateAmountFields)
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
  );

const importedOneTimePriceSchema = z
  .object({
    ...sharedPriceFields,
    type: z.literal("one_time"),
  })
  .strict()
  .superRefine(validateAmountFields);

const importedRecurringPriceSchema = z
  .object({
    ...sharedPriceFields,
    type: z.literal("recurring"),
    recurring: recurringShape,
    meter: meterIdSchema.optional(),
  })
  .strict()
  .superRefine(validateAmountFields)
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
  );

export const createPriceSchema = z.discriminatedUnion("type", [
  createOneTimePriceSchema,
  createRecurringPriceSchema,
]) as unknown as z.ZodType<CreatePriceInput>;

export const importedPriceRowSchema = z.discriminatedUnion("type", [
  importedOneTimePriceSchema,
  importedRecurringPriceSchema,
]) as unknown as z.ZodType<ImportedPriceInput>;

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
