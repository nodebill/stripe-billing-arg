# Invoices API

> Authentication: all endpoints in this module require an authenticated user session or an authorized machine credential.

## `GET /api/invoices`

Returns a paginated Stripe-style list of invoices.

Query params:
- `customer` (optional)
- `status` (optional: `draft`, `invoiced`, `sent`)
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
- The response includes `payment_status`, `invoiced_at`, and `legal_document` when the invoice has already been legally issued.

## `POST /api/invoices/issue`

Legally issues one or more draft invoices in stable creation order.

Request body:
- `invoice_ids: string[]`

Rules:
- The batch is strictly sequential and stops at the first failure.
- Only `draft` invoices can be issued.
- AFIP data is resolved from the customer tax ID at issue time and persisted into `legal_document`.
- `charge_automatically` invoices become `payment_status=paid` when issued.
- `send_invoice` invoices become `payment_status=pending` and receive a due date when issued.

## `POST /api/invoices/issue/preview`

Builds the AFIP and PDF payload preview for one or more draft invoices without issuing them.

Request body:
- `invoice_ids: string[]`

Rules:
- Only `draft` invoices can be previewed.
- The preview resolves AFIP fiscal data using the same logic as the real issue flow.
- The preview does not request CAE and does not generate a PDF.
- The preview includes the AFIP request payload, the derived PDF payload, and warnings when values are still tentative.

## `POST /api/invoices/send`

Emails one or more already-issued invoices in stable creation order.

Request body:
- `invoice_ids: string[]`

Rules:
- The batch is strictly sequential and stops at the first failure.
- Only `invoiced` invoices can be sent.
- Delivery uses `customer.email` in this version.
- Sending reuses the stored PDF URL from `legal_document` and creates an `invoice_delivery` row.

## `POST /api/internal/billing/process`

Runs one background billing processor pass.

Rules:
- Requires `Authorization: Bearer <secret>`.
- Accepts either `BILLING_PROCESSOR_SECRET` or `CRON_SECRET`.
- Creates or refreshes draft renewal invoices and marks already-sent unpaid send-invoice renewals as `past_due`.

## `GET /api/internal/billing/process`

Returns the latest billing processor state and summary counts.

Rules:
- Requires `Authorization: Bearer <secret>`.
- Intended for internal monitoring only.
