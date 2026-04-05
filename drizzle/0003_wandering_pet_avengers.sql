CREATE TABLE IF NOT EXISTS "meter_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"meter_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"identifier" text NOT NULL,
	"event_name" text NOT NULL,
	"value" integer NOT NULL,
	"event_timestamp" timestamp with time zone NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meters" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"display_name" text NOT NULL,
	"event_name" text NOT NULL,
	"default_aggregation" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meter_events_org_identifier_idx" ON "meter_events" USING btree ("organization_id","identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meter_events_org_meter_customer_timestamp_idx" ON "meter_events" USING btree ("organization_id","meter_id","customer_id","event_timestamp");--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "unit_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN IF NOT EXISTS "unit_amount_decimal" text;--> statement-breakpoint
UPDATE "prices" SET "unit_amount_decimal" = "unit_amount"::text WHERE "unit_amount_decimal" IS NULL AND "unit_amount" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "unit_amount_decimal" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN IF NOT EXISTS "meter" text;
