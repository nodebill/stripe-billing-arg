ALTER TABLE "invoice_line_items" ALTER COLUMN "quantity" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "quantity" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "meter_events" ALTER COLUMN "value" SET DATA TYPE bigint;