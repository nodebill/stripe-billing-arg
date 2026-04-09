export const SUBSCRIPTION_IMPORT_STANDARD_HEADERS = [
  "customer",
  "price",
  "collection_method",
  "default_payment_method",
  "billing_cycle_mode",
  "billing_day_of_month",
  "billing_month",
  "backdate_start_date",
  "backdate_behavior",
  "proration_behavior",
] as const;

export const SUBSCRIPTION_IMPORT_EXAMPLE_CSV = [
  SUBSCRIPTION_IMPORT_STANDARD_HEADERS.join(","),
  "cus_123,price_123,charge_automatically,pm_123,start_today,,,,,",
  "cus_456,price_456,send_invoice,,align_renewal,15,,,,",
  "cus_789,price_789,charge_automatically,pm_789,backdate_start,,,2026-04-01,preserve_exact_cycle,none",
].join("\n");
