import { z } from "zod/v4";
import {
  customerIdSchema,
  meterIdSchema,
} from "@/modules/shared/validation";

const meterEventNameSchema = z
  .string()
  .min(1, "Event name cannot be empty")
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Event name must start with a lowercase letter and contain only lowercase letters, numbers, and underscores"
  );

export const createMeterEventSchema = z
  .object({
    event_name: meterEventNameSchema,
    identifier: z.string().min(1, "Identifier cannot be empty").max(200).optional(),
    count: z.coerce.number().int().positive("Count must be greater than zero").optional(),
    payload: z
      .object({
        stripe_customer_id: customerIdSchema,
        value: z.coerce
          .number()
          .int("Value must be an integer")
          .positive("Value must be greater than zero"),
      })
      .strict(),
    timestamp: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .refine((data) => !(data.count && data.count > 1 && data.identifier), {
    message: "identifier cannot be provided when count is greater than 1",
    path: ["identifier"],
  });

export const listMeterEventSummariesSchema = z
  .object({
    customer: customerIdSchema,
    start_time: z.coerce.number().int().min(0, "start_time must be a unix timestamp"),
    end_time: z.coerce.number().int().min(0, "end_time must be a unix timestamp"),
    value_grouping_window: z.enum(["hour", "day"]).optional(),
  })
  .strict()
  .refine((value) => value.end_time > value.start_time, {
    message: "end_time must be greater than start_time",
    path: ["end_time"],
  });

export const meterEventSummaryMeterIdSchema = meterIdSchema;
