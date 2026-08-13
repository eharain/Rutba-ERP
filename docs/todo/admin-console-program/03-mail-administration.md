# 03 — Mail Administration

> **Status: partly built.** Part of the [Admin Console Program](README.md).
> The registry, the access model and mailcow provisioning all exist and work.
> This document specs what is missing: domains, aliases, quotas, bulk
> provisioning, and lifecycle.

## Decision

**Rutba administers its own mail server.** The ERP is not a mail client that
happens to connect to somebody else's mailcow — for `rutba.pk` and every tenant
that takes mail with their instance, the ERP is where mailboxes are created,
assigned, quota'd and retired.

This is a scope extension of the [email program](../email-program/00-overview-and-roadmap.md),
not a contradiction of it. That program's ADR — *live-IMAP gateway,
import-on-demand, the mail server stays the source of truth* — is unchanged. This
document is about **administering** the server, not mirroring it. Bring-your-own
IMAP remains fully supported; `mail-account.provisioning_source` already
distinguishes `byo` from `mailcow`.

## What exists today (verified)

### `mail-server` — the registry

[`mail_servers`](../../../pos-strapi/src/api/mail-server/content-types/mail-server/schema.json):
`name`, `kind` (enum: `mailcow`), `base_url`, `api_key_enc`, `mail_domains`
(json), `imap_host`, `smtp_host`, `is_active`, `last_checked_at`, `last_error`.

Admin UI: [`/email-servers`](../../../rutba-admin/pages/email-servers.js),
`PermissionCheck`-wrapped. The API key is AES-256-GCM encrypted and never
returned — see [02 §1](02-integrations-and-credentials.md).

### `mail-account` — the mailbox

[`mail_accounts`](../../../pos-strapi/src/api/mail-account/content-types/mail-account/schema.json):
`kind` (`personal` | `shared`), `email`, IMAP/SMTP coordinates,
`imap_password_enc` / `smtp_password_enc`, `signature_html`,
`provisioning_source` (`byo` | `mailcow`), `special_folders`, `unseen_counts`,
`is_active`, `last_checked_at`, `last_error`, **`access_roles` (json)** and
**`owners` (relation)**.

Access is decided by `canAccess(userId, account)` at
[`mail-account/services/mail-account.js:23`](../../../pos-strapi/src/api/mail-account/services/mail-account.js).
`owners` follows the repo-wide ownership convention (plural m2m, always named
`owners`); `access_roles` is the shared-inbox role gate.

Admin UI: [`/mailboxes`](../../../rutba-admin/pages/mailboxes.js) — assign a new
address, ownership, shared-inbox access.

### `provisionAccount` — one-click mailbox creation

At [`mail-account/services/mail-account.js:89`](../../../pos-strapi/src/api/mail-account/services/mail-account.js):

```js
async provisionAccount({ localPart, domain, name, kind = 'personal',
                         quotaMb, ownerUserIds = [], accessRoles, serverConfig })
```

It rejects duplicates with a 409, calls `mailcow.addMailbox`, generates an
18-byte random password, stores it encrypted, writes the `mail-account` row with
`provisioning_source: 'mailcow'`, and attaches owners via the trusted query layer
(the `owners` relation cannot go through the content-API validator).

> **Correction to a common description:** `provisionAccount` lives in the
> `mail-account` **service**, not in `utils/mailcow-client.js`. The client is a
> thin HTTP wrapper; the orchestration is in the service. Callers:
> [`mail-account` controller:612](../../../pos-strapi/src/api/mail-account/controllers/mail-account.js)
> and [`user-admin` controller:596](../../../pos-strapi/src/api/user-admin/controllers/user-admin.js)
> — the second is how assigning an email address in Rutba Admin provisions a real
> mailbox.

### `mailcow-client.js` — more is built than is wired

[`pos-strapi/src/utils/mailcow-client.js`](../../../pos-strapi/src/utils/mailcow-client.js)
exports: `MailcowError`, `isConfigured`, `baseUrl`, `request`, `addMailbox`,
`getMailbox`, `listMailboxes`, `listDomains`, `deleteMailbox`, `addAlias`.

| Function | Wired to a route or UI? |
|---|---|
| `addMailbox` | ✅ via `provisionAccount` |
| `listDomains` | ✅ [`mail-server/controllers/mail-server.js:110`](../../../pos-strapi/src/api/mail-server/controllers/mail-server.js) |
| `getMailbox`, `listMailboxes` | Partially — used for validation |
| **`addAlias`** | ❌ **zero callers** |
| **`deleteMailbox`** | ❌ **zero callers** |

So two of the four capabilities this section needs are already written and simply
have no route and no UI in front of them. That materially shortens the work.

### Quota — the field exists, the control does not

`addMailbox` takes `quotaMb` with a default of `1024`
([line 105](../../../pos-strapi/src/utils/mailcow-client.js)), and
`provisionAccount` threads it through. Nothing in the UI ever sets it, so every
mailbox Rutba has ever provisioned is exactly 1 GB. And there is **no
quota-update call at all** — mailcow's `edit/mailbox` endpoint is not wrapped, so
quota is currently set-once-at-creation with no way to change it.

## Measured gap

| Capability | Client fn | Route | UI |
|---|---|---|---|
| Create mailbox | ✅ | ✅ | ✅ |
| List domains | ✅ | ✅ | partial |
| **Add domain** | ❌ | ❌ | ❌ |
| **Add alias** | ✅ built | ❌ | ❌ |
| **Set quota at creation** | ✅ built | ❌ | ❌ |
| **Change quota** | ❌ | ❌ | ❌ |
| **Delete / suspend mailbox** | ✅ built | ❌ | ❌ |
| **Bulk provision** | ❌ | ❌ | ❌ |
| Reset password | ✅ | ✅ | ✅ |

## Specification

### 3.1 Domains

`mail_domains` on `mail-server` is a json array, and `listDomains` reads the live
list from mailcow. Neither is presented as an administrable thing.

- [ ] Domains tab on `/email-servers`: live mailcow domains joined against the
      registry's `mail_domains`, with drift shown explicitly (in mailcow but not
      registered; registered but absent from mailcow).
- [ ] Per-domain: mailbox count, aggregate quota used vs allocated, active/inactive.
- [ ] Wrap mailcow `add/domain` in the client and expose an add-domain flow.
      Gate it behind a config flag — creating a mail domain implies DNS records
      (MX, SPF, DKIM, DMARC) that the ERP does not manage.
- [ ] Surface the DKIM key mailcow generates, read-only and copyable. Not
      publishing it is the single most common cause of a newly added domain
      landing in spam, and the admin needs it to paste into DNS.
- [ ] Do **not** build DNS management. State that boundary in the UI, with the
      exact records to create.

### 3.2 Aliases

`addAlias({ address, goto }, cfg)` is written and unreachable. Aliases are how
`sales@` reaches three people without a shared mailbox, and how a departing
employee's address keeps forwarding.

- [ ] Descriptor + route over the existing `addAlias`.
- [ ] Wrap mailcow's alias list and delete calls; the client has neither today.
- [ ] Aliases tab: address → destination(s), per domain, with search.
- [ ] Create / edit / delete, multiple `goto` targets, active toggle.
- [ ] **Decide and document the alias/shared-mailbox boundary.** An alias
      forwards; a shared mailbox is a real IMAP mailbox with `access_roles`,
      triage and assignment. Both can serve `support@`. The UI must make the
      choice explicit at creation time rather than leaving an admin to discover
      the difference later.
- [ ] Aliases do not get `mail-account` rows — they have no credentials and
      nothing to read over IMAP. Keep them mailcow-side, listed by the console.

### 3.3 Quotas

- [ ] Wrap mailcow `edit/mailbox` for quota changes — the missing call.
- [ ] Expose `quotaMb` in the provisioning form, defaulting to the current 1024.
- [ ] Per-server default quota on the `mail-server` row, so a tenant sets it once
      instead of per mailbox.
- [ ] Usage vs quota per mailbox, from `getMailbox`, with a sortable "nearly
      full" view. This is the number an admin is actually looking for.
- [ ] Bulk quota change over a selection.
- [ ] No automatic enforcement or auto-expansion. Report, let the admin act.

### 3.4 Bulk provisioning

The one-at-a-time flow is fine for a new hire and useless for onboarding a
tenant with forty staff.

- [ ] Bulk provision from a **selection of existing ERP users** — the primary
      path. Rutba already knows their names; deriving `firstname.lastname@domain`
      from user records beats a CSV round-trip.
- [ ] CSV import as the secondary path, for addresses with no ERP user yet.
- [ ] Follow the established two-phase import shape used by bulk stock-item
      import: **resolve** (dry run — collisions, invalid local parts, quota
      overcommit, per-row status) then **process**. Never a blind bulk write.
- [ ] Per-row outcome, partial success allowed. `provisionAccount` already
      returns a 409 `mail_account_exists` per address — surface it per row rather
      than failing the batch.
- [ ] Generated passwords are shown **once**, at the end, exportable once, and
      never retrievable afterwards. They are stored encrypted; the reset flow
      already exists for recovery.
- [ ] Rate-limit against the mailcow API; forty sequential `addMailbox` calls
      should not look like an attack.

### 3.5 Lifecycle

`deleteMailbox` is built with zero callers, and there is no suspend at all.
Offboarding today leaves an active mailbox with a live password.

- [ ] **Suspend** before delete: mailcow `active: 0`, plus `is_active: false` on
      the `mail-account` row. Reversible. This is what offboarding should do.
- [ ] Delete is a separate, explicitly confirmed action that names the mailbox
      and states that mail is destroyed on the mail server. Per the platform-wide
      rule on irreversible actions, delete must never be the default offboarding
      path.
- [ ] Deleting a `mail-account` row must not silently orphan its mailcow mailbox,
      and deleting the mailcow mailbox must not leave a live `mail-account` row.
      Reconcile explicitly; the console should show orphans on both sides.
- [ ] Transfer ownership: reassign `owners`, optionally add an alias forwarding
      the old address to the successor.
- [ ] HR-onboarding hook — deferred from email-program M5 and still open. An
      approved hire optionally provisions a mailbox. Sequence it after 3.4, since
      it is bulk provisioning with a different trigger.

## Placement in the console

Mail administration is one section with tabs (Servers, Domains, Mailboxes,
Aliases), not four sections. `/email-servers` and `/mailboxes` are today's two
pages and become two of those tabs.

`mail-server` also appears in the `/integrations` directory from
[02](02-integrations-and-credentials.md) as `kind: 'mail-server'` — the directory
lists it and deep-links here. It is not administered in two places.

## Phases

| Phase | Contents | Size | Depends on |
|---|---|---|---|
| **A4.1** | Aliases: routes over the existing `addAlias` + list/delete wrappers + tab | S | — |
| **A4.2** | Quotas: `edit/mailbox` wrapper, provisioning-form field, usage view | S | — |
| **A4.3** | Domains tab, drift view, DKIM surfacing | M | — |
| **A4.4** | Bulk provisioning (resolve/process, from users then CSV) | M | A4.2 |
| **A4.5** | Lifecycle: suspend, guarded delete, ownership transfer, orphan reconcile | M | A4.1 |
| **A4.6** | HR-onboarding hook | S | A4.4 |

A4.1 and A4.2 are mostly plumbing over code that already exists and should go
first for the ratio of value to effort.

## Constraints and risks

- **`kind` is `mailcow`-only.** Every capability here is mailcow admin API. Keep
  it behind the `kind` discriminator so a second server type is additive; do not
  let mailcow assumptions leak into `mail-account`.
- **`isConfigured` must gate every screen.** Without `MAILCOW_BASE_URL` /
  `MAILCOW_API_KEY` or a registered `mail-server` row, these tabs show a
  configuration prompt, never a broken grid.
- **Destructive operations reach a real mail server.** Delete-mailbox destroys
  mail outside the ERP's backups entirely. Suspend-first, confirm-by-name.
- **A mailcow-connected provision has still never been exercised end to end** —
  the email program records `MAILCOW_BASE_URL` unset in dev and the
  `contact@rutba.pk` password failing 535. Every phase here needs a live mailcow
  to verify against; that is a prerequisite, not a testing detail.
- **Quota changes are set-once today**, so early mailboxes are all 1 GB. A4.2
  should include a one-off sweep to bring existing mailboxes to the intended
  default rather than leaving a silent two-tier estate.
- Per T6, mail domains and server registrations are per-tenant configuration and
  seed per tenant, never once globally.
