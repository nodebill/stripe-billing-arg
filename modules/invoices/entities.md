# Invoice Entity

## Invoice

- `id: string`
- `object: "invoice"`
- `customer: string`
- `subscription: string`
- `status: "draft" | "invoiced" | "sent"`
- `payment_status: "pending" | "paid" | "past_due"`
- `collection_method: "charge_automatically" | "send_invoice"`
- `currency: string`
- `subtotal: number`
- `amount_due: number`
- `amount_paid: number`
- `due_date: number | null`
- `period_start: number`
- `period_end: number`
- `auto_advance: boolean`
- `invoiced_at: number | null`
- `paid_at: number | null`
- `legal_document: InvoiceLegalDocument | null`
- `latest_delivery: InvoiceDelivery | null`
- `created: number`
- `updated: number`

## InvoiceLineItem

- `id: string`
- `object: "invoice_line_item"`
- `invoice: string`
- `description: string | null`
- `quantity: number`
- `unit_amount: number | null`
- `currency: string`
- `amount: number`
- `period_start: number`
- `period_end: number`
- `billing_reason: "licensed_recurring" | "metered_recurring" | "metered_carryforward"`
- `created: number`
- `updated: number`

## InvoiceDelivery

- `id: string`
- `object: "invoice_delivery"`
- `channel: "mock_email" | "email"`
- `status: "pending" | "sent"`
- `recipient: string | null`
- `sent_at: number | null`
- `payload: Record<string, string | null>`

## Rules

- Invoices belong to one customer, one subscription, and one organization.
- Subscription creation can also create an immediate draft invoice when `proration_behavior=create_prorations` is used with an anchored or backdated licensed subscription.
- The billing processor creates or refreshes renewal invoices in `draft`.
- Draft invoices remain mutable until they are legally issued.
- Legal issue freezes the fiscal snapshot into `legal_document`.
- `charge_automatically` invoices become `payment_status=paid` when they are issued.
- `send_invoice` invoices become `status=sent` only after the operator emails them and become `payment_status=past_due` if their due date passes unpaid.
- A subscription billing period can produce at most one invoice.
- Renewal invoices can contain multiple stored line items when a subscription schedule changed the effective price during the billed period.
- Licensed renewal line items can be prorated by segment duration instead of billing the entire cycle at one flat amount.
- Metered renewal invoices use the next subscription period for the invoice header but use the just-finished period on the line item that represents recorded usage.
- Metered renewal invoices split usage by schedule segment boundaries when the effective metered price changes during the period.
- Metered renewal line items multiply integer usage by the price's `unit_amount_decimal` and round once to the nearest minor unit using half-up semantics.
- Late-reported metered usage for a period that already has an invoice is carried onto a later invoice as a separate `metered_carryforward` line item.
- Carryforward line items keep the original service period and original effective price even though they appear on a later invoice.
- Zero-usage metered renewals still create invoices and line items with amount `0`.
- Global invoice listing does not change the invoice entity shape.
