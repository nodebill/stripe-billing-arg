# Payment Methods API

## `POST /api/payment_methods`

Creates a payment method.

Request body:
- `type: "custom"`
- `billing_details.name?`

Only custom payment methods are supported. The backend assigns the internal custom payment method type automatically.

## `GET /api/payment_methods/:id`

Returns a single payment method.

## `POST /api/payment_methods/:id`

Updates mutable payment method fields.

Request body:
- `billing_details.name?`

Only attached payment methods can be updated.

## `POST /api/payment_methods/:id/attach`

Attaches a payment method to a customer.

Request body:
- `customer`

Only unattached payment methods can be attached. Detached payment methods cannot be re-attached.

## `POST /api/payment_methods/:id/detach`

Detaches a payment method from its customer.

Detach is irreversible.

Detaching a payment method immediately cancels any active subscriptions that use it as their default payment method.
