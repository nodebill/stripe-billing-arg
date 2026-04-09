# Bootstrap Entities

## BootstrapManifest

- `meters`
- `products`

The manifest is repo-owned configuration for the minimum bootstrap state that
must exist after a clean reset.

## BootstrapAdminInput

- `email`
- `name`
- `password`

Used only when the auth database has no users and the bootstrap must create the
first admin.

## BootstrapSeedResult

- `admin`
- `meters`
- `products`
- `warnings`

This is the JSON shape emitted by the CLI and returned by the bootstrap
service.
