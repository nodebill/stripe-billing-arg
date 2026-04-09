# Prices API

> Authentication: all endpoints in this module require an authenticated user session or an authorized machine credential.

## `GET /api/prices`

Returns a paginated Stripe-style list of prices for a product.

Query params:
- `product` (required)
- `limit` (defaults to `100`, max `100`)
- `active`
- `type`
- `starting_after`
- `ending_before`

## `POST /api/prices`

Creates a price for a product.

Common request body:
- `product`
- `currency`
- exactly one of `unit_amount` or `unit_amount_decimal`
- `type`
- `nickname?`
- `metadata?`
- `active?`

One-time price:
- `type: "one_time"`

Recurring price:
- `type: "recurring"`
- `recurring.interval: "month" | "year"`
- `recurring.interval_count: 1`
- `recurring.usage_type?: "licensed" | "metered"`
- `meter?`

Rules:
- `unit_amount` must be a positive integer in minor units.
- `unit_amount_decimal` must be a positive decimal string with up to 12 fractional digits.
- Requests that send both amount fields or neither amount field are rejected.
- `recurring.usage_type` defaults to `licensed`.
- `meter` is required when `recurring.usage_type=metered`.
- `meter` is rejected for one-time prices and licensed recurring prices.
- Responses always include `unit_amount_decimal`; `unit_amount` is `null` when the amount can't be represented as an integer.

## `GET /api/prices/:id`

Returns a single price.

## `POST /api/products/:id/prices/import`

Creates many prices for one product from an uploaded CSV file.

Request format:
- `multipart/form-data`
- `file`: UTF-8 CSV text

Required CSV headers:
- `currency`
- `type`
- `unit_amount`
- `unit_amount_decimal`
- `nickname`
- `active`
- `interval`
- `usage_type`
- `meter`

Additional headers:
- `metadata.*` columns are allowed and expand into the created price metadata object.

Canonical example:

```csv
currency,type,unit_amount,unit_amount_decimal,nickname,active,interval,usage_type,meter,metadata.region,metadata.plan_code
ars,one_time,1000,,Setup fee,true,,,,ar,setup
ars,recurring,2500,,Base mensual,true,month,licensed,,ar,base
ars,recurring,,0.01,Volumen,true,month,metered,meter_123,ar,volume
```

Rules:
- The CSV is scoped to the `:id` product, so there is no `product` column.
- Exactly one of `unit_amount` or `unit_amount_decimal` must be populated per row.
- `type` must be `one_time` or `recurring`.
- `interval` is required only for recurring rows and is limited to `month` or `year`.
- `usage_type` applies only to recurring rows and defaults to `licensed` when blank.
- `meter` is required only when `usage_type=metered` and must reference an active meter.
- `active` accepts blank or `true` as active, and `false` as inactive.
- Fully blank data rows are ignored.
- Unknown headers, duplicate headers, missing required headers, unreadable CSV, and empty files are rejected for the whole upload with `400`.
- Row validation failures produce partial success instead of aborting the whole import.

Success response:
- `object: "price_import"`
- `product`
- `total_rows`
- `created_count`
- `failed_count`
- `created`
- `errors: Array<{ row, message }>`

## `POST /api/prices/:id`

Updates mutable price fields.

Request body:
- `active?`
- `nickname?`
- `metadata?`

Amount, currency, product, type, and recurring interval are immutable after creation.
