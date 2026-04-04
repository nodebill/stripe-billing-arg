# User Flows

## Products index

1. The user opens `/products`.
2. The page lists products and exposes create, edit, delete, and navigation into a specific product.
3. Clicking a product name opens `/products/[id]`.

## Product detail and prices

1. The user opens `/products/[id]`.
2. The page loads the product and its price list from `/api/products/:id` and `/api/prices?product=:id`.
3. The user can create a new price from the page header or empty state.
4. The create dialog allows either a one-time price or a recurring price.
5. For recurring prices, the interval options are limited to monthly and yearly.
6. The table shows the default price, archived state, and billing type.
7. The user can edit mutable fields on a price or set an active price as default.
