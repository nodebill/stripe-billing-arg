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
- `invoice_line_item_id: string | null`

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
- A meter event remains unbilled until renewal processing assigns it to an invoice line item.
- `invoice_line_item_id` prevents duplicate billing and allows late-reported usage to be carried forward safely after the original cycle was already invoiced.
- Meter event subscription matching is resolved from the customer, meter, and event timestamp; subscription schedule phases can make a subscription eligible for a meter even when its current price is licensed.
- If more than one active or `past_due` subscription is eligible for the same customer, meter, and timestamp, event creation fails instead of assigning usage ambiguously.
