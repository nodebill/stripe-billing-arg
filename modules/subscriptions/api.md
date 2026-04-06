# Subscriptions API

> Authentication: all endpoints in this module require an authenticated user session or an authorized machine credential.

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
- `billing_cycle_anchor?`
- `billing_cycle_anchor_config?`
- `backdate_start_date?`
- `proration_behavior?`
- `items`

Rules:
- `items` must contain exactly one item in this version.
- Each item supports only `price`.
- The selected price must be an active recurring price.
- If the selected price is metered, the customer cannot already have another active or `past_due` subscription using the same meter.
- `collection_method` defaults to `charge_automatically`.
- `default_payment_method` is required only when `collection_method=charge_automatically`.
- When present, the payment method must already be attached to the same customer.
- `proration_behavior` defaults to `create_prorations`.
- `billing_cycle_anchor` and `billing_cycle_anchor_config` are mutually exclusive.
- `backdate_start_date` cannot be combined with `billing_cycle_anchor` or `billing_cycle_anchor_config` in this version.
- `billing_cycle_anchor` must be a future timestamp.
- `backdate_start_date` must be a past timestamp.
- `billing_cycle_anchor_config` supports `day_of_month` and optional UTC `hour`, `minute`, and `second`; yearly prices may also provide `month`.
- `proration_behavior=create_prorations` creates an immediate invoice only when the subscription is anchored or backdated.
- Metered prices only support `proration_behavior=none` when an initial proration would otherwise be required.

## `GET /api/subscriptions/:id`

Returns a single subscription.

## `POST /api/subscriptions/:id`

Updates cancellation behavior for an active subscription.

Request body:
- `cancel_at_period_end`

## `DELETE /api/subscriptions/:id`

Cancels a subscription immediately.
