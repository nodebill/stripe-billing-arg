export type Address = {
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export type Customer = {
  id: string;
  object: "customer";
  name: string | null;
  email: string | null;
  description: string | null;
  address: Address | null;
  metadata: Record<string, string>;
  livemode: boolean;
  created: number;
  updated: number;
};

export type CreateCustomerInput = {
  name?: string;
  email?: string;
  description?: string;
  address?: Address;
  paymentMethodBillingName?: string;
  taxId?: {
    type: string;
    value: string;
  };
  metadata?: Record<string, string>;
};

export type ImportedCustomerCsvRow = {
  row: number;
  name: string;
  email: string;
  description: string;
  address_line1: string;
  address_line2: string;
  address_city: string;
  address_state: string;
  address_postal_code: string;
  address_country: string;
  tax_id_type: string;
  tax_id_value: string;
  payment_method_billing_name: string;
  metadata: Record<string, string>;
};

export type CustomerImportError = {
  row: number;
  message: string;
};

export type CustomerImportResult = {
  object: "customer_import";
  total_rows: number;
  created_count: number;
  failed_count: number;
  created: Customer[];
  errors: CustomerImportError[];
};

export type CustomerImportParsedCsv = {
  rows: ImportedCustomerCsvRow[];
  errors: CustomerImportError[];
  totalRows: number;
};

export type CustomerImportOperationResult = {
  type: "file_error";
  message: string;
};

export type UpdateCustomerInput = {
  name?: string | null;
  email?: string | null;
  description?: string | null;
  address?: Address | null;
  metadata?: Record<string, string>;
};

export type DeletedCustomer = {
  id: string;
  object: "customer";
  deleted: true;
};

export type DeleteCustomerResult = DeletedCustomer | "has_subscriptions" | null;

export type ListCustomersParams = {
  limit?: number;
  email?: string;
  starting_after?: string;
  ending_before?: string;
};

export type SearchCustomersParams = {
  metadataKey: string;
  metadataValue: string;
  limit?: number;
  page?: string;
};

export type TaxId = {
  id: string;
  object: "tax_id";
  type: string;
  value: string;
  customer: string;
  created: number;
};

export type DeletedTaxId = {
  id: string;
  object: "tax_id";
  deleted: true;
};

export type CreateTaxIdInput = {
  type: string;
  value: string;
};

export type { StripeList, StripeSearchResult } from "@/modules/shared/types";
