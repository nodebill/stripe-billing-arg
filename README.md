# Pentos

Pentos is a Stripe-inspired billing sandbox for Argentina. It includes a small admin console and API for managing products, prices, customers, subscriptions, invoices, and metered billing.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnodebill%2Fstripe-billing-arg&env=DATABASE_URL,BETTER_AUTH_PRODUCTION_HOST,BETTER_AUTH_ALLOWED_HOSTS,BETTER_AUTH_TRUSTED_ORIGINS,BILLING_PROCESSOR_SECRET,CRON_SECRET,BETTER_AUTH_SECRET,BETTER_AUTH_URL&envDescription=Env%20variables%20to%20set%20up%20better%20auth%20and%20database)

Import this repository into Vercel and provide the environment variables listed below.

## Capabilities

- Bootstrap the first admin from a public setup screen, then manage sign-in, team invites, roles, bans, and machine API keys.
- Create products with one-time, recurring, or metered prices, including decimal unit amounts for usage-based billing.
- Manage customers, attach custom payment methods, and create subscriptions with automatic charge or send-invoice collection modes.
- Record meter events through the API and let the hourly billing processor generate renewal invoices and mocked payment or delivery outcomes.

## Deploy on Vercel

1. Import this repository in Vercel.
2. Provide the required environment variables listed below.
3. Complete the deploy and open `/bootstrap` on your production URL to create the first admin user.
4. After the first admin exists, the bootstrap page closes automatically and the app switches to normal sign-in.

The repo already includes `vercel.json` to run the billing processor every hour on Vercel.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by the app and Drizzle. |
| `BETTER_AUTH_SECRET` | Yes | Secret used to sign Better Auth sessions and tokens. Use a long random value. |
| `BETTER_AUTH_URL` | Yes | Full public app URL, for example `https://your-project.vercel.app`. Update this if your production domain changes. |
| `CRON_SECRET` | Yes | Secret used by Vercel Cron to authorize `GET` and `POST /api/internal/billing/process`. |
| `BILLING_PROCESSOR_SECRET` | No | Extra bearer token for manually triggering the billing processor from external jobs or scripts. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | No | Comma-separated extra origins if you need to trust additional domains beyond the main app URL. |
| `BETTER_AUTH_ALLOWED_HOSTS` | No | Comma-separated extra hostnames or host patterns for Better Auth `allowedHosts`, useful for preview domains. |
| `BETTER_AUTH_PRODUCTION_HOST` | No | Host-only fallback for Better Auth allowed hosts. In most cases, `BETTER_AUTH_URL` is enough. |

Do not commit real secrets. Configure them in Vercel Project Settings or your local `.env.local`.

## Local Development

```bash
pnpm install
pnpm dev
```

For local Postgres or migrations, set `DATABASE_URL` in `.env.local`. Without it, the app can fall back to a local PGlite database for quick development.

To clear test data without dropping the schema, run `pnpm db:reset`. This truncates billing tables and keeps auth data so you can stay signed in.

If you also want to wipe auth state and reopen `/bootstrap`, run `pnpm db:reset -- --all`.

When `DATABASE_URL` points to a non-local database, the reset script refuses to run unless you add `--force`.

## Updating Your Vercel Deploy

If your Vercel project is connected to Git:

1. Pull or sync the latest changes from your upstream repository into your repo or fork.
2. Push the updated code to the branch tracked as Production in your Vercel project. For a fresh import of this repo, Vercel will normally use `master` because the repository does not have a `main` branch.
3. Vercel will create a new production deployment automatically after the push.

If you prefer deploying manually with the Vercel CLI:

```bash
pnpm dlx vercel pull --yes --environment=production
pnpm dlx vercel build --prod
pnpm dlx vercel deploy --prebuilt --prod
```

If you change your Vercel domain or attach a custom domain, update `BETTER_AUTH_URL` and redeploy so invite links and auth callbacks keep pointing to the correct host.
