# Subscription Entity

## Subscription

- `id: string`
- `object: "subscription"`
- `customer: string`
- `status: "active" | "past_due" | "canceled"`
- `collection_method: "charge_automatically" | "send_invoice"`
- `default_payment_method: string | null`
- `items: SubscriptionItem[]`
- `cancel_at_period_end: boolean`
- `canceled_at: number | null`
- `ended_at: number | null`
- `current_period_start: number`
- `current_period_end: number`
- `livemode: boolean`
- `created: number`
- `updated: number`

## SubscriptionItem

- `id: string`
- `object: "subscription_item"`
- `price: string`

## Rules

- Subscriptions belong to one customer and one organization.
- Subscription creation currently supports exactly one item, but persistence allows many items for future expansion.
- Each subscription item references a recurring price.
- By default, subscription creation sets `current_period_start` to the creation time and `current_period_end` one billing interval later.
- `billing_cycle_anchor` and `billing_cycle_anchor_config` keep `current_period_start` at creation time but move `current_period_end` to the aligned renewal boundary.
- `backdate_start_date` moves the subscription into the active billing period that contains the creation time, even if that period started in the past.
- A customer can have at most one active or `past_due` subscription for a given meter.
- `charge_automatically` subscriptions require one attached payment method at creation time.
- `send_invoice` subscriptions do not require a payment method.
- Licensed subscriptions can create an immediate proration invoice at creation time when the initial period is anchored or backdated and `proration_behavior=create_prorations`.
- A subscription can also have one active or pending subscription schedule that changes the effective renewal price over time without creating intermediate invoices.
- Reads never advance billing state; renewal processing is handled by the background billing processor.
- When a due subscription renews, the billing processor creates a draft invoice first, then finalizes and collects it in a later stage.
- The billing processor applies any due schedule phase transition before building the renewal invoice.
- Metered renewals bill the usage recorded during the period that just ended while still advancing the subscription into the next billing period.
- Subscriptions scheduled for period-end cancellation are finalized as canceled by the billing processor once the current period ends.
- `send_invoice` subscriptions become `past_due` when an open renewal invoice passes its due date unpaid.
