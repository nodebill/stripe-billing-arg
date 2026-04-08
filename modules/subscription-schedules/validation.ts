import { z } from "zod/v4";
import {
  priceIdSchema,
  subscriptionIdSchema,
  subscriptionScheduleIdSchema,
} from "@/modules/shared/validation";

const unixTimestampSchema = z.coerce
  .number()
  .int("Timestamp must be an integer number of seconds")
  .positive("Timestamp must be greater than zero");

const phaseSchema = z
  .object({
    price: priceIdSchema,
    start_date: unixTimestampSchema,
    end_date: unixTimestampSchema,
  })
  .strict();

export const createSubscriptionScheduleSchema = z
  .object({
    subscription: subscriptionIdSchema,
    end_behavior: z.enum(["release", "cancel"]).default("release"),
    phases: z.array(phaseSchema).min(1, "At least one phase is required"),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (let i = 0; i < value.phases.length; i++) {
      const phase = value.phases[i];
      if (phase.end_date <= phase.start_date) {
        ctx.addIssue({
          code: "custom",
          message: `Phase ${i} end_date must be after start_date`,
          path: ["phases", i, "end_date"],
        });
      }
    }

    for (let i = 1; i < value.phases.length; i++) {
      if (value.phases[i].start_date !== value.phases[i - 1].end_date) {
        ctx.addIssue({
          code: "custom",
          message: `Phases must be contiguous: phase ${i} start_date must equal phase ${i - 1} end_date`,
          path: ["phases", i, "start_date"],
        });
      }
    }
  });

export const updateSubscriptionScheduleSchema = z
  .object({
    end_behavior: z.enum(["release", "cancel"]).optional(),
    phases: z.array(phaseSchema).min(1, "At least one phase is required"),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (let i = 0; i < value.phases.length; i++) {
      const phase = value.phases[i];
      if (phase.end_date <= phase.start_date) {
        ctx.addIssue({
          code: "custom",
          message: `Phase ${i} end_date must be after start_date`,
          path: ["phases", i, "end_date"],
        });
      }
    }

    for (let i = 1; i < value.phases.length; i++) {
      if (value.phases[i].start_date !== value.phases[i - 1].end_date) {
        ctx.addIssue({
          code: "custom",
          message: `Phases must be contiguous: phase ${i} start_date must equal phase ${i - 1} end_date`,
          path: ["phases", i, "start_date"],
        });
      }
    }
  });

export const listSubscriptionSchedulesSchema = z.object({
  subscription: subscriptionIdSchema.optional(),
  status: z
    .enum(["not_started", "active", "completed", "canceled", "released"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  starting_after: subscriptionScheduleIdSchema.optional(),
  ending_before: subscriptionScheduleIdSchema.optional(),
});
