# Invoice Entity

## Invoice

- `id: string`
- `object: "invoice"`
- `customer: string`
- `subscription: string`
- `status: "draft" | "open" | "paid" | "past_due"`
- `collection_method: "charge_automatically" | "send_invoice"`
- `currency: string`
- `subtotal: number`
- `amount_due: number`
- `amount_paid: number`
- `due_date: number | null`
- `period_start: number`
- `period_end: number`
- `auto_advance: boolean`
- `finalized_at: number | null`
- `paid_at: number | null`
- `latest_delivery: InvoiceDelivery | null`
- `created: number`
- `updated: number`

## InvoiceDelivery

- `id: string`
- `object: "invoice_delivery"`
- `channel: "mock_email"`
- `status: "pending" | "sent"`
- `recipient: string | null`
- `sent_at: number | null`
- `payload: Record<string, string | null>`

## Rules

- Invoices belong to one customer, one subscription, and one organization.
- The billing processor creates renewal invoices in `draft` first.
- Draft invoices are finalized in a separate processor stage so a future grace period can delay finalization without changing the schema.
- `charge_automatically` invoices are marked `paid` during collection in this version.
- `send_invoice` invoices stay `open` after mocked delivery and become `past_due` if their due date passes unpaid.
- A subscription billing period can produce at most one invoice.
- Metered renewal invoices use the next subscription period for the invoice header but use the just-finished period on the line item that represents recorded usage.
- Zero-usage metered renewals still create invoices and line items with amount `0`.
