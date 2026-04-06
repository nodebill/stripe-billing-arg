# Auth Entities

## AuthUser

- Source: Better Auth `user` table.
- Fields used by the app:
  - `id`
  - `name`
  - `email`
  - `role`
  - `banned`
  - timestamps

## AuthSession

- Source: Better Auth `session` table plus compact cookie cache.
- Represents a browser session for a signed-in human user.

## ApiKey

- Source: Better Auth `apikey` table.
- Machine-to-machine credential associated to a user reference.
- The plaintext key is only returned at creation time.

## TeamInvite

- Source: app-owned `team_invites` table.
- Fields:
  - `id`
  - `email`
  - `role`
  - `token_hash`
  - `expires_at`
  - `accepted_at`
  - `revoked_at`
  - `created_by_user_id`
  - timestamps
