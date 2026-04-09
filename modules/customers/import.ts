import { parse } from "csv-parse/sync";
import { createCustomerSchema } from "./validation";
import { CUSTOMER_IMPORT_STANDARD_HEADERS } from "./import-contract";
import { createCustomer } from "./service";
import type {
  Address,
  CreateCustomerInput,
  CustomerImportError,
  CustomerImportOperationResult,
  CustomerImportParsedCsv,
  CustomerImportResult,
  ImportedCustomerCsvRow,
} from "./types";

type ParsedCsvRecord = {
  record: string[];
  info: {
    lines: number;
  };
};

function badRequest(message: string): CustomerImportOperationResult {
  return { type: "file_error", message };
}

function trimOptionalString(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function validateHeaders(
  headers: string[]
): CustomerImportOperationResult | null {
  if (headers.length === 0) {
    return badRequest("CSV file must include a header row");
  }

  const duplicates = headers.filter(
    (header, index) => headers.indexOf(header) !== index
  );
  if (duplicates.length > 0) {
    return badRequest(`Duplicate CSV header: '${duplicates[0]}'`);
  }

  const missingHeader = CUSTOMER_IMPORT_STANDARD_HEADERS.find(
    (header) => !headers.includes(header)
  );
  if (missingHeader) {
    return badRequest(`Missing required CSV header: '${missingHeader}'`);
  }

  const invalidHeader = headers.find(
    (header) =>
      !CUSTOMER_IMPORT_STANDARD_HEADERS.includes(
        header as (typeof CUSTOMER_IMPORT_STANDARD_HEADERS)[number]
      )
  );

  if (invalidHeader) {
    return badRequest(`Unsupported CSV header: '${invalidHeader}'`);
  }

  return null;
}

function normalizeImportedCustomerRow(
  row: ImportedCustomerCsvRow
): { input: CreateCustomerInput } | { error: CustomerImportError } {
  const addressValues = {
    line1: trimOptionalString(row.address_line1),
    line2: trimOptionalString(row.address_line2),
    city: trimOptionalString(row.address_city),
    state: trimOptionalString(row.address_state),
    postal_code: trimOptionalString(row.address_postal_code),
    country: trimOptionalString(row.address_country),
  };

  const hasAnyAddressField = Object.values(addressValues).some(
    (value) => value !== undefined
  );

  let address: Address | undefined;
  if (hasAnyAddressField) {
    address = {
      line1: addressValues.line1 ?? "",
    };
    if (addressValues.line2) address.line2 = addressValues.line2;
    if (addressValues.city) address.city = addressValues.city;
    if (addressValues.state) address.state = addressValues.state;
    if (addressValues.postal_code) {
      address.postal_code = addressValues.postal_code;
    }
    if (addressValues.country) address.country = addressValues.country;
  }

  const parsed = createCustomerSchema.safeParse({
    name: trimOptionalString(row.name),
    email: trimOptionalString(row.email),
    description: trimOptionalString(row.description),
    address,
    metadata: trimOptionalString(row.external_id)
      ? { external_id: trimOptionalString(row.external_id)! }
      : undefined,
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

export function parseCustomerImportCsv(
  text: string
): CustomerImportParsedCsv | CustomerImportOperationResult {
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

  const rows: ImportedCustomerCsvRow[] = [];
  const errors: CustomerImportError[] = [];

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
      name: rawRow.name ?? "",
      email: rawRow.email ?? "",
      description: rawRow.description ?? "",
      external_id: rawRow.external_id ?? "",
      address_line1: rawRow.address_line1 ?? "",
      address_line2: rawRow.address_line2 ?? "",
      address_city: rawRow.address_city ?? "",
      address_state: rawRow.address_state ?? "",
      address_postal_code: rawRow.address_postal_code ?? "",
      address_country: rawRow.address_country ?? "",
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

export async function importCustomers(
  csvText: string
): Promise<CustomerImportResult | CustomerImportOperationResult> {
  const parsed = parseCustomerImportCsv(csvText);
  if ("type" in parsed) {
    return parsed;
  }

  const errors = [...parsed.errors];
  const created = [];

  for (const row of parsed.rows) {
    const normalized = normalizeImportedCustomerRow(row);

    if ("error" in normalized) {
      errors.push(normalized.error);
      continue;
    }

    created.push(await createCustomer(normalized.input));
  }

  errors.sort((left, right) => left.row - right.row);

  return {
    object: "customer_import",
    total_rows: parsed.totalRows,
    created_count: created.length,
    failed_count: errors.length,
    created,
    errors,
  };
}
