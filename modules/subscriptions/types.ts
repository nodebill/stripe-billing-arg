import type { StripeList } from "@/modules/shared/types";

export type SubscriptionStatus = "active" | "past_due" | "canceled";
export type SubscriptionCollectionMethod =
  | "charge_automatically"
  | "send_invoice";

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
  collection_method: SubscriptionCollectionMethod;
  default_payment_method: string | null;
  items: SubscriptionItem[];
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  ended_at: number | null;
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
  items: Array<{
    price: string;
  }>;
};

export type UpdateSubscriptionInput = {
  cancel_at_period_end: boolean;
};

export type ListSubscriptionsParams = {
  customer: string;
  status?: SubscriptionStatus;
  limit?: number;
  starting_after?: string;
  ending_before?: string;
};

export type StripeSubscriptionList = StripeList<Subscription>;
