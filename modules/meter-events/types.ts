import type { StripeList } from "@/modules/shared/types";

export type MeterEventPayload = {
  stripe_customer_id: string;
  value: string;
};

export type MeterEvent = {
  id: string;
  object: "billing.meter_event";
  created: number;
  event_name: string;
  identifier: string;
  livemode: boolean;
  payload: MeterEventPayload;
  timestamp: number;
};

export type MeterEventSummary = {
  id: string;
  object: "billing.meter_event_summary";
  aggregated_value: number;
  end_time: number;
  livemode: boolean;
  meter: string;
  start_time: number;
};

export type CreateMeterEventInput = {
  event_name: string;
  identifier?: string;
  count?: number;
  payload: {
    stripe_customer_id: string;
    value: number;
  };
  timestamp?: number;
};

export type MeterEventSummaryGroupingWindow = "hour" | "day";

export type ListMeterEventSummariesParams = {
  customer: string;
  start_time: number;
  end_time: number;
  value_grouping_window?: MeterEventSummaryGroupingWindow;
};

export type StripeMeterEventSummaryList = StripeList<MeterEventSummary>;
