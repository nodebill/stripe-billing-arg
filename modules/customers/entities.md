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

## Tax ID

- `id: string`
- `object: "tax_id"`
- `type: string`
- `value: string`
- `customer: string`
- `created: number`

## Attached Payment Method

- `id: string`
- `object: "payment_method"`
- `type: "custom"`
- `billing_details.name: string | null`
- `customer: string`

## Rules

- Customers belong to one organization.
- Customers can have many attached payment methods.
- Customer import can optionally create one attached custom payment method when `payment_method_billing_name` is provided.
- Customers can have many subscriptions.
- Customers can have many invoices.
- Customers can have at most one tax ID.
- `metadata.external_id` is a supported exact-match lookup key for customer search.
- Deleting a customer automatically detaches any attached payment methods before the customer is removed.
- Customers with active or past-due subscriptions cannot be deleted.
