# Subscriptions API

## `GET /api/subscriptions`

Returns a paginated Stripe-style list of subscriptions for a customer.

Query params:
- `customer` (required)
- `status`
- `limit`
- `starting_after`
- `ending_before`

Supported `status` values:
- `active`
- `past_due`
- `canceled`

## `POST /api/subscriptions`

Creates a subscription.

Request body:
- `customer`
- `collection_method?`
- `default_payment_method?`
- `items`

Rules:
- `items` must contain exactly one item in this version.
- Each item supports only `price`.
- The selected price must be an active recurring price.
- If the selected price is metered, the customer cannot already have another active or `past_due` subscription using the same meter.
- `collection_method` defaults to `charge_automatically`.
- `default_payment_method` is required only when `collection_method=charge_automatically`.
- When present, the payment method must already be attached to the same customer.

## `GET /api/subscriptions/:id`

Returns a single subscription.

## `POST /api/subscriptions/:id`

Updates cancellation behavior for an active subscription.

Request body:
- `cancel_at_period_end`

## `DELETE /api/subscriptions/:id`

Cancels a subscription immediately.
