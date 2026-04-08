export const PRICE_IMPORT_STANDARD_HEADERS = [
  "currency",
  "type",
  "unit_amount",
  "unit_amount_decimal",
  "nickname",
  "active",
  "interval",
  "usage_type",
  "meter",
] as const;

export const PRICE_IMPORT_METADATA_PREFIX = "metadata.";

export const PRICE_IMPORT_EXAMPLE_CSV = [
  [
    ...PRICE_IMPORT_STANDARD_HEADERS,
    "metadata.region",
    "metadata.plan_code",
  ].join(","),
  "ars,one_time,1000,,Setup fee,true,,,,ar,setup",
  "ars,recurring,2500,,Base mensual,true,month,licensed,,ar,base",
  "ars,recurring,,0.01,Volumen,true,month,metered,meter_123,ar,volume",
].join("\n");
