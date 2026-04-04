CREATE TABLE IF NOT EXISTS "products" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'products'
			AND column_name = 'created'
	) THEN
		UPDATE "products"
		SET "created_at" = COALESCE("created_at", to_timestamp("created")),
			"updated_at" = COALESCE("updated_at", to_timestamp("updated"))
		WHERE "created_at" IS NULL
			OR "updated_at" IS NULL;
	END IF;
END $$;
--> statement-breakpoint
UPDATE "products" SET "metadata" = '{}'::jsonb WHERE "metadata" IS NULL;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "metadata" SET NOT NULL;
--> statement-breakpoint
UPDATE "products" SET "created_at" = now() WHERE "created_at" IS NULL;
--> statement-breakpoint
UPDATE "products" SET "updated_at" = now() WHERE "updated_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "created_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "updated_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN IF EXISTS "created";
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN IF EXISTS "updated";
