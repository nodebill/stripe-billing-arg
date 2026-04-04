import type { StripeList } from "@/modules/shared/types";

export const DEFAULT_CUSTOM_PAYMENT_METHOD_TYPE = "cpmt_default";

export type PaymentMethod = {
  id: string;
  object: "payment_method";
  type: "custom";
  custom: {
    type: string;
  };
  customer: string | null;
  billing_details: {
    name: string | null;
  };
  livemode: boolean;
  created: number;
  updated: number;
};

export type CreatePaymentMethodInput = {
  type: "custom";
  billing_details?: {
    name?: string;
  };
};

export type UpdatePaymentMethodInput = {
  billing_details: {
    name?: string | null;
  };
};

export type AttachPaymentMethodInput = {
  customer: string;
};

export type ListCustomerPaymentMethodsParams = {
  limit?: number;
  starting_after?: string;
  ending_before?: string;
};

export type StripePaymentMethodList = StripeList<PaymentMethod>;
