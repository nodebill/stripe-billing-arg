import { inArray } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { getDb } from "@/infrastructure/database/client";
import { meters } from "@/infrastructure/database/schema";
import { getProduct } from "@/modules/products/service";
import {
  PRICE_IMPORT_METADATA_PREFIX,
  PRICE_IMPORT_STANDARD_HEADERS,
} from "./import-contract";
import { createPrice } from "./service";
import type {
  BulkPriceImportError,
  BulkPriceImportResult,
  ImportedPriceCsvRow,
  ImportedPriceInput,
  PriceImportOperationResult,
  PriceImportParsedCsv,
} from "./types";
import { importedPriceRowSchema } from "./validation";

type ParsedCsvRecord = {
  record: string[];
  info: {
    lines: number;
  };
};

function badRequest(message: string): PriceImportOperationResult {
  return { type: "file_error", message };
}

function trimOptionalString(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseActiveField(
  value: string,
  row: number
): { active?: boolean } | { error: BulkPriceImportError } {
  const trimmed = value.trim().toLowerCase();

  if (trimmed === "" || trimmed === "true") {
    return { active: trimmed === "" ? undefined : true };
  }

  if (trimmed === "false") {
    return { active: false };
  }

  return {
    error: {
      row,
      message: "active must be blank, true, or false",
    },
  };
}

function normalizeImportedPriceRow(
  row: ImportedPriceCsvRow
): { input: ImportedPriceInput } | { error: BulkPriceImportError } {
  const active = parseActiveField(row.active, row.row);
  if ("error" in active) {
    return active;
  }

  const unitAmount = trimOptionalString(row.unit_amount);
  const unitAmountDecimal = trimOptionalString(row.unit_amount_decimal);
  const currency = row.currency.trim().toLowerCase();
  const type = row.type.trim();
  const nickname = trimOptionalString(row.nickname);

  if (type === "one_time") {
    const parsed = importedPriceRowSchema.safeParse({
      currency,
      type,
      unit_amount: unitAmount === undefined ? undefined : Number(unitAmount),
      unit_amount_decimal: unitAmountDecimal,
      nickname,
      active: active.active,
      metadata: row.metadata,
    });

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

  const interval = trimOptionalString(row.interval);
  const usageType = trimOptionalString(row.usage_type)?.toLowerCase() ?? "licensed";
  const meter = trimOptionalString(row.meter);
  const parsed = importedPriceRowSchema.safeParse({
    currency,
    type,
    unit_amount: unitAmount === undefined ? undefined : Number(unitAmount),
    unit_amount_decimal: unitAmountDecimal,
    nickname,
    active: active.active,
    metadata: row.metadata,
    recurring: {
      interval,
      interval_count: 1,
      usage_type: usageType,
    },
    meter,
  });

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

function validateHeaders(headers: string[]): PriceImportOperationResult | null {
  if (headers.length === 0) {
    return badRequest("CSV file must include a header row");
  }

  const duplicates = headers.filter(
    (header, index) => headers.indexOf(header) !== index
  );
  if (duplicates.length > 0) {
    return badRequest(`Duplicate CSV header: '${duplicates[0]}'`);
  }

  const missingHeader = PRICE_IMPORT_STANDARD_HEADERS.find(
    (header) => !headers.includes(header)
  );
  if (missingHeader) {
    return badRequest(`Missing required CSV header: '${missingHeader}'`);
  }

  const invalidHeader = headers.find((header) => {
    if (PRICE_IMPORT_STANDARD_HEADERS.includes(header as (typeof PRICE_IMPORT_STANDARD_HEADERS)[number])) {
      return false;
    }

    if (!header.startsWith(PRICE_IMPORT_METADATA_PREFIX)) {
      return true;
    }

    return header.slice(PRICE_IMPORT_METADATA_PREFIX.length).trim().length === 0;
  });

  if (invalidHeader) {
    return badRequest(
      `Unsupported CSV header: '${invalidHeader}'. Only metadata.* columns may extend the standard header set`
    );
  }

  return null;
}

export function parsePriceImportCsv(
  text: string
): PriceImportParsedCsv | PriceImportOperationResult {
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

  const rows: ImportedPriceCsvRow[] = [];
  const errors: BulkPriceImportError[] = [];

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

    const metadata = Object.entries(rawRow).reduce<Record<string, string>>(
      (acc, [header, value]) => {
        if (!header.startsWith(PRICE_IMPORT_METADATA_PREFIX)) {
          return acc;
        }

        const trimmed = value.trim();
        if (!trimmed) {
          return acc;
        }

        acc[header.slice(PRICE_IMPORT_METADATA_PREFIX.length)] = trimmed;
        return acc;
      },
      {}
    );

    rows.push({
      row: record.info.lines,
      currency: rawRow.currency ?? "",
      type: rawRow.type ?? "",
      unit_amount: rawRow.unit_amount ?? "",
      unit_amount_decimal: rawRow.unit_amount_decimal ?? "",
      nickname: rawRow.nickname ?? "",
      active: rawRow.active ?? "",
      interval: rawRow.interval ?? "",
      usage_type: rawRow.usage_type ?? "",
      meter: rawRow.meter ?? "",
      metadata,
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

async function loadReferencedMeters(inputs: ImportedPriceInput[]) {
  const meterIds = Array.from(
    new Set(
      inputs.flatMap((input) => {
        if (
          input.type === "recurring" &&
          input.recurring.usage_type === "metered" &&
          input.meter
        ) {
          return [input.meter];
        }

        return [];
      })
    )
  );

  if (meterIds.length === 0) {
    return new Map<string, "active" | "inactive">();
  }

  const rows = await getDb()
    .select({ id: meters.id, status: meters.status })
    .from(meters)
    .where(inArray(meters.id, meterIds));

  return new Map(rows.map((row) => [row.id, row.status]));
}

export async function importPricesForProduct(
  productId: string,
  csvText: string
): Promise<BulkPriceImportResult | PriceImportOperationResult> {
  const product = await getProduct(productId);
  if (!product) {
    return { type: "not_found", message: `No such product: '${productId}'` };
  }

  const parsed = parsePriceImportCsv(csvText);
  if ("type" in parsed) {
    return parsed;
  }

  const errors = [...parsed.errors];
  const validRows: Array<{ row: number; input: ImportedPriceInput }> = [];

  for (const row of parsed.rows) {
    const normalized = normalizeImportedPriceRow(row);
    if ("error" in normalized) {
      errors.push(normalized.error);
      continue;
    }

    validRows.push({ row: row.row, input: normalized.input });
  }

  const referencedMeters = await loadReferencedMeters(
    validRows.map((entry) => entry.input)
  );
  const created = [];

  for (const entry of validRows) {
    const { input, row } = entry;

    if (
      input.type === "recurring" &&
      input.recurring.usage_type === "metered" &&
      input.meter
    ) {
      const status = referencedMeters.get(input.meter);
      if (!status) {
        errors.push({ row, message: `No such meter: '${input.meter}'` });
        continue;
      }

      if (status !== "active") {
        errors.push({ row, message: `Meter '${input.meter}' is not active` });
        continue;
      }
    }

    const result = await createPrice({
      ...input,
      product: productId,
    });

    if (!result) {
      return { type: "not_found", message: `No such product: '${productId}'` };
    }

    if ("error" in result) {
      errors.push({ row, message: result.error });
      continue;
    }

    created.push(result);
  }

  errors.sort((left, right) => left.row - right.row);

  return {
    object: "price_import",
    product: product.id,
    total_rows: parsed.totalRows,
    created_count: created.length,
    failed_count: errors.length,
    created,
    errors,
  };
}
