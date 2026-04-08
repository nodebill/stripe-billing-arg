export const CUSTOMER_IMPORT_STANDARD_HEADERS = [
  "name",
  "email",
  "description",
  "external_id",
  "address_line1",
  "address_line2",
  "address_city",
  "address_state",
  "address_postal_code",
  "address_country",
] as const;

export const CUSTOMER_IMPORT_EXAMPLE_CSV = [
  CUSTOMER_IMPORT_STANDARD_HEADERS.join(","),
  "Jane Smith,jane@example.com,VIP account,crm_123,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR",
].join("\n");
