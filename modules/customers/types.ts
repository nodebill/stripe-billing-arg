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
  metadata?: Record<string, string>;
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
