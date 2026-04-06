# Invoices API

> Authentication: all endpoints in this module require an authenticated user session or an authorized machine credential.

## `GET /api/invoices`

Returns a paginated Stripe-style list of invoices for a customer.

Query params:
- `customer` (required)
- `limit`
- `starting_after`
- `ending_before`

## `GET /api/invoices/:id`

Returns a single invoice.

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
