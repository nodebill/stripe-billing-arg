CREATE TABLE "prices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"billing_scheme" text NOT NULL,
	"currency" text NOT NULL,
	"nickname" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"type" text NOT NULL,
	"unit_amount" integer NOT NULL,
	"recurring_interval" text,
	"recurring_interval_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "default_price_id" text;