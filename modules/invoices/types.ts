import type { StripeList } from "@/modules/shared/types";

export type InvoiceStatus = "draft" | "open" | "paid" | "past_due";
export type InvoiceCollectionMethod = "charge_automatically" | "send_invoice";
export type InvoiceDeliveryStatus = "pending" | "sent";
export type InvoiceLineItemBillingReason =
  | "licensed_recurring"
  | "metered_recurring"
  | "metered_carryforward";

export type InvoiceDelivery = {
  id: string;
  object: "invoice_delivery";
  channel: "mock_email";
  status: InvoiceDeliveryStatus;
  recipient: string | null;
  sent_at: number | null;
  payload: Record<string, string | null>;
};

export type Invoice = {
  id: string;
  object: "invoice";
  customer: string;
  subscription: string;
  status: InvoiceStatus;
  collection_method: InvoiceCollectionMethod;
  currency: string;
  subtotal: number;
  tax_amount: number;
  amount_due: number;
  amount_paid: number;
  due_date: number | null;
  period_start: number;
  period_end: number;
  auto_advance: boolean;
  finalized_at: number | null;
  paid_at: number | null;
  latest_delivery: InvoiceDelivery | null;
  created: number;
  updated: number;
};

export type InvoiceLineItem = {
  id: string;
  object: "invoice_line_item";
  price: string;
  billing_reason: InvoiceLineItemBillingReason;
  quantity: number;
  amount: number;
  currency: string;
  period_start: number;
  period_end: number;
  created: number;
  updated: number;
};

export type InvoiceDetail = Invoice & {
  line_items: InvoiceLineItem[];
};

export type ListInvoicesParams = {
  customer?: string;
  limit?: number;
  starting_after?: string;
  ending_before?: string;
};

export type StripeInvoiceList = StripeList<Invoice>;
