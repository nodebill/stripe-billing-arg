# Meter Event Entities

## MeterEvent

- `id: string`
- `object: "billing.meter_event"`
- `created: number`
- `event_name: string`
- `identifier: string`
- `livemode: boolean`
- `payload: { stripe_customer_id: string; value: string }`
- `timestamp: number`

## MeterEventSummary

- `id: string`
- `object: "billing.meter_event_summary"`
- `aggregated_value: number`
- `start_time: number`
- `end_time: number`
- `meter: string`
- `livemode: boolean`

## Rules

- Meter events are stored as raw rows and aggregated on demand.
- Aggregation uses the meter's `default_aggregation.formula`.
- `count` meters ignore the submitted numeric value during aggregation and count rows instead.
- Summary queries use half-open windows: `[start_time, end_time)`.
- Ungrouped summary requests always return one total summary row for the requested window, including zero usage.
- Grouped summary requests return only buckets that contain recorded usage.
