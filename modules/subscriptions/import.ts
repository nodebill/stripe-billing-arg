import { inArray } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { getDb } from "@/infrastructure/database/client";
import { prices } from "@/infrastructure/database/schema";
import { createSubscriptionSchema } from "./validation";
import { SUBSCRIPTION_IMPORT_STANDARD_HEADERS } from "./import-contract";
import {
  createSubscription,
  SubscriptionError,
} from "./service";
import type {
  CreateSubscriptionInput,
  SubscriptionImportError,
  SubscriptionImportOperationResult,
  SubscriptionImportParsedCsv,
  SubscriptionImportResult,
  ImportedSubscriptionCsvRow,
} from "./types";

type ParsedCsvRecord = {
  record: string[];
  info: {
    lines: number;
  };
};

function badRequest(message: string): SubscriptionImportOperationResult {
  return { type: "file_error", message };
}

function trimOptionalString(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseDateToUtcMidnight(
  value: string
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0) / 1000);
  const parsedDate = new Date(timestamp * 1000);

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function validateHeaders(
  headers: string[]
): SubscriptionImportOperationResult | null {
  if (headers.length === 0) {
    return badRequest("CSV file must include a header row");
  }

  const duplicates = headers.filter(
    (header, index) => headers.indexOf(header) !== index
  );
  if (duplicates.length > 0) {
    return badRequest(`Duplicate CSV header: '${duplicates[0]}'`);
  }

  const missingHeader = SUBSCRIPTION_IMPORT_STANDARD_HEADERS.find(
    (header) => !headers.includes(header)
  );
  if (missingHeader) {
    return badRequest(`Missing required CSV header: '${missingHeader}'`);
  }

  const invalidHeader = headers.find(
    (header) =>
      !SUBSCRIPTION_IMPORT_STANDARD_HEADERS.includes(
        header as (typeof SUBSCRIPTION_IMPORT_STANDARD_HEADERS)[number]
      )
  );

  if (invalidHeader) {
    return badRequest(`Unsupported CSV header: '${invalidHeader}'`);
  }

  return null;
}

async function loadReferencedPrices(priceIds: string[]) {
  const uniquePriceIds = Array.from(new Set(priceIds));

  if (uniquePriceIds.length === 0) {
    return new Map<
      string,
      { type: "one_time" | "recurring"; recurringInterval: "month" | "year" | null }
    >();
  }

  const rows = await getDb()
    .select({
      id: prices.id,
      type: prices.type,
      recurringInterval: prices.recurringInterval,
    })
    .from(prices)
    .where(inArray(prices.id, uniquePriceIds));

  return new Map(rows.map((row) => [row.id, row]));
}

function normalizeImportedSubscriptionRow(
  row: ImportedSubscriptionCsvRow,
  priceInfo: Map<
    string,
    { type: "one_time" | "recurring"; recurringInterval: "month" | "year" | null }
  >
): { input: CreateSubscriptionInput } | { error: SubscriptionImportError } {
  const collectionMethod = trimOptionalString(row.collection_method) ?? "charge_automatically";
  if (!["charge_automatically", "send_invoice"].includes(collectionMethod)) {
    return {
      error: {
        row: row.row,
        message:
          "collection_method must be blank, charge_automatically, or send_invoice",
      },
    };
  }

  const billingCycleMode = trimOptionalString(row.billing_cycle_mode) ?? "start_today";
  if (!["start_today", "align_renewal", "backdate_start"].includes(billingCycleMode)) {
    return {
      error: {
        row: row.row,
        message:
          "billing_cycle_mode must be blank, start_today, align_renewal, or backdate_start",
      },
    };
  }

  const prorationBehavior = trimOptionalString(row.proration_behavior) ?? "create_prorations";
  if (!["create_prorations", "none"].includes(prorationBehavior)) {
    return {
      error: {
        row: row.row,
        message:
          "proration_behavior must be blank, create_prorations, or none",
      },
    };
  }

  const body: CreateSubscriptionInput = {
    customer: row.customer.trim(),
    collection_method: collectionMethod as "charge_automatically" | "send_invoice",
    default_payment_method: trimOptionalString(row.default_payment_method),
    proration_behavior: prorationBehavior as "create_prorations" | "none",
    items: [{ price: row.price.trim() }],
  };

  if (billingCycleMode === "align_renewal") {
    const billingDayRaw = trimOptionalString(row.billing_day_of_month);
    if (!billingDayRaw) {
      return {
        error: {
          row: row.row,
          message:
            "billing_day_of_month is required when billing_cycle_mode is align_renewal",
        },
      };
    }

    const billingDay = Number(billingDayRaw);
    if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) {
      return {
        error: {
          row: row.row,
          message: "billing_day_of_month must be an integer between 1 and 31",
        },
      };
    }

    const billingMonthRaw = trimOptionalString(row.billing_month);
    if (billingMonthRaw) {
      const billingMonth = Number(billingMonthRaw);
      if (!Number.isInteger(billingMonth) || billingMonth < 1 || billingMonth > 12) {
        return {
          error: {
            row: row.row,
            message: "billing_month must be an integer between 1 and 12",
          },
        };
      }

      const rowPrice = priceInfo.get(body.items[0].price);
      if (rowPrice?.recurringInterval === "month") {
        return {
          error: {
            row: row.row,
            message: "billing_month is only supported for yearly prices",
          },
        };
      }

      body.billing_cycle_anchor_config = {
        day_of_month: billingDay,
        month: billingMonth,
      };
    } else {
      body.billing_cycle_anchor_config = {
        day_of_month: billingDay,
      };
    }
  }

  if (billingCycleMode === "backdate_start") {
    const backdateStartDate = trimOptionalString(row.backdate_start_date);
    if (!backdateStartDate) {
      return {
        error: {
          row: row.row,
          message:
            "backdate_start_date is required when billing_cycle_mode is backdate_start",
        },
      };
    }

    const timestamp = parseDateToUtcMidnight(backdateStartDate);
    if (timestamp == null) {
      return {
        error: {
          row: row.row,
          message: "backdate_start_date must use YYYY-MM-DD",
        },
      };
    }

    body.backdate_start_date = timestamp;
  }

  const parsed = createSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return {
      error: {
        row: row.row,
        message: parsed.error.issues[0]?.message ?? "Invalid row",
      },
    };
  }

  return { input: parsed.data };
}

export function parseSubscriptionImportCsv(
  text: string
): SubscriptionImportParsedCsv | SubscriptionImportOperationResult {
  let records: ParsedCsvRecord[];

  try {
    records = parse(text, {
      bom: true,
      info: true,
      relax_column_count: true,
      trim: true,
    }) as unknown as ParsedCsvRecord[];
  } catch {
    return badRequest("Unable to read CSV file");
  }

  if (records.length === 0) {
    return badRequest("CSV file must include a header row and at least one data row");
  }

  const headerRow = records[0]?.record ?? [];
  const headerValidation = validateHeaders(headerRow);
  if (headerValidation) {
    return headerValidation;
  }

  const rows: ImportedSubscriptionCsvRow[] = [];
  const errors: SubscriptionImportError[] = [];

  for (const record of records.slice(1)) {
    const cells = record.record.map((value) => value ?? "");
    const isBlankRow = cells.every((value) => value.trim() === "");

    if (isBlankRow) {
      continue;
    }

    if (cells.length !== headerRow.length) {
      errors.push({
        row: record.info.lines,
        message: `Row has ${cells.length} columns but header defines ${headerRow.length}`,
      });
      continue;
    }

    const rawRow = headerRow.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cells[index] ?? "";
      return acc;
    }, {});

    rows.push({
      row: record.info.lines,
      customer: rawRow.customer ?? "",
      price: rawRow.price ?? "",
      collection_method: rawRow.collection_method ?? "",
      default_payment_method: rawRow.default_payment_method ?? "",
      billing_cycle_mode: rawRow.billing_cycle_mode ?? "",
      billing_day_of_month: rawRow.billing_day_of_month ?? "",
      billing_month: rawRow.billing_month ?? "",
      backdate_start_date: rawRow.backdate_start_date ?? "",
      proration_behavior: rawRow.proration_behavior ?? "",
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    return badRequest("CSV file must include at least one data row");
  }

  return {
    rows,
    errors,
    totalRows: rows.length + errors.length,
  };
}

export async function importSubscriptions(
  csvText: string
): Promise<SubscriptionImportResult | SubscriptionImportOperationResult> {
  const parsed = parseSubscriptionImportCsv(csvText);
  if ("type" in parsed) {
    return parsed;
  }

  const errors = [...parsed.errors];
  const priceInfo = await loadReferencedPrices(
    parsed.rows.map((row) => row.price.trim()).filter(Boolean)
  );
  const created = [];

  for (const row of parsed.rows) {
    const normalized = normalizeImportedSubscriptionRow(row, priceInfo);
    if ("error" in normalized) {
      errors.push(normalized.error);
      continue;
    }

    try {
      created.push(await createSubscription(normalized.input));
    } catch (error) {
      if (error instanceof SubscriptionError) {
        errors.push({ row: row.row, message: error.message });
        continue;
      }

      throw error;
    }
  }

  errors.sort((left, right) => left.row - right.row);

  return {
    object: "subscription_import",
    total_rows: parsed.totalRows,
    created_count: created.length,
    failed_count: errors.length,
    created,
    errors,
  };
}
