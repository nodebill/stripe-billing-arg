ALTER TABLE "invoice_line_items" ADD COLUMN "billing_reason" text;--> statement-breakpoint
UPDATE "invoice_line_items" AS "line_items"
SET "billing_reason" = CASE
  WHEN "prices"."meter" IS NULL THEN 'licensed_recurring'
  ELSE 'metered_recurring'
END
FROM "prices"
WHERE "prices"."id" = "line_items"."price_id";--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "billing_reason" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "meter_events" ADD COLUMN "invoice_line_item_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "renewal_mode" text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_anchor_start" timestamp with time zone;--> statement-breakpoint
UPDATE "subscriptions"
SET "billing_anchor_start" = "current_period_start"
WHERE "billing_anchor_start" IS NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "billing_anchor_start" SET NOT NULL;
