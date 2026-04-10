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
- `renewal_mode: "automatic" | "manual_until_current"`
- `billing_anchor_start: number`
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
- `backdate_behavior=preserve_exact_cycle` keeps the first cycle exactly at the requested historical period instead of advancing to the current one.
- `billing_anchor_start` stores the immutable start boundary used to reconstruct historical cycle windows for renewal billing and late metered carryforward.
- `renewal_mode=manual_until_current` means the subscription is intentionally excluded from automatic renewal processing until manual catch-up advances it into a current cycle.
- A customer can have at most one active or `past_due` subscription for a given meter.
- `charge_automatically` subscriptions require one attached payment method at creation time.
- `send_invoice` subscriptions do not require a payment method.
- Licensed subscriptions can create an immediate draft proration invoice at creation time when the initial period is anchored or backdated and `proration_behavior=create_prorations`.
- A subscription can also have one active or pending subscription schedule that changes the effective renewal price over time without creating intermediate invoices.
- Reads never advance billing state; renewal processing is handled by the background billing processor.
- When a due subscription renews, the billing processor creates or refreshes a draft invoice and waits for manual legal issue.
- The billing processor applies any due schedule phase transition before building the renewal invoice.
- Metered renewals bill the usage recorded during the period that just ended while still advancing the subscription into the next billing period.
- Manual cycle close processes exactly one overdue cycle for one subscription and uses the same draft-building pipeline as the automatic processor.
- Global subscription listing and filtered bulk manual close do not change the subscription entity shape.
- Once a manual catch-up subscription is issued into a `current_period_end` in the future, it returns to `renewal_mode=automatic`.
- Subscriptions scheduled for period-end cancellation are finalized as canceled by the billing processor once the current period ends.
- `send_invoice` subscriptions become `past_due` when a sent renewal invoice passes its due date unpaid.
