# User Flows

## Authentication

1. After a full reset, the operator can run `pnpm bootstrap:seed` with admin credentials to recreate the first admin plus the base meter and product before opening the UI.
2. If the operator only reset billing data, the same CLI bootstrap skips auth creation and only restores the base catalog objects.
3. Anonymous users are redirected to `/sign-in` before any protected console page loads.
4. On the first deployment, `/bootstrap` remains public until the first admin is created.
5. Team members sign in from `/sign-in` and land on `/products`.
6. Invited teammates open `/accept-invite?token=...`, set their name and password, and are signed in immediately after acceptance.
7. Admins open `/team` to invite or manage members and `/api-keys` to create or revoke machine credentials.
8. Protected navigation exposes `/billing/subscriptions`, `/billing/invoices`, and `/billing/meters` as global billing views.

## Products index

1. The user opens `/products`.
2. The page lists products and exposes create, edit, delete, and navigation into a specific product.
3. Clicking a product name opens `/products/[id]`.

## Product detail and prices

1. The user opens `/products/[id]`.
2. The page loads the product and its price list from `/api/products/:id` and `/api/prices?product=:id`.
3. The user can create a new price from the page header or empty state.
4. The create dialog allows either a one-time price or a recurring price.
5. For recurring prices, the interval options are limited to monthly and yearly, the operator can choose licensed or metered usage, and metered recurring prices require selecting one active meter.
6. If the operator is creating a metered price and no active meter exists yet, the dialog offers an inline shortcut to create one without leaving `/products/[id]`.
7. Metered recurring prices can use `unit_amount_decimal` for Stripe-style decimal billing, for example `0.01` to bill 1% of a meter that reports processed cents.
8. The page also offers a bulk import dialog that explains the required CSV columns, shows an example file, lists active meter IDs, and uploads a CSV to `POST /api/products/:id/prices/import`.
9. A bulk import refreshes the price list after processing. Successful rows create prices immediately, while row-level failures remain visible in the dialog with their CSV line numbers so the operator can fix and retry.
10. The table shows the default price, archived state, and billing type.
11. The user can edit mutable fields on a price or set an active price as default.

## Billing meters

1. The user opens `/billing/meters`.
2. The page loads the meter list from `/api/billing/meters`.
3. The user can create a new meter from the page header or empty state with `display_name`, `event_name`, and aggregation formula.
4. After creation, the list updates in place and keeps the user on `/billing/meters`.
5. The user can review each meter's event name, aggregation formula, status, and creation date.
6. Clicking a meter opens `/billing/meters/[id]`.
7. The detail page loads the meter, a customer list, and usage summaries from `/api/billing/meters/:id` and `/api/billing/meters/:id/event_summaries`.
8. The user can switch customers and a UTC date range to inspect daily aggregated usage buckets.
9. Usage events are recorded through `POST /api/billing/meter_events`; there is no admin UI for creating them in this version.

## Global billing subscriptions

1. The user opens `/billing/subscriptions`.
2. The page loads up to 200 active subscriptions from `GET /api/subscriptions?status=active&limit=200`.
3. The user can narrow the list with exact `customer_id` and `subscription_id` filters and re-run the query without leaving the page.
4. The page resolves each subscription row back to its customer link and price label when those records are available.
5. The `Refresh` action stays disabled until at least one exact filter is applied.
6. After confirmation, the UI posts the active filter set to `POST /api/subscriptions/close_cycles`.
7. The backend processes exactly one overdue cycle per matching active subscription, returns per-row outcomes, and the page reloads the filtered list.
8. If more than 200 matching subscriptions exist, the user can load more results from the same screen.

## Global billing invoices

1. The user opens `/billing/invoices`.
2. The page loads up to 200 invoices from `GET /api/invoices?limit=200`.
3. The user can filter the queue by workflow state: `draft`, `invoiced`, or `sent`.
4. The table shows invoice ID, customer link, subscription ID, workflow state, payment state, collection method, amount, timing, and delivery state.
5. The `Refresh drafts` action runs `POST /api/internal/billing/process` and reloads the list.
6. The user can select one or more `draft` invoices and preview the AFIP and PDF payloads with `POST /api/invoices/issue/preview`.
7. The user can select one or more `draft` invoices and issue them with `POST /api/invoices/issue`.
8. The user can select one or more `invoiced` invoices and send them with `POST /api/invoices/send`.
9. The user can open the shared invoice detail dialog from the global list without leaving `/billing/invoices`.
10. If more than 200 invoices exist, the user can load more results from the same screen.

## Customers index

1. The user opens `/customers`.
2. The page lists customers and exposes create, edit, delete, customer CSV import, subscription CSV import, search, and navigation into a specific customer.
3. The customer import dialog explains the required CSV columns for customer creation, including the optional `tax_id_type` and `tax_id_value` pair plus the optional `payment_method_billing_name`, shows an example file, and uploads to `POST /api/customers/import`.
4. The subscription import dialog explains the required CSV columns for multi-customer subscription creation, shows an example file, and uploads to `POST /api/subscriptions/import`.
5. Both import dialogs refresh the page after processing. Successful rows create records immediately, while row-level failures remain visible in the dialog with their CSV line numbers so the operator can fix and retry.
6. The search box filters loaded customers by name, email, or ID and also performs an exact remote search by `metadata.external_id`.
7. Clicking a customer name opens `/customers/[id]`.

## Customer detail and billing

1. The user opens `/customers/[id]`.
2. The page loads the customer, its attached payment methods, its subscriptions, its invoices, and the recurring prices available for subscription creation.
3. The user can create a custom payment method by entering an optional billing name.
4. The frontend first creates the payment method via `/api/payment_methods`, then immediately attaches it with `/api/payment_methods/:id/attach`.
5. The table shows each attached payment method's type, billing name, and creation date.
6. The user can update the billing name of an attached payment method with `/api/payment_methods/:id`.
7. The user can create a subscription with `/api/subscriptions` by choosing one active recurring price, a collection method, and a billing cycle mode.
8. The billing cycle mode can keep the default start date, align renewals with `billing_cycle_anchor_config`, backdate the start date into the current cycle, or preserve an exact historical first cycle with `backdate_start_date`.
9. If the collection method is `charge_automatically`, the user must also choose one attached payment method.
10. If the selected price is licensed, the user can also choose whether the initial anchored or backdated period creates an immediate proration invoice.
11. If the operator preserves an exact historical first cycle, the subscription is created in manual catch-up mode and is excluded from the hourly renewal processor until it is current again.
12. The subscriptions table shows each subscription's price, status, collection method, renewal mode, default payment method, current period start, and current period end.
13. Operators can create a subscription schedule from the subscription actions in `/customers/[id]`; the UI posts to `/api/subscription_schedules` to stage temporary or future price changes without creating an immediate invoice.
14. Operators can manually close one overdue cycle for one subscription from `/customers/[id]`; the UI posts to `POST /api/subscriptions/:id/close_cycle` and confirms that only one cycle will be processed.
15. The invoices table shows renewal invoices, any immediate proration draft created at subscription time, workflow state, payment state, delivery state, and a detail action for stored line items.
16. When a schedule changes price mid-cycle, the renewal invoice is stored with multiple line items so each priced segment of the cycle remains visible.
17. A background processor runs on `/api/internal/billing/process` every hour and updates invoice and subscription state without requiring the customer detail page to be opened.
18. When a due subscription is processed, the system creates or refreshes a draft invoice and leaves the subscription on the current cycle until the operator legally issues that invoice.
19. After legal issue, the subscription advances into the next billing period and the invoice becomes `paid` for auto-charge or `pending` for send-invoice.
20. After the operator sends an issued invoice, the invoice moves to `sent` and remains eligible to become `past_due` later if unpaid.
21. Subscriptions in manual catch-up mode are skipped by the hourly processor until a manual close refreshes the next overdue draft and later issue advances them to a current period, at which point they return to automatic renewal mode.
22. When the renewed price is metered, the invoice amount is computed from meter events recorded during the period that just ended instead of a flat quantity of `1`.
23. If the renewed price has `unit_amount_decimal`, the renewal line item multiplies usage by that decimal amount and rounds once to the nearest minor unit.
24. If metered usage arrives after its original period was already invoiced, the next renewal invoice stores it as a separate carryforward line item that still references the original service period and original effective price.
25. If a sent send-invoice renewal passes its due date unpaid, the invoice payment state and subscription are marked `past_due`.
26. The user can schedule cancellation at period end with `/api/subscriptions/:id`.
27. The user can remove a pending period-end cancellation with `/api/subscriptions/:id`.
28. The user can cancel a subscription immediately with `DELETE /api/subscriptions/:id`.
29. The user can detach an attached payment method with `/api/payment_methods/:id/detach`.
30. If the detached payment method is the default for an active or past-due auto-charge subscription, that subscription is canceled immediately.
31. If the user deletes the customer, the backend detaches attached payment methods before deleting the customer record, but blocks deletion while any active or past-due subscriptions remain.
