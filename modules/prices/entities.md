# Price Entity

## Price

- `id: string`
- `object: "price"`
- `active: boolean`
- `billing_scheme: "per_unit"`
- `currency: string`
- `livemode: boolean`
- `metadata: Record<string, string>`
- `nickname: string | null`
- `product: string`
- `type: "one_time" | "recurring"`
- `unit_amount: number`
- `recurring: { interval: "month" | "year"; interval_count: 1 } | null`
- `created: number`
- `updated: number`

## Rules

- Prices belong to one product and one organization.
- Prices are created as flat per-unit amounts only.
- Recurring prices are limited to monthly and yearly intervals.
- `interval_count` is fixed to `1`.
- Prices are archived by setting `active=false`.
- Amount, currency, product, type, and recurring shape cannot be changed after creation.
