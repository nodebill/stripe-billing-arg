# User Stories

## Catalog management

- As an operator, I can create a product with a name, description, and active status.
- As an operator, I can open a product detail page and review the prices attached to that product.
- As an operator, I can create a one-time flat price for a product.
- As an operator, I can create a recurring flat price for a product with a monthly or yearly billing interval.
- As an operator, I can archive a price without deleting its history.
- As an operator, I can set one active price as the product's default price.
- As an operator, I understand that changing a price's amount, currency, or billing interval requires creating a new price.

## Customer payment methods

- As an operator, I can open a customer detail page and review the custom payment methods attached to that customer.
- As an operator, I can create a custom payment method and immediately attach it to a customer without providing an internal type identifier.
- As an operator, I can update the billing name on an attached custom payment method.
- As an operator, I can detach a custom payment method from a customer, knowing it cannot be re-attached afterward.
- As an operator, when I delete a customer, any attached custom payment methods are automatically detached first.

## Customer subscriptions

- As an operator, I can create a subscription for a customer by selecting one active recurring price and choosing either automatic charging or manual invoice sending.
- As an operator, when I choose automatic charging, I must select one attached payment method for the subscription.
- As an operator, I can open a customer detail page and review that customer's subscriptions.
- As an operator, I can open a customer detail page and review renewal invoices and mocked invoice deliveries for that customer.
- As an operator, I can cancel a subscription immediately.
- As an operator, I can mark a subscription to cancel at the end of the current billing period and remove that pending cancellation while the subscription is still active.
- As an operator, the system processes due subscriptions in the background, creates renewal invoices, and either mocks an automatic payment or mocks sending an invoice based on the subscription collection method.
- As an operator, I can see when a send-invoice renewal has become past due.
- As an operator, I cannot delete a customer while they still have active or past-due subscriptions.
