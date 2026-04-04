import type { StripeList } from "@/modules/shared/types";

export type SubscriptionStatus = "active" | "canceled";

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
  default_payment_method: string;
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
  default_payment_method: string;
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
