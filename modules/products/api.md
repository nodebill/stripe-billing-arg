# Products API

> Authentication: all endpoints in this module require an authenticated user session or an authorized machine credential.

## `GET /api/products`

Returns a paginated Stripe-style list of products.

Query params:
- `limit`
- `active`
- `starting_after`
- `ending_before`

## `POST /api/products`

Creates a product.

Request body:
- `name`
- `description?`
- `active?`
- `metadata?`

## `GET /api/products/:id`

Returns a single product.

## `POST /api/products/:id`

Updates mutable product fields.

Request body:
- `name?`
- `description?`
- `active?`
- `default_price?`
- `metadata?`

`default_price` must reference an active price that belongs to the same product.

## `DELETE /api/products/:id`

Deletes a product only when it has no prices.
