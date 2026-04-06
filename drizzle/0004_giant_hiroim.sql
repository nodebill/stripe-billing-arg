CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 3600000,
	"rate_limit_max" integer DEFAULT 1000,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "team_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_config_id_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_reference_id_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invites_token_hash_idx" ON "team_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "team_invites_email_idx" ON "team_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "team_invites_created_by_user_id_idx" ON "team_invites" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_subscription_period_idx" ON "invoices" USING btree ("subscription_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "meter_events_identifier_idx" ON "meter_events" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "meter_events_meter_customer_timestamp_idx" ON "meter_events" USING btree ("meter_id","customer_id","event_timestamp");--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_single_workspace(table_name text) RETURNS void AS $$
DECLARE
  distinct_count integer;
BEGIN
  EXECUTE format(
    'SELECT COUNT(DISTINCT organization_id) FROM %I WHERE organization_id IS NOT NULL',
    table_name
  ) INTO distinct_count;

  IF distinct_count > 1 THEN
    RAISE EXCEPTION 'Cannot drop organization_id from %: found % distinct values', table_name, distinct_count;
  END IF;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
SELECT assert_single_workspace('customers');--> statement-breakpoint
SELECT assert_single_workspace('invoice_deliveries');--> statement-breakpoint
SELECT assert_single_workspace('invoice_line_items');--> statement-breakpoint
SELECT assert_single_workspace('invoices');--> statement-breakpoint
SELECT assert_single_workspace('meter_events');--> statement-breakpoint
SELECT assert_single_workspace('meters');--> statement-breakpoint
SELECT assert_single_workspace('payment_methods');--> statement-breakpoint
SELECT assert_single_workspace('prices');--> statement-breakpoint
SELECT assert_single_workspace('products');--> statement-breakpoint
SELECT assert_single_workspace('subscription_items');--> statement-breakpoint
SELECT assert_single_workspace('subscriptions');--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "invoice_deliveries" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "meter_events" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "meters" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "payment_methods" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "subscription_items" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "organization_id";--> statement-breakpoint
DROP FUNCTION assert_single_workspace(text);
