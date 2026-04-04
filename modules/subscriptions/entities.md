# Subscription Entity

## Subscription

- `id: string`
- `object: "subscription"`
- `customer: string`
- `status: "active" | "canceled"`
- `default_payment_method: string`
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
- An attached payment method is required to create a subscription.
- Active subscriptions roll their billing period forward lazily when read after the prior period ends.
- Subscriptions scheduled for period-end cancellation are lazily finalized as canceled once the current period ends.
