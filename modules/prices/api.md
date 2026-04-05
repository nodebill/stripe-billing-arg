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
- `unit_amount`
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
- `recurring.usage_type` defaults to `licensed`.
- `meter` is required when `recurring.usage_type=metered`.
- `meter` is rejected for one-time prices and licensed recurring prices.

## `GET /api/prices/:id`

Returns a single price.

## `POST /api/prices/:id`

Updates mutable price fields.

Request body:
- `active?`
- `nickname?`
- `metadata?`

Amount, currency, product, type, and recurring interval are immutable after creation.
