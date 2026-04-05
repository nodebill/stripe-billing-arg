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
- `recurring: { interval: "month" | "year"; interval_count: 1; usage_type: "licensed" | "metered" } | null`
- `meter: string | null`
- `created: number`
- `updated: number`

## Rules

- Prices belong to one product and one organization.
- Prices are created as flat per-unit amounts only.
- Recurring prices are limited to monthly and yearly intervals.
- `interval_count` is fixed to `1`.
- Metered recurring prices reference one active meter at creation time.
- Licensed recurring prices always return `usage_type="licensed"` and `meter=null`.
- Prices are archived by setting `active=false`.
- Amount, currency, product, type, and recurring shape cannot be changed after creation.
