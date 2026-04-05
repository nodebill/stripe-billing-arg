import { z } from "zod/v4";
import { meterIdSchema } from "@/modules/shared/validation";

export const createMeterSchema = z
  .object({
    display_name: z.string().min(1, "Display name cannot be empty"),
    event_name: z
      .string()
      .min(1, "Event name cannot be empty")
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Event name must start with a lowercase letter and contain only lowercase letters, numbers, and underscores"
      ),
    default_aggregation: z.object({
      formula: z.enum(["sum", "count"]),
    }),
  })
  .strict();

export const updateMeterSchema = z
  .object({
    display_name: z.string().min(1, "Display name cannot be empty"),
  })
  .strict();

export const listMetersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(["active", "inactive"]).optional(),
  starting_after: meterIdSchema.optional(),
  ending_before: meterIdSchema.optional(),
});
