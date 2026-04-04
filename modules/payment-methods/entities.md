# Payment Method Entity

## PaymentMethod

- `id: string`
- `object: "payment_method"`
- `type: "custom"`
- `custom: { type: string }`
- `customer: string | null`
- `billing_details: { name: string | null }`
- `livemode: boolean`
- `created: number`
- `updated: number`

## Rules

- Payment methods belong to one organization.
- Only `type="custom"` is supported.
- `custom.type` is assigned internally by the platform.
- A payment method starts unattached, may be attached to exactly one customer, and may then be detached exactly once.
- Detached payment methods remain stored for history and cannot be re-attached.
- Only attached payment methods can be updated.
- Detaching a payment method immediately cancels any active subscriptions that use it as their default payment method.
