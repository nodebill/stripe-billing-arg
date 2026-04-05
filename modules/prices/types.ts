import type { StripeList } from "@/modules/shared/types";

export type PriceType = "one_time" | "recurring";
export type PriceInterval = "month" | "year";
export type UsageType = "licensed" | "metered";

export type PriceRecurring = {
  interval: PriceInterval;
  interval_count: 1;
  usage_type: UsageType;
};

export type Price = {
  id: string;
  object: "price";
  active: boolean;
  billing_scheme: "per_unit";
  currency: string;
  livemode: boolean;
  metadata: Record<string, string>;
  nickname: string | null;
  product: string;
  type: PriceType;
  unit_amount: number;
  recurring: PriceRecurring | null;
  meter: string | null;
  created: number;
  updated: number;
};

export type CreatePriceInput =
  | {
      product: string;
      currency: string;
      unit_amount: number;
      type: "one_time";
      recurring?: undefined;
      meter?: undefined;
      nickname?: string;
      metadata?: Record<string, string>;
      active?: boolean;
    }
  | {
      product: string;
      currency: string;
      unit_amount: number;
      type: "recurring";
      recurring: { interval: PriceInterval; interval_count: 1; usage_type: UsageType };
      meter?: string;
      nickname?: string;
      metadata?: Record<string, string>;
      active?: boolean;
    };

export type UpdatePriceInput = {
  active?: boolean;
  nickname?: string | null;
  metadata?: Record<string, string>;
};

export type ListPricesParams = {
  product: string;
  limit?: number;
  active?: boolean;
  type?: PriceType;
  starting_after?: string;
  ending_before?: string;
};

export type StripePriceList = StripeList<Price>;
