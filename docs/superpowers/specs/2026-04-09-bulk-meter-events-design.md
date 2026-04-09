# Bulk Meter Events

## Context

When loading retroactive meter events for `count`-type meters, each event must be a separate DB row because the aggregation formula counts rows (`rows.length`), ignoring the `value` field. Currently the only way to load 100 historical events is 100 individual API calls. This adds a `count` parameter to the existing endpoint so a single request can create N events.

## Design

### API Change

**`POST /api/billing/meter_events`** — add optional `count` field at the root level.

```json
{
  "event_name": "api_requests",
  "count": 100,
  "payload": {
    "stripe_customer_id": "cus_abc123",
    "value": 1
  },
  "timestamp": 1712678400
}
```

- `count`: optional positive integer, defaults to 1. When > 1, creates N identical events.
- All N events share the same `event_name`, `payload`, and `timestamp`.
- Each event gets a unique auto-generated `identifier` (via `nanoid()`).
- The user-provided `identifier` field is ignored / disallowed when `count > 1` (it would conflict with idempotency since all events need unique identifiers).
- Response: the first created event (status 201), same shape as today.

### Validation

- `count` validated in Zod schema: `z.coerce.number().int().positive().optional()`, default 1.
- Add a `.refine()`: if `count > 1`, `identifier` must not be provided.
- All existing validations (meter exists & active, customer exists, timestamp in range) run once before inserting.

### Service Layer

Add a `createMeterEventBulk()` function in `modules/meter-events/service.ts`:
- Accepts the same input as `createMeterEvent` plus `count`.
- Validates meter, customer, and timestamp once.
- Generates N events with unique identifiers and inserts them in a single DB transaction using a batch insert.
- Returns `{ created: true, event: <first event> }`.

The existing `createMeterEvent()` remains unchanged for the `count === 1` case.

### Route Handler

- When `count` is 1 (or omitted), call `createMeterEvent()` as today.
- When `count > 1`, call `createMeterEventBulk()`.

## Files to Modify

- `modules/meter-events/validation.ts` — add `count` field and refinement
- `modules/meter-events/service.ts` — add `createMeterEventBulk()`
- `modules/meter-events/types.ts` — update `CreateMeterEventInput` if needed
- `app/api/billing/meter_events/route.ts` — branch on count

## Verification

- Send a request with `count: 5` and verify 5 rows are created in the DB
- Confirm response is a single event object with status 201
- Verify that sending `count > 1` with an `identifier` returns a 400
- Verify that `count: 1` (or omitted) works exactly as before
