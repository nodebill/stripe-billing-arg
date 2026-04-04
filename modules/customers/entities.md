# Customer Entity

## Customer

- `id: string`
- `object: "customer"`
- `name: string | null`
- `email: string | null`
- `description: string | null`
- `metadata: Record<string, string>`
- `livemode: boolean`
- `created: number`
- `updated: number`

## Rules

- Customers belong to one organization.
- Customers can have many attached payment methods.
- Deleting a customer automatically detaches any attached payment methods before the customer is removed.
