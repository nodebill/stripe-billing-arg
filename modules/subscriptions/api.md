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

## `POST /api/subscriptions/import`

Creates many subscriptions from one uploaded CSV file.

Request format:
- `multipart/form-data`
- `file`: UTF-8 CSV text

Required CSV headers:
- `customer`
- `price`
- `collection_method`
- `default_payment_method`
- `billing_cycle_mode`
- `billing_day_of_month`
- `billing_month`
- `backdate_start_date`
- `proration_behavior`

Canonical example:

```csv
customer,price,collection_method,default_payment_method,billing_cycle_mode,billing_day_of_month,billing_month,backdate_start_date,proration_behavior
cus_123,price_123,charge_automatically,pm_123,start_today,,,,
cus_456,price_456,send_invoice,,align_renewal,15,,,
cus_789,price_789,charge_automatically,pm_789,backdate_start,,,2026-04-01,none
```

Rules:
- The CSV is multi-customer and each row must reference an existing `cus_...` customer ID.
- `customer` and `price` are always required.
- `collection_method` accepts blank, `charge_automatically`, or `send_invoice`. Blank defaults to `charge_automatically`.
- `default_payment_method` is required only when `collection_method=charge_automatically`.
- `billing_cycle_mode` accepts blank, `start_today`, `align_renewal`, or `backdate_start`. Blank defaults to `start_today`.
- `billing_day_of_month` is required only when `billing_cycle_mode=align_renewal`.
- `billing_month` is optional and only applies to yearly prices when `billing_cycle_mode=align_renewal`.
- `backdate_start_date` is required only when `billing_cycle_mode=backdate_start` and must use `YYYY-MM-DD`.
- `proration_behavior` accepts blank, `create_prorations`, or `none`. Blank defaults to `create_prorations`.
- Existing subscription rules still apply for customer existence, active recurring prices, payment methods, metered conflicts, and proration restrictions.
- Unknown headers, duplicate headers, missing required headers, unreadable CSV, and empty files are rejected with `400`.
- Row validation failures return partial success instead of aborting the whole import.

Success response:
- `object: "subscription_import"`
- `total_rows`
- `created_count`
- `failed_count`
- `created`
- `errors: Array<{ row, message }>`

## `GET /api/subscriptions/:id`

Returns a single subscription.

## `POST /api/subscriptions/:id`

Updates cancellation behavior for an active subscription.

Request body:
- `cancel_at_period_end`

## `DELETE /api/subscriptions/:id`

Cancels a subscription immediately.
