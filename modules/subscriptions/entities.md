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
- `charge_automatically` subscriptions require one attached payment method at creation time.
- `send_invoice` subscriptions do not require a payment method.
- Reads never advance billing state; renewal processing is handled by the background billing processor.
- When a due subscription renews, the billing processor creates a draft invoice first, then finalizes and collects it in a later stage.
- Subscriptions scheduled for period-end cancellation are finalized as canceled by the billing processor once the current period ends.
- `send_invoice` subscriptions become `past_due` when an open renewal invoice passes its due date unpaid.
