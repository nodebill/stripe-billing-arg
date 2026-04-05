# Meters & Metered Prices

## Context

The billing system supports fixed recurring and one-time prices. To enable usage-based billing, we need meters (tracking what to measure) and metered prices (prices that bill based on usage). This iteration adds meter CRUD and metered price creation only — no usage event recording yet.

## Meter Object

Stripe path: `/v1/billing/meters`

### Schema (`meters` table)

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | text PK | yes | `meter_` prefix + nanoid |
| `organization_id` | text | yes | Multi-tenant scoping |
| `display_name` | text | yes | Human-readable name |
| `event_name` | text | yes | Unique per org — identifies usage events |
| `default_aggregation` | text | yes | `"sum"` or `"count"` |
| `status` | text | yes | `"active"` or `"inactive"`, default `"active"` |
| `livemode` | boolean | yes | Default false |
| `created_at` | timestamptz | yes | Default now |
| `updated_at` | timestamptz | yes | Default now |

### API Response Shape

```json
{
  "id": "meter_abc123",
  "object": "billing.meter",
  "display_name": "API Calls",
  "event_name": "api_calls",
  "default_aggregation": { "formula": "sum" },
  "status": "active",
  "livemode": false,
  "created": 1712188800,
  "updated": 1712188800
}
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/billing/meters` | Create meter |
| GET | `/api/billing/meters` | List meters (paginated) |
| GET | `/api/billing/meters/[id]` | Get meter |
| POST | `/api/billing/meters/[id]` | Update meter (`display_name` only) |
| POST | `/api/billing/meters/[id]/deactivate` | Deactivate meter |

### Business Rules

- `event_name` must be unique per organization
- Only `display_name` is updatable after creation
- Meters cannot be deleted — only deactivated
- Deactivating a meter does NOT cascade to its prices

## Price Extension

### Schema Changes (`prices` table)

Add one nullable column:

| Column | Type | Notes |
|--------|------|-------|
| `meter` | text | Nullable. Stores the meter ID. Only set for metered prices. |

### Recurring Object Extension

The `recurring` sub-object gains `usage_type`:

```typescript
{
  interval: "month" | "year",
  interval_count: 1,
  usage_type: "licensed" | "metered"  // NEW — default "licensed"
}
```

### Price API Response (metered example)

```json
{
  "id": "price_xyz",
  "object": "price",
  "active": true,
  "billing_scheme": "per_unit",
  "currency": "usd",
  "product": "prod_abc",
  "type": "recurring",
  "unit_amount": 100,
  "meter": "meter_abc123",
  "recurring": {
    "interval": "month",
    "interval_count": 1,
    "usage_type": "metered"
  },
  "created": 1712188800,
  "updated": 1712188800
}
```

For non-metered prices, `meter` is `null` and `usage_type` is `"licensed"`.

### Create Price Validation Rules

Three valid discriminated union variants:

1. **One-time**: `type: "one_time"` — no recurring, no meter
2. **Recurring licensed**: `type: "recurring"`, `recurring.usage_type: "licensed"` (or omitted, defaults to licensed) — no meter allowed
3. **Recurring metered**: `type: "recurring"`, `recurring.usage_type: "metered"`, `meter` required — must reference an active meter's ID in the same org

Validation errors:
- `meter` provided without `usage_type: "metered"` → 400
- `usage_type: "metered"` without `meter` → 400
- `meter` references nonexistent or inactive meter → 400
- `meter` provided on one-time price → 400

## Module Structure

### New: `modules/meters/`

- `types.ts` — Meter, CreateMeterInput, UpdateMeterInput, ListMetersParams
- `validation.ts` — Zod schemas for create, update, list, deactivate
- `service.ts` — CRUD + deactivate

### Modified: `modules/shared/validation.ts`

Add `meterIdSchema` using existing `stripeIdSchema("meter", "Meter")`.

### Modified: `modules/prices/`

- `types.ts` — Add `meter` field to Price, add `usage_type` to PriceRecurring, update CreatePriceInput union to three variants
- `validation.ts` — Update `createPriceSchema` discriminated union with three variants
- `service.ts` — Add meter validation on create, include `meter` and `usage_type` in `toPrice()`

### Modified: `infrastructure/database/schema.ts`

- Add `meters` table
- Add `meter` column to `prices` table

### New routes: `app/api/billing/meters/`

- `route.ts` — POST (create) + GET (list)
- `[id]/route.ts` — GET (retrieve) + POST (update)
- `[id]/deactivate/route.ts` — POST (deactivate)

## Files to Create/Modify

**Create:**
- `modules/meters/types.ts`
- `modules/meters/validation.ts`
- `modules/meters/service.ts`
- `app/api/billing/meters/route.ts`
- `app/api/billing/meters/[id]/route.ts`
- `app/api/billing/meters/[id]/deactivate/route.ts`

**Modify:**
- `infrastructure/database/schema.ts` — add meters table, add meter column to prices
- `modules/shared/validation.ts` — add meterIdSchema
- `modules/prices/types.ts` — add meter, usage_type fields
- `modules/prices/validation.ts` — three-variant discriminated union
- `modules/prices/service.ts` — meter validation + response mapping

## Verification

1. Create a meter via `POST /api/billing/meters`
2. List meters via `GET /api/billing/meters`
3. Get meter via `GET /api/billing/meters/{id}`
4. Update meter display_name via `POST /api/billing/meters/{id}`
5. Create a metered price: `POST /api/prices` with `type: "recurring"`, `recurring: { interval: "month", usage_type: "metered" }`, `meter: "meter_xxx"`
6. Verify metered price response includes `meter` and `recurring.usage_type`
7. Verify non-metered prices still work and show `usage_type: "licensed"`
8. Verify validation rejects: meter without usage_type metered, metered without meter, inactive meter, nonexistent meter
9. Deactivate a meter, verify it can't be attached to new prices
10. Run `npm run build` to check for type errors
