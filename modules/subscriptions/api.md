# Subscriptions API

## `GET /api/subscriptions`

Returns a paginated Stripe-style list of subscriptions for a customer.

Query params:
- `customer` (required)
- `status`
- `limit`
- `starting_after`
- `ending_before`

## `POST /api/subscriptions`

Creates a subscription.

Request body:
- `customer`
- `default_payment_method`
- `items`

Rules:
- `items` must contain exactly one item in this version.
- Each item supports only `price`.
- The selected price must be an active recurring price.
- The payment method must already be attached to the same customer.

## `GET /api/subscriptions/:id`

Returns a single subscription.

## `POST /api/subscriptions/:id`

Updates cancellation behavior for an active subscription.

Request body:
- `cancel_at_period_end`

## `DELETE /api/subscriptions/:id`

Cancels a subscription immediately.
