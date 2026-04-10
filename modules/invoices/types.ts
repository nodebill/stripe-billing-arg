import type { StripeList } from "@/modules/shared/types";

export type InvoiceStatus = "draft" | "invoiced" | "sent";
export type InvoicePaymentStatus = "pending" | "paid" | "past_due";
export type InvoiceCollectionMethod = "charge_automatically" | "send_invoice";
export type InvoiceDeliveryStatus = "pending" | "sent";
export type InvoiceDeliveryChannel = "mock_email" | "email";
export type InvoiceLineItemBillingReason =
  | "licensed_recurring"
  | "metered_recurring"
  | "metered_carryforward";
export type InvoiceType = "FACTURA_A" | "FACTURA_B";
export type InvoiceTaxCondition =
  | "RESPONSABLE_INSCRIPTO"
  | "MONOTRIBUTO"
  | "CONSUMIDOR_FINAL";

export type InvoiceDelivery = {
  id: string;
  object: "invoice_delivery";
  channel: InvoiceDeliveryChannel;
  status: InvoiceDeliveryStatus;
  recipient: string | null;
  sent_at: number | null;
  payload: Record<string, string | null>;
};

export type InvoiceLegalDocument = {
  invoice_type: InvoiceType;
  document_number: number;
  invoice_number: number;
  invoice_date: string;
  cae: string;
  cae_due_date: string;
  pdf_url: string;
  receiver_name: string;
  receiver_tax_id: string;
  receiver_tax_condition: InvoiceTaxCondition;
  receiver_address: string;
};

export type Invoice = {
  id: string;
  object: "invoice";
  customer: string;
  subscription: string;
  status: InvoiceStatus;
  payment_status: InvoicePaymentStatus;
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
  invoiced_at: number | null;
  paid_at: number | null;
  legal_document: InvoiceLegalDocument | null;
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
  status?: InvoiceStatus;
  date_from?: string;
  date_to?: string;
  limit?: number;
  starting_after?: string;
  ending_before?: string;
};

export type StripeInvoiceList = StripeList<Invoice>;

export type InvoiceBatchAction = "issue" | "send";

export type InvoiceBatchResultItem = {
  invoice_id: string;
  status: "processed" | "failed";
  invoice?: InvoiceDetail;
  message?: string;
};

export type InvoiceBatchResult = {
  object: "invoice_batch";
  action: InvoiceBatchAction;
  processed_invoices: number;
  failed_invoices: number;
  results: InvoiceBatchResultItem[];
};

export type InvoiceIssuePreviewPayload = {
  afip_request: Record<string, unknown>;
  pdf_request: Record<string, unknown>;
};

export type InvoiceIssuePreview = {
  invoice_id: string;
  invoice_status: InvoiceStatus;
  invoice_type: InvoiceType;
  receiver_name: string;
  receiver_tax_id: string;
  receiver_tax_condition: InvoiceTaxCondition;
  receiver_address: string;
  estimated_invoice_number: number;
  collection_method: InvoiceCollectionMethod;
  expected_payment_status: InvoicePaymentStatus;
  due_date: number | null;
  warnings: string[];
  payloads: InvoiceIssuePreviewPayload;
};

export type InvoiceIssuePreviewResultItem = {
  invoice_id: string;
  status: "previewed" | "failed";
  preview?: InvoiceIssuePreview;
  message?: string;
};

export type InvoiceIssuePreviewResult = {
  object: "invoice_issue_preview_batch";
  previewed_invoices: number;
  failed_invoices: number;
  results: InvoiceIssuePreviewResultItem[];
};
