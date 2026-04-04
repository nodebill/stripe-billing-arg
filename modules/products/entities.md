# Product Entity

## Product

- `id: string`
- `object: "product"`
- `name: string`
- `active: boolean`
- `default_price: string | null`
- `description: string | null`
- `metadata: Record<string, string>`
- `livemode: boolean`
- `created: number`
- `updated: number`

## Rules

- A product can own many prices.
- `default_price` is nullable.
- `default_price` must point to an active price owned by the same product.
- A product with prices cannot be deleted.
