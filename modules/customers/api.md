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
- `external_id`
- `address_line1`
- `address_line2`
- `address_city`
- `address_state`
- `address_postal_code`
- `address_country`

Canonical example:

```csv
name,email,description,external_id,address_line1,address_line2,address_city,address_state,address_postal_code,address_country
Jane Smith,jane@example.com,VIP account,crm_123,Av. Corrientes 1234,,Buenos Aires,CABA,C1043,AR
```

Rules:
- The CSV creates customers only; it never updates existing records.
- Blank rows are ignored.
- `email` is optional but must be valid when present.
- `external_id` maps to `metadata.external_id`.
- Address is optional.
- If any address field is present, `address_line1` becomes required for that row.
- Unknown headers, duplicate headers, missing required headers, unreadable CSV, and empty files are rejected with `400`.
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
