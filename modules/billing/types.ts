export type BillingProcessorSummary = {
  processed_subscriptions: number;
  canceled_subscriptions: number;
  created_invoices: number;
  refreshed_drafts: number;
  past_due_invoices: number;
};

export type BillingProcessorState = {
  id: string;
  lease_owner: string | null;
  lease_expires_at: number | null;
  last_started_at: number | null;
  last_finished_at: number | null;
  last_error: string | null;
  last_summary: BillingProcessorSummary | null;
  updated_at: number;
};

export type ProcessDueSubscriptionsOptions = {
  runAt?: Date;
  trigger?: string;
};
