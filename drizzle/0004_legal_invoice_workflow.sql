ALTER TABLE "invoices" ADD COLUMN "payment_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "invoiced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "legal_document" jsonb;--> statement-breakpoint
UPDATE "invoices"
SET
  "payment_status" = 'pending',
  "invoiced_at" = NULL,
  "status" = 'draft';--> statement-breakpoint
UPDATE "invoices"
SET
  "due_date" = NULL,
  "amount_paid" = 0,
  "paid_at" = NULL,
  "finalized_at" = NULL
WHERE TRUE;--> statement-breakpoint
DELETE FROM "invoice_deliveries";--> statement-breakpoint
