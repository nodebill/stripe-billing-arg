export type Customer = {
  id: string;
  object: "customer";
  name: string | null;
  email: string | null;
  description: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
  created: number;
  updated: number;
};

export type CreateCustomerInput = {
  name?: string;
  email?: string;
  description?: string;
  metadata?: Record<string, string>;
};

export type UpdateCustomerInput = {
  name?: string | null;
  email?: string | null;
  description?: string | null;
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

export type { StripeList } from "@/modules/shared/types";
