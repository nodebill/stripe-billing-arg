# Customers API

> Authentication: all endpoints in this module require an authenticated user session or an authorized machine credential.

## `GET /api/customers`

Returns a paginated Stripe-style list of customers.

Query params:
- `limit`
- `email`
- `starting_after`
- `ending_before`

## `GET /api/customers/search`

Returns a Stripe-style customer search result.

Query params:
- `query` (required)
- `limit`
- `page`

Supported query shape in this version:
- `metadata['external_id']:'value'`

## `POST /api/customers`

Creates a customer.

Request body:
- `name?`
- `email?`
- `description?`
- `metadata?`

## `POST /api/customers/import`

Creates many customers from one uploaded CSV file.

Request format:
- `multipart/form-data`
- `file`: UTF-8 CSV text

Required CSV headers:
- `name`
- `email`
- `description`
- `address_line1`
- `address_line2`
- `address_city`
- `address_state`
- `address_postal_code`
- `address_country`

Optional extra headers:
- `tax_id_type` and `tax_id_value` (optional pair)
- `payment_method_billing_name`
- `metadata.<key>`
- `external_id` (legacy alias for `metadata.external_id`)

Canonical example:

```csv
name,email,description,address_line1,address_line2,address_city,address_state,address_postal_code,address_country,tax_id_type,tax_id_value,payment_method_billing_name,metadata.external_id,metadata.segment
Jane Smith,jane@example.com,VIP account,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR,ar_cuit,30-12345678-9,Cuenta corriente,crm_123,enterprise
```

Rules:
- The CSV creates customers only; it never updates existing records.
- Blank rows are ignored.
- `email` is optional but must be valid when present.
- `tax_id_type` and `tax_id_value` are optional, but each row must provide both values together if either is present.
- If one tax ID header is present in the file, the other must also be present.
- `payment_method_billing_name` is optional. When present, the import creates and attaches one custom payment method for that customer.
- Any `metadata.<key>` column maps to one `metadata[key]` entry.
- `external_id` remains supported as a legacy alias for `metadata.external_id`.
- If both `external_id` and `metadata.external_id` are present, `metadata.external_id` wins.
- Address is optional.
- If any address field is present, `address_line1` becomes required for that row.
- Unknown headers other than `metadata.*`, the tax ID pair, `payment_method_billing_name`, duplicate headers, missing required headers, unreadable CSV, and empty files are rejected with `400`.
- Row validation failures return partial success instead of aborting the whole import.

Success response:
- `object: "customer_import"`
- `total_rows`
- `created_count`
- `failed_count`
- `created`
- `errors: Array<{ row, message }>`

## `GET /api/customers/:id`

Returns a single customer.

## `POST /api/customers/:id`

Updates mutable customer fields.

Request body:
- `name?`
- `email?`
- `description?`
- `metadata?`

## `DELETE /api/customers/:id`

Deletes a customer.

If the customer has attached payment methods, they are detached automatically before the customer is removed.

If the customer has any active subscriptions, deletion is blocked until those subscriptions are canceled.

## `GET /api/customers/:id/payment_methods`

Returns a paginated Stripe-style list of payment methods currently attached to the customer.

Query params:
- `limit`
- `starting_after`
- `ending_before`
