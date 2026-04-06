# Auth API

## Better Auth endpoints

- `GET /api/auth/ok`
  - Health check for the auth subsystem.
- `POST /api/auth/sign-in/email`
  - Authenticates a user with email and password.
- `POST /api/auth/sign-out`
  - Revokes the current cookie session.
- `POST /api/auth/admin/*`
  - Admin-only Better Auth endpoints used internally for role changes, bans, and password resets.
- `POST /api/auth/api-key/create`
  - Creates a machine API key for the authenticated admin user.
- `POST /api/auth/api-key/delete`
  - Deletes one of the authenticated admin user's machine API keys.

## App-owned auth flows

- `/bootstrap`
  - Public one-time flow to create the first admin when no auth users exist.
- `/sign-in`
  - Public sign-in page for human users.
- `/accept-invite?token=...`
  - Public invite-acceptance flow backed by `team_invites`.
- `/team`
  - Admin UI for creating invites, changing roles, banning/unbanning users, and setting passwords.
- `/api-keys`
  - Admin UI for creating and deleting machine API keys.

## Authentication requirements for business APIs

- All existing business endpoints under `/api/products`, `/api/prices`, `/api/customers`, `/api/payment_methods`, `/api/subscriptions`, `/api/invoices`, and `/api/billing/*` require authentication.
- Cookie-backed user sessions are accepted across all business APIs.
- `x-api-key` machine credentials are accepted by auth resolution and used explicitly for server-to-server access.
- `/api/internal/billing/process` accepts either an authenticated admin principal or the legacy bearer secret during the migration window.
