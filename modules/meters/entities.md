# Meter Entity

## Meter

- `id: string`
- `object: "billing.meter"`
- `display_name: string`
- `event_name: string`
- `default_aggregation: { formula: "sum" | "count" }`
- `status: "active" | "inactive"`
- `livemode: boolean`
- `created: number`
- `updated: number`

## Rules

- Meters belong to one organization.
- `event_name` must be unique within an organization.
- Only `display_name` is mutable after creation.
- Inactive meters cannot accept new meter events.
- Deactivating a meter does not modify existing prices, subscriptions, or historical usage events.
