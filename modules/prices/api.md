# Prices API

## `GET /api/prices`

Returns a paginated Stripe-style list of prices for a product.

Query params:
- `product` (required)
- `limit`
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

## `POST /api/prices/:id`

Updates mutable price fields.

Request body:
- `active?`
- `nickname?`
- `metadata?`

Amount, currency, product, type, and recurring interval are immutable after creation.
