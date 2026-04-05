# Meters API

## `GET /api/billing/meters`

Returns a paginated Stripe-style list of meters.

Query params:
- `limit`
- `status`
- `starting_after`
- `ending_before`

## `POST /api/billing/meters`

Creates a meter.

Request body:
- `display_name`
- `event_name`
- `default_aggregation.formula`

This endpoint also backs the admin UI meter creation dialog and the inline
shortcut shown while creating metered prices.

## `GET /api/billing/meters/:id`

Returns a single meter.

## `POST /api/billing/meters/:id`

Updates the meter display name.

Request body:
- `display_name`

## `POST /api/billing/meters/:id/deactivate`

Marks a meter as inactive.

## `GET /api/billing/meters/:id/event_summaries`

Returns aggregated usage summaries for one customer on one meter.

Query params:
- `customer` (required)
- `start_time` (required)
- `end_time` (required)
- `value_grouping_window`

Supported `value_grouping_window` values:
- `hour`
- `day`

Rules:
- The path `:id` must reference a meter in the same organization.
- `customer` must reference a customer in the same organization.
- `start_time` and `end_time` are Unix timestamps and `end_time` must be greater than `start_time`.
- Grouped responses are returned as a Stripe-style list with `has_more=false` in this version.
