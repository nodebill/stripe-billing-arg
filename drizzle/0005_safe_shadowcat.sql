CREATE TABLE "subscription_schedule_phases" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"price_id" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"order_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"status" text NOT NULL,
	"end_behavior" text NOT NULL,
	"current_phase_id" text,
	"released_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"livemode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "address" jsonb;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tax_id" jsonb;--> statement-breakpoint
CREATE INDEX "subscription_schedule_phases_schedule_order_idx" ON "subscription_schedule_phases" USING btree ("schedule_id","order_index");--> statement-breakpoint
CREATE INDEX "subscription_schedules_subscription_id_idx" ON "subscription_schedules" USING btree ("subscription_id");