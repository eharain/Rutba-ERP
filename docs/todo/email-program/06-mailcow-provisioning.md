# Email Program — Mailcow Provisioning (M5, married to User Management 2026-08-10)

BYO covers any provider; this phase makes the company's own mail server
(mailcow at mail.trustlist.uk, hosting rutba.pk mail) a managed resource: the
ERP creates mailboxes and aliases instead of an admin clicking the mailcow UI.

> **Registry marriage (2026-08-10).** Server config now lives in the
> **`api::mail-server` registry** managed from Rutba Admin (:4022 →
> Email Servers): base_url, encrypted admin key, hosted `mail_domains`,
> imap/smtp host overrides, `validateServer` probe. Every provisioning entry
> point resolves a server the same way — explicit `serverId` → the registry
> entry hosting the email domain (`resolveForEmailDomain`) → the `MAILCOW_*`
> env server as last fallback — and all of them delegate to ONE path,
> `mail-account.provisionAccount()`:
> - **Rutba Admin** (`apps/admin/console`): user page / Mailboxes →
>   `POST /user-admin/users/:id/mailbox`
>   (assign an address to a user; target user becomes owner).
> - **apps/content/mail** Settings → Provision (mail_admin): `POST
>   /mail-accounts/provision`, now registry-aware (server + domain selects,
>   `access_roles` for shared; caller becomes owner).
> The registry also powers **BYO prefill**: `GET
> /mail-accounts/server-defaults?domain=` returns connection facts (hosts,
> 993/465, never the key) and Connect Mailbox fills its IMAP/SMTP fields when
> the typed address's domain is registered. Ownership and shared-access edits
> for the whole estate live in Rutba Admin (`access-map` + `setAccess`;
> access_roles keys are validated against active app-roles on EVERY write
> path, including BYO create/update). Core parity: these email-config routes
> are registered in `services/core/src/modules/user-mgmt.js`.

## Client — `services/strapi/src/utils/mailcow-client.js`

mta-client-shaped: base URL + `X-API-Key`, every call AbortController-bounded,
errors thrown as `MailcowError {status, code}`. Every op takes an optional
trailing `cfg` `{baseUrl, apiKey, timeoutMs}` — the registry feeds this; the
env vars below are the fallback when no registered server matches.

| Env | Meaning |
|---|---|
| `MAILCOW_BASE_URL` | e.g. `https://mail.trustlist.uk` (fallback server) |
| `MAILCOW_API_KEY` | admin API key (read-write) |
| `MAILCOW_TIMEOUT_MS` | default 10000 |

Endpoints used (mailcow admin API v1):

- `POST /api/v1/add/mailbox` — `{local_part, domain, name, password, quota, active}`
- `POST /api/v1/edit/mailbox` / `POST /api/v1/delete/mailbox`
- `POST /api/v1/add/alias` — shared addresses (support@ → mailbox) / delete
- `GET /api/v1/get/mailbox/{email}` — existence/quota/health

## Flows

**Provision from mail settings (admin):** "New mailbox on rutba.pk" dialog →
local part, display name, quota → mailcow `add/mailbox` with a generated
password → create `mail-account` (`provisioning_source='mailcow'`) with
IMAP/SMTP host preset to the mailcow server and the generated password
encrypted via the standard `crypto.js` path → validate → done. One click, no
mailcow UI.

**Provision from HR onboarding:** the HR lifecycle-event hook (the module that
already emits `hr.*` notification events) may request a mailbox for a new
employee (`firstname.lastname@rutba.pk`) and attach the resulting personal
`mail-account` to their user. Off by default; enabled per company policy.

**Shared address:** creating a `kind='shared'` account can either bind an
existing mailbox or provision one + aliases.

## Password custody rules

- The generated password is stored ONLY as `*_password_enc` on the
  mail-account (AES-256-GCM) — never shown, never mailed.
- A user who wants webmail/phone access uses "reset mailbox password", which
  generates a new one, updates mailcow AND the stored ciphertext, and shows it
  once. The ERP never learns a password the user typed elsewhere.
- Deleting a `provisioning_source='mailcow'` account asks whether to also
  delete the mailbox (destructive — double confirm) or orphan it.

## Non-goals

- No mailcow domain management, DKIM, or rspamd settings — server admin stays
  in mailcow.
- No password sync FROM mailcow (one-way custody only).
