import type { StripeList } from "@/modules/shared/types";

export type SubscriptionScheduleStatus =
  | "not_started"
  | "active"
  | "completed"
  | "canceled"
  | "released";

export type SubscriptionScheduleEndBehavior = "release" | "cancel";

export type SubscriptionSchedulePhase = {
  price: string;
  start_date: number;
  end_date: number;
};

export type SubscriptionSchedule = {
  id: string;
  object: "subscription_schedule";
  subscription: string;
  status: SubscriptionScheduleStatus;
  end_behavior: SubscriptionScheduleEndBehavior;
  current_phase: { start_date: number; end_date: number } | null;
  phases: SubscriptionSchedulePhase[];
  released_at: number | null;
  canceled_at: number | null;
  completed_at: number | null;
  livemode: boolean;
  created: number;
  updated: number;
};

export type CreateSubscriptionScheduleInput = {
  subscription: string;
  end_behavior: SubscriptionScheduleEndBehavior;
  phases: Array<{
    price: string;
    start_date: number;
    end_date: number;
  }>;
};

export type UpdateSubscriptionScheduleInput = {
  end_behavior?: SubscriptionScheduleEndBehavior;
  phases: Array<{
    price: string;
    start_date: number;
    end_date: number;
  }>;
};

export type ListSubscriptionSchedulesParams = {
  subscription?: string;
  status?: SubscriptionScheduleStatus;
  limit?: number;
  starting_after?: string;
  ending_before?: string;
};

export type StripeSubscriptionScheduleList =
  StripeList<SubscriptionSchedule>;
