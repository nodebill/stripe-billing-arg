# Bootstrap Module

This module does not expose HTTP endpoints. It provides an internal CLI-oriented
bootstrap flow for rehydrating the minimum account and catalog state after a
database reset.

## CLI contract

Command:

```bash
pnpm bootstrap:seed -- --admin-email=ops@example.com --admin-name="Admin inicial" --admin-password="supersecret..."
```

Supported flags:

- `--admin-email`
- `--admin-name`
- `--admin-password`
- `--help`

Environment variable fallbacks:

- `PENTOS_BOOTSTRAP_ADMIN_EMAIL`
- `PENTOS_BOOTSTRAP_ADMIN_NAME`
- `PENTOS_BOOTSTRAP_ADMIN_PASSWORD`

Rules:

- When there are no auth users, all three admin credentials are required.
- When auth users already exist, the bootstrap skips admin creation and still
  ensures the seed catalog.
- The command writes a JSON summary with `admin`, `meters`, `products`, and
  `warnings`.
- The process exits non-zero for invalid arguments, missing required
  credentials, or ambiguous existing data.
