# Meter Events API

> Authentication: all endpoints in this module require an authenticated user session or an authorized machine credential.

## `POST /api/billing/meter_events`

Creates a metered usage event for an existing active meter.

Request body:
- `event_name`
- `payload.stripe_customer_id`
- `payload.value`
- `timestamp?`
- `identifier?`

Rules:
- `event_name` must resolve to an existing active meter in the same organization.
- `payload.stripe_customer_id` must reference an existing customer in the same organization.
- The customer must have exactly one active or `past_due` subscription whose recurring price points at the resolved meter.
- `payload.value` must be a positive integer.
- `timestamp` defaults to the current Unix time when omitted.
- `timestamp` must be within the last 35 days and no more than 5 minutes in the future.
- If `identifier` is replayed, the endpoint returns the original event with status `200` instead of creating a duplicate.

