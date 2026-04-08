# User Stories

## Authentication and access

- As a deployer, I can bootstrap the first admin exactly once from a public setup page.
- As a team member, I can sign in with my personal email and password before accessing the UI or API.
- As an admin, I can invite teammates with a shareable one-time link instead of opening public sign-up.
- As an admin, I can manage team roles, suspend access, and set a temporary password for a teammate.
- As an admin, I can create machine API keys for server-to-server automation.

## Catalog management

- As an operator, I can create a product with a name, description, and active status.
- As an operator, I can open a product detail page and review the prices attached to that product.
- As an operator, I can create a one-time flat price for a product.
- As an operator, I can create a recurring flat price for a product with a monthly or yearly billing interval.
- As an operator, I can create a recurring metered price that points at one billing meter.
- As an operator, I can upload one CSV on a product detail page to create many prices for that product at once, including metadata, and I can review per-row failures without losing successful rows.
- As an operator, I can create a billing meter from the admin UI without leaving the meters area.
- As an operator, when I am creating a metered price and there is no suitable meter yet, I can create one inline and continue the pricing flow.
- As an operator, I can create a recurring metered price with `unit_amount_decimal` so a fee like 1% of processed volume can be modeled without introducing a custom pricing type.
- As an operator, I can archive a price without deleting its history.
- As an operator, I can set one active price as the product's default price.
- As an operator, I understand that changing a price's amount, currency, or billing interval requires creating a new price.
- As an operator, I can browse billing meters and inspect their recorded usage without creating usage events from the UI.
- As an operator, I can record metered usage for a subscribed customer through the API using a meter event.

## Customer payment methods

- As an operator, I can open a customer detail page and review the custom payment methods attached to that customer.
- As an operator, I can create a custom payment method and immediately attach it to a customer without providing an internal type identifier.
- As an operator, I can update the billing name on an attached custom payment method.
- As an operator, I can detach a custom payment method from a customer, knowing it cannot be re-attached afterward.
- As an operator, when I delete a customer, any attached custom payment methods are automatically detached first.

## Customer subscriptions

- As an operator, I can create a subscription for a customer by selecting one active recurring price and choosing either automatic charging or manual invoice sending.
- As an operator, when I choose automatic charging, I must select one attached payment method for the subscription.
- As an operator, I can create a subscription with a Stripe-style aligned renewal date or a backdated start date instead of always starting the billing cycle today.
- As an operator, I can choose whether the initial anchored or backdated service period creates an immediate proration invoice.
- As an operator, I can open a customer detail page and review that customer's subscriptions.
- As an operator, I can open a customer detail page and review renewal invoices and mocked invoice deliveries for that customer.
- As an operator, I can cancel a subscription immediately.
- As an operator, I can mark a subscription to cancel at the end of the current billing period and remove that pending cancellation while the subscription is still active.
- As an operator, I can schedule a temporary discount or a future price change for an existing subscription without issuing an immediate proration invoice.
- As an operator, the system processes due subscriptions in the background, creates renewal invoices, and either mocks an automatic payment or mocks sending an invoice based on the subscription collection method.
- As an operator, a metered subscription renewal bills the usage recorded during the period that just ended.
- As an operator, a metered renewal can multiply whole-number usage by a decimal per-unit amount and round once to the nearest minor unit on the invoice line item.
- As an operator, when a subscription price changes mid-cycle, the renewal invoice reflects each pricing segment as separate line items instead of collapsing the whole cycle into one amount.
- As an operator, I can see when a send-invoice renewal has become past due.
- As an operator, I cannot delete a customer while they still have active or past-due subscriptions.
