export const CUSTOMER_IMPORT_STANDARD_HEADERS = [
  "name",
  "email",
  "description",
  "address_line1",
  "address_line2",
  "address_city",
  "address_state",
  "address_postal_code",
  "address_country",
] as const;

export const CUSTOMER_IMPORT_TAX_ID_HEADERS = [
  "tax_id_type",
  "tax_id_value",
] as const;

export const CUSTOMER_IMPORT_PAYMENT_METHOD_HEADERS = [
  "payment_method_billing_name",
] as const;

export const CUSTOMER_IMPORT_METADATA_PREFIX = "metadata.";

export const CUSTOMER_IMPORT_LEGACY_METADATA_HEADERS = ["external_id"] as const;

export const CUSTOMER_IMPORT_EXAMPLE_CSV = [
  [
    ...CUSTOMER_IMPORT_STANDARD_HEADERS,
    ...CUSTOMER_IMPORT_TAX_ID_HEADERS,
    ...CUSTOMER_IMPORT_PAYMENT_METHOD_HEADERS,
    "metadata.external_id",
    "metadata.segment",
  ].join(","),
  "Jane Smith,jane@example.com,VIP account,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR,ar_cuit,30-12345678-9,Cuenta corriente,crm_123,enterprise",
].join("\n");
