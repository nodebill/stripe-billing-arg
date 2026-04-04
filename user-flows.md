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

## Customers index

1. The user opens `/customers`.
2. The page lists customers and exposes create, edit, delete, search, and navigation into a specific customer.
3. Clicking a customer name opens `/customers/[id]`.

## Customer detail and payment methods

1. The user opens `/customers/[id]`.
2. The page loads the customer, its attached payment methods, its subscriptions, and the recurring prices available for subscription creation.
3. The user can create a custom payment method by entering an optional billing name.
4. The frontend first creates the payment method via `/api/payment_methods`, then immediately attaches it with `/api/payment_methods/:id/attach`.
5. The table shows each attached payment method's type, billing name, and creation date.
6. The user can update the billing name of an attached payment method with `/api/payment_methods/:id`.
7. The user can create a subscription with `/api/subscriptions` by choosing one attached payment method and one active recurring price.
8. The subscriptions table shows each subscription's price, status, default payment method, and current period end.
9. The user can schedule cancellation at period end with `/api/subscriptions/:id`.
10. The user can remove a pending period-end cancellation with `/api/subscriptions/:id`.
11. The user can cancel a subscription immediately with `DELETE /api/subscriptions/:id`.
12. The user can detach an attached payment method with `/api/payment_methods/:id/detach`.
13. If the detached payment method is the default for an active subscription, that subscription is canceled immediately.
14. If the user deletes the customer, the backend detaches attached payment methods before deleting the customer record, but blocks deletion while any active subscriptions remain.
