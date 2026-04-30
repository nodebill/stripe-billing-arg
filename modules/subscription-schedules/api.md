# Subscription Schedules API

> Authentication: all endpoints in this module require an authenticated user session or an authorized machine credential.

## `GET /api/subscription_schedules`

Returns a paginated Stripe-style list of subscription schedules.

Query params:
- `subscription?`
- `status?`
- `limit`
- `starting_after`
- `ending_before`

## `POST /api/subscription_schedules`

Creates a schedule for an existing subscription.

Request body:
- `subscription`
- `end_behavior`
- `phases`

Each phase supports:
- `price`
- `start_date`
- `end_date`

Rules:
- Only one `active` or `not_started` schedule may exist per subscription.
- Phases must be contiguous and ordered.
- Every phase must end after it starts.
- At least one phase must still end in the future.
- Every phase price must be an active recurring price with the same currency and interval as the subscription's current price.
- Phase prices may change between licensed and metered usage.
- A metered phase cannot overlap another active or `past_due` subscription for the same customer and meter. Meter changes within the same subscription are allowed.

## `GET /api/subscription_schedules/:id`

Returns a single subscription schedule.

## `POST /api/subscription_schedules/:id`

Replaces only the future portion of a schedule.

Rules:
- Only `active` and `not_started` schedules can be updated.
- Already-started phases remain immutable.
- The first replacement phase must start exactly when the immutable phase chain ends.
- Updated metered phases follow the same customer/meter overlap validation as schedule creation.

## `POST /api/subscription_schedules/:id/cancel`

Stops future schedule transitions and leaves the subscription on the current price.

## `POST /api/subscription_schedules/:id/release`

Detaches the schedule and leaves the subscription on the current price.
