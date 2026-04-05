import type { StripeList } from "@/modules/shared/types";

export type MeterAggregation = "sum" | "count";
export type MeterStatus = "active" | "inactive";

export type Meter = {
  id: string;
  object: "billing.meter";
  display_name: string;
  event_name: string;
  default_aggregation: { formula: MeterAggregation };
  status: MeterStatus;
  livemode: boolean;
  created: number;
  updated: number;
};

export type CreateMeterInput = {
  display_name: string;
  event_name: string;
  default_aggregation: { formula: MeterAggregation };
};

export type UpdateMeterInput = {
  display_name: string;
};

export type ListMetersParams = {
  limit?: number;
  status?: MeterStatus;
  starting_after?: string;
  ending_before?: string;
};

export type StripeMeterList = StripeList<Meter>;
