# Tranche 8 — Auth: migration sheet

Status: **built + smoke-verified + cross-server-verified** (the last tranche of
the strangler playbook; goldens, schema handover and the Caddy flip remain).

With this tranche core no longer depends on Strapi to mint tokens — the
"Strapi stays sole JWT issuer until the final phase" constraint from the
program plan is lifted.

## What runs in core now

- `services/core/src/auth/up.js` — the users-permissions subsystem: session
  manager, user service, plugin-store reader.
- `services/core/src/modules/auth.js` — the endpoint surface + the services/strapi
  users-permissions EXTENSION behaviours + zero-copy auth-admin.

### Routes (all selfAuth — UP routes are not interceptor-gated)

| Route | Notes |
|---|---|
| POST /api/auth/local | password login; wrong-credential message identical to Strapi's |
| POST /api/auth/local/register | allowedFields enforced (`displayName`, `app_roles`), unique-email + identifier conflict checks, default role from the plugin store |
| POST /api/auth/refresh | rotates the family, returns `{jwt, refreshToken}` |
| POST /api/auth/logout | `scope:'all'` / deviceId / current-session |
| GET · DELETE /api/auth/sessions[/:sessionId] | list + revoke, using Strapi's own display helpers |
| POST /api/auth/change-password · reset-password | re-issue after invalidating prior sessions |
| POST /api/auth/forgot-password · send-email-confirmation | token recorded, mail NOT sent (see deviations) |
| GET /api/auth/email-confirmation | confirms + redirects per plugin-store setting |
| GET /api/auth/:provider/callback | local only; OAuth handshake stays on Strapi |
| GET /api/users/me | the profile endpoint every app polls |
| /api/auth-admin/* (9) | zero-copy from repo code; requireAuthAdmin inside |

PATH FACT worth recording: the UP route file sets `prefix: ''`, which strips
the PLUGIN prefix, **not** the content-API `/api` one. Live Strapi serves
these at `/api/auth/*` and returns **405** on the unprefixed path; every
client builds its URL from an `API_URL` that already ends in `/api`. Core
mounts `/api/auth/*` only. (A first cut mounted both shapes — removed, since
serving a path Strapi 405s is a deviation, not a convenience.)

## Why this tranche is NOT zero-copy

Tranches 1–7 `require()` services/strapi source against the compat strapi. The auth
reference implementation is not repo code — it lives in
`@strapi/plugin-users-permissions` and `@strapi/core`, which need a booted
Strapi (plugin registry, `strapi.store`, `strapi.sessionManager`). So core
re-implements the CONTRACT while still loading, from services/strapi's own
node_modules, the parts that can run standalone:

- the plugin's **yup validators** (identical validation messages),
- **bcryptjs** (identical password hashing, 10 rounds),
- **@strapi/utils** session-display helpers.

`SessionManager` was ported statement-by-statement from
`@strapi/core/dist/services/session-manager.js`: refresh tokens are
`{userId, sessionId, type:'refresh', iat, exp}` signed with `noTimestamp`
(iat/exp come from the `strapi_sessions` row), access tokens are
`{userId:String, sessionId, type:'access'}` with `accessTokenLifespan`,
rotation inserts a CHILD row and marks the parent `rotated` (re-rotating a
rotated parent re-issues the same child), and lifespans read the same
`UP_*_LIFESPAN` env vars services/strapi's config uses.

Plugin-store settings (`grant` / `advanced` / `email`) are read from the same
`strapi_core_store_settings` rows Strapi admin edits, so toggles such as
`email_confirmation` and `allow_register` keep working for both servers.

### services/strapi extension behaviours reproduced (repo code the apps depend on)

- register grants the `storefront_user` app-role to `authenticated`-role signups,
- register/OAuth-callback promote a matching **provisional person**,
- a successful password reset also **confirms** the account.

## SHARED-STATE DESIGN — why the flip is not disruptive

Both servers sign with the same `JWT_SECRET` and read/write the same
`strapi_sessions` rows in the same format. Verified against a live
services/strapi by `scripts/check-cross-server-auth.js` (12 checks, all green):

- a **core**-minted access token authenticates on **services/strapi**,
- a **services/strapi**-minted access token authenticates on **core**,
- services/strapi logs in a user **core** registered (same hash recipe),
- **core** rotates a refresh token **services/strapi** issued, and the result is
  accepted by services/strapi,
- a core-issued refresh token rotates into a token services/strapi accepts,
- a **core** logout deletes the shared session rows, so neither server can
  rotate that family afterwards.

Consequence: traffic can move at the Caddy layer without signing anyone out,
and the two servers can run side by side through the bake.

## Deliberate deviations

1. **Access tokens and revoked sessions.** Strapi's `validateAccessToken`
   checks no session row at all — a logged-out access token keeps working for
   its full 120-minute lifespan. Core additionally requires the session row to
   exist and be `active` **or `rotated`** (a rotation in flight legitimately
   names the parent). Net effect: logout/revoke takes effect immediately on
   core instead of lingering. Stricter than Strapi, deliberately.
   This also FIXED a latent core bug — before this tranche core accepted only
   `active`, so any client hitting core with a token issued just before a
   rotation got a spurious 401.
2. **Email.** `forgot-password` and `send-email-confirmation` record the token
   and return the same response shape, but send no mail (core has no email
   plugin — the email tranche follows). Password reset therefore still needs
   services/strapi to send the link, or the token must be read from the row.
3. **OAuth providers.** `/api/auth/:provider/callback` handles `local`; the
   third-party handshake needs the grant middleware chain and stays on Strapi.
   `provider-status`/social OAuth (tranche 5) is unaffected.

## PRE-EXISTING BUG FOUND (not caused by this tranche, spawned as a task)

`POST /api/auth/refresh` on **services/strapi 403s for every caller** on the dev
DB — including refresh tokens Strapi itself issued. In `up_permissions`,
`plugin::users-permissions.auth.refresh` is linked to `staff` and
`authenticated` but **not `public`**, and refresh is by design unauthenticated
(the access token has expired), so it resolves against the public role.
`auth.getSessions` / `auth.revokeSession` have no permission row at all.
Impact: any client whose 120-minute token expires cannot refresh through
services/strapi. Core does not reproduce this. Fix belongs in the up-permissions
seed (never auto-grant UP actions from plugin code).

## Verification

- `node scripts/smoke-auth.js` — 33 checks, marker-only and self-cleaning
  (registers `__rutba_core_auth_smoke__@example.test`, removes the user, its
  sessions, app-role links and person row; temporarily flips
  `allow_register`/`email_confirmation` and restores the exact prior value).
- `node scripts/check-cross-server-auth.js` — 12 checks, needs services/strapi up.
- Full sweep green (documents, writes, http, platform, hr, crm, inventory,
  cms-social, marketplace, sale-stock, auth); smoke-mfg still shows only the 3
  PRE-EXISTING dev-DB WO-stage failures.
- validate-schema: 0 warnings. contract-diff: 101/113, the pre-existing
  baseline, no new diffs.

## Remaining for this tranche

Goldens on a fixture DB and the Caddy flip. No schema changes (auth writes
existing tables only) and no crons. Flip notes: the shared-session design
means auth can flip independently of the other tranches, but the email
deviation above means password-reset mail must either stay on Strapi or wait
for the email tranche.
