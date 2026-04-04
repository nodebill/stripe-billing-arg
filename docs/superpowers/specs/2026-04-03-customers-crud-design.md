# Customers CRUD Design

## Context

The Havana billing system already has Products and Prices CRUD. Customers is the next resource needed to complete the core billing model. The implementation mirrors Stripe's Customer API with a minimal field set — just enough for create, update, delete, and list operations. No balance, phone, address, or tax fields.

## Data Model

```
customers table
───────────────────────────────────
id              text PK           cus_ + nanoid
organization_id text NOT NULL     multi-tenant isolation
name            text              nullable
email           text              nullable
description     text              nullable
metadata        jsonb             Record<string, string>, default {}
livemode        boolean           default false
created_at      timestamptz       default now()
updated_at      timestamptz       default now()
```

No `active` field — Stripe customers don't have one. Deletion is a hard delete returning `{ id, object: "customer", deleted: true }`.

## API Endpoints

All endpoints follow existing Stripe-style conventions (POST for mutations, cursor pagination).

### POST /api/customers (create)
- Body: `{ name?, email?, description?, metadata? }`
- Returns: Customer object, status 201

### GET /api/customers (list)
- Query: `limit`, `email`, `starting_after`, `ending_before`
- Returns: `StripeList<Customer>`

### GET /api/customers/:id (retrieve)
- Returns: Customer object or 404

### POST /api/customers/:id (update)
- Body: `{ name?, email?, description?, metadata? }` (all optional, nullable)
- Returns: updated Customer object or 404

### DELETE /api/customers/:id (delete)
- Returns: `{ id, object: "customer", deleted: true }` or 404

## Response Types

```typescript
type Customer = {
  id: string;
  object: "customer";
  name: string | null;
  email: string | null;
  description: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
  created: number;  // unix timestamp
  updated: number;
};

type DeletedCustomer = {
  id: string;
  object: "customer";
  deleted: true;
};
```

## Backend Files

| File | Purpose |
|------|---------|
| `infrastructure/database/schema.ts` | Add customers table definition |
| `infrastructure/database/client.ts` | Add CREATE TABLE bootstrap SQL |
| `modules/customers/types.ts` | Customer, CreateCustomerInput, UpdateCustomerInput, DeletedCustomer, ListCustomersParams |
| `modules/customers/validation.ts` | Zod schemas: createCustomerSchema, updateCustomerSchema, listCustomersSchema |
| `modules/customers/service.ts` | createCustomer, getCustomer, updateCustomer, deleteCustomer, listCustomers |
| `app/api/customers/route.ts` | POST (create) + GET (list) handlers |
| `app/api/customers/[id]/route.ts` | GET (retrieve) + POST (update) + DELETE handlers |

## Frontend Files

| File | Purpose |
|------|---------|
| `app/customers/page.tsx` | Server component wrapper |
| `app/customers/_components/customers-view.tsx` | List view: table, search, pagination, loading/empty/error states |
| `app/customers/_components/create-customer-dialog.tsx` | Create dialog: name, email, description fields |
| `app/customers/_components/edit-customer-dialog.tsx` | Edit dialog with pre-populated fields |
| `app/customers/_components/delete-customer-dialog.tsx` | Delete confirmation dialog |

## Frontend Behavior

- List shows: name, email, created date, metadata count
- Search filters by name or email (client-side, same pattern as products)
- Cursor pagination with "Load more" button
- Icon: `Users` from lucide-react
- No detail page (no child resources yet)
- Navigation: add link to customers alongside products

## Not Included

- balance, phone, address, currency, tax fields
- Customer detail page
- Relationships to products/prices/subscriptions
- Soft delete (using hard delete matching Stripe's behavior)

## Verification

1. Run `npm run dev` and verify the app starts
2. Test API: create, list, get, update, delete a customer via curl or the UI
3. Test frontend: navigate to /customers, create/edit/delete customers
4. Test edge cases: duplicate emails allowed (Stripe allows this), empty body creates valid customer
5. Run `npx tsc --noEmit` to verify type-checking passes
