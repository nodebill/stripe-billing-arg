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
