# Invoices API

> Authentication: all endpoints in this module require an authenticated user session or an authorized machine credential.

## `GET /api/invoices`

Returns a paginated Stripe-style list of invoices.

Query params:
- `customer` (optional)
- `limit`
- `starting_after`
- `ending_before`

Notes:
- When `customer` is omitted, the endpoint returns a global invoice list across customers.
- `limit` supports values up to `200`.

## `GET /api/invoices/:id`

Returns a single invoice.

Rules:
- Renewal invoices may contain multiple stored line items when pricing changed mid-cycle through a subscription schedule.
- The invoice detail response includes `line_items`.
- Each line item includes `billing_reason` so operators can distinguish standard renewal charges from late metered carryforward.

## `POST /api/internal/billing/process`

Runs one background billing processor pass.

Rules:
- Requires `Authorization: Bearer <secret>`.
- Accepts either `BILLING_PROCESSOR_SECRET` or `CRON_SECRET`.
- Creates draft renewal invoices, finalizes eligible drafts, collects open invoices, and marks overdue send-invoice renewals as `past_due`.

## `GET /api/internal/billing/process`

Returns the latest billing processor state and summary counts.

Rules:
- Requires `Authorization: Bearer <secret>`.
- Intended for internal monitoring only.
