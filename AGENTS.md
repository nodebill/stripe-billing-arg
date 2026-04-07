<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project

Pentos is a Stripe-inspired billing engine for Argentina. It includes a small admin console and API for products, prices, customers, subscriptions, invoices, metered billing, team invites, and machine API keys.

# Architecture

- `app/` contains the Next.js App Router UI and API route handlers.
- `modules/` contains domain logic for each billing area. Keep business rules here.
- `infrastructure/auth/` contains Better Auth setup, guards, invite/bootstrap policy, and team management helpers.
- `infrastructure/database/` contains the Drizzle schema and database client. The app uses Postgres when `DATABASE_URL` is set and can fall back to local PGlite for development.
- `drizzle/` contains generated migrations and snapshots.

# Conventions

- Prefer adding behavior in `modules/*` and keeping route handlers thin.
- Treat `app/api/internal/billing/process` as the background billing entrypoint.
- Auth is email/password only in-app; sign-up is restricted to bootstrap or invite flows.
