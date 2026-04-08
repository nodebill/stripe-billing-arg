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
  unit_amount: number | null;
  unit_amount_decimal: string;
  recurring: PriceRecurring | null;
  meter: string | null;
  created: number;
  updated: number;
};

type CreatePriceBaseInput = {
  product: string;
  currency: string;
  unit_amount?: number;
  unit_amount_decimal?: string;
  nickname?: string;
  metadata?: Record<string, string>;
  active?: boolean;
};

export type CreatePriceInput =
  | (CreatePriceBaseInput & {
      type: "one_time";
      recurring?: undefined;
      meter?: undefined;
    })
  | (CreatePriceBaseInput &
      {
        type: "recurring";
        recurring: {
          interval: PriceInterval;
          interval_count: 1;
          usage_type: UsageType;
        };
        meter?: string;
      });

export type UpdatePriceInput = {
  active?: boolean;
  nickname?: string | null;
  metadata?: Record<string, string>;
};

export type ImportedPriceInput =
  | {
      currency: string;
      unit_amount?: number;
      unit_amount_decimal?: string;
      nickname?: string;
      metadata?: Record<string, string>;
      active?: boolean;
      type: "one_time";
    }
  | {
      currency: string;
      unit_amount?: number;
      unit_amount_decimal?: string;
      nickname?: string;
      metadata?: Record<string, string>;
      active?: boolean;
      type: "recurring";
      recurring: {
        interval: PriceInterval;
        interval_count: 1;
        usage_type: UsageType;
      };
      meter?: string;
    };

export type ImportedPriceCsvRow = {
  row: number;
  currency: string;
  type: string;
  unit_amount: string;
  unit_amount_decimal: string;
  nickname: string;
  active: string;
  interval: string;
  usage_type: string;
  meter: string;
  metadata: Record<string, string>;
};

export type BulkPriceImportError = {
  row: number;
  message: string;
};

export type BulkPriceImportResult = {
  object: "price_import";
  product: string;
  total_rows: number;
  created_count: number;
  failed_count: number;
  created: Price[];
  errors: BulkPriceImportError[];
};

export type PriceImportParsedCsv = {
  rows: ImportedPriceCsvRow[];
  errors: BulkPriceImportError[];
  totalRows: number;
};

export type PriceImportOperationResult =
  | {
      type: "file_error";
      message: string;
    }
  | {
      type: "not_found";
      message: string;
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
