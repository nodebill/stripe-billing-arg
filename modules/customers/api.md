# Customers API

## `GET /api/customers`

Returns a paginated Stripe-style list of customers.

Query params:
- `limit`
- `email`
- `starting_after`
- `ending_before`

## `POST /api/customers`

Creates a customer.

Request body:
- `name?`
- `email?`
- `description?`
- `metadata?`

## `GET /api/customers/:id`

Returns a single customer.

## `POST /api/customers/:id`

Updates mutable customer fields.

Request body:
- `name?`
- `email?`
- `description?`
- `metadata?`

## `DELETE /api/customers/:id`

Deletes a customer.

If the customer has attached payment methods, they are detached automatically before the customer is removed.

## `GET /api/customers/:id/payment_methods`

Returns a paginated Stripe-style list of payment methods currently attached to the customer.

Query params:
- `limit`
- `starting_after`
- `ending_before`
