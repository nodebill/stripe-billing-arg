# Subscription Schedule Entity

## SubscriptionSchedule

- `id: string`
- `object: "subscription_schedule"`
- `subscription: string`
- `status: "not_started" | "active" | "completed" | "canceled" | "released"`
- `end_behavior: "release" | "cancel"`
- `current_phase: { start_date: number; end_date: number } | null`
- `phases: SubscriptionSchedulePhase[]`
- `released_at: number | null`
- `canceled_at: number | null`
- `completed_at: number | null`
- `livemode: boolean`
- `created: number`
- `updated: number`

## SubscriptionSchedulePhase

- `price: string`
- `start_date: number`
- `end_date: number`

## Rules

- A schedule belongs to exactly one subscription.
- A schedule stores the subscription price that was active before the first phase so renewal invoices can reconstruct pre-change billing segments.
- Phases are ordered, contiguous, and keep the same currency and interval as the underlying subscription.
- Phases may move between licensed and metered recurring prices.
- Metered phases cannot overlap another active or `past_due` subscription for the same customer and meter, but a single subscription can change commission by moving between prices that share a meter.
- Phase transitions update the subscription item price when the billing processor crosses the phase boundary.
- Renewal invoices split licensed billing by elapsed time and metered billing by usage recorded inside each price segment, even when one billing period contains both usage types.
- Late metered carryforward also resolves its price against the historical schedule segment that was active when the usage occurred, not the later segment active when the carryforward invoice is created.
- Releasing or canceling a schedule stops future transitions but does not erase already-applied history.
