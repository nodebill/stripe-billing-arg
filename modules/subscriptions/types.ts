import type { StripeList } from "@/modules/shared/types";

export type SubscriptionStatus = "active" | "past_due" | "canceled";
export type SubscriptionCollectionMethod =
  | "charge_automatically"
  | "send_invoice";
export type SubscriptionProrationBehavior = "create_prorations" | "none";
export type SubscriptionRenewalMode = "automatic" | "manual_until_current";
export type SubscriptionBackdateBehavior =
  | "advance_to_current_period"
  | "preserve_exact_cycle";

export type SubscriptionBillingCycleAnchorConfig = {
  day_of_month: number;
  month?: number;
  hour?: number;
  minute?: number;
  second?: number;
};

export type SubscriptionItem = {
  id: string;
  object: "subscription_item";
  price: string;
};

export type Subscription = {
  id: string;
  object: "subscription";
  customer: string;
  status: SubscriptionStatus;
  renewal_mode: SubscriptionRenewalMode;
  collection_method: SubscriptionCollectionMethod;
  default_payment_method: string | null;
  items: SubscriptionItem[];
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  ended_at: number | null;
  billing_anchor_start: number;
  current_period_start: number;
  current_period_end: number;
  livemode: boolean;
  created: number;
  updated: number;
};

export type CreateSubscriptionInput = {
  customer: string;
  collection_method?: SubscriptionCollectionMethod;
  default_payment_method?: string;
  billing_cycle_anchor?: number;
  billing_cycle_anchor_config?: SubscriptionBillingCycleAnchorConfig;
  backdate_start_date?: number;
  backdate_behavior?: SubscriptionBackdateBehavior;
  proration_behavior?: SubscriptionProrationBehavior;
  items: Array<{
    price: string;
  }>;
};

export type ImportedSubscriptionCsvRow = {
  row: number;
  customer: string;
  price: string;
  collection_method: string;
  default_payment_method: string;
  billing_cycle_mode: string;
  billing_day_of_month: string;
  billing_month: string;
  backdate_start_date: string;
  backdate_behavior: string;
  proration_behavior: string;
};

export type SubscriptionImportError = {
  row: number;
  message: string;
};

export type SubscriptionImportResult = {
  object: "subscription_import";
  total_rows: number;
  created_count: number;
  failed_count: number;
  created: Subscription[];
  errors: SubscriptionImportError[];
};

export type SubscriptionImportParsedCsv = {
  rows: ImportedSubscriptionCsvRow[];
  errors: SubscriptionImportError[];
  totalRows: number;
};

export type SubscriptionImportOperationResult = {
  type: "file_error";
  message: string;
};

export type UpdateSubscriptionInput = {
  cancel_at_period_end: boolean;
};

export type CloseSubscriptionCycleResult = {
  subscription: Subscription;
  invoice: import("@/modules/invoices/types").InvoiceDetail;
};

export type ListSubscriptionsParams = {
  customer: string;
  status?: SubscriptionStatus;
  limit?: number;
  starting_after?: string;
  ending_before?: string;
};

export type StripeSubscriptionList = StripeList<Subscription>;
