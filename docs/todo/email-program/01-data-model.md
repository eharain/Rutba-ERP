# Email Program — Data Model

Prefix `mail-`, all `draftAndPublish: false`. Only `mail-account` is built in
M0; the other three are specified here and built in M2. Nothing about a
*browsed* message is ever stored — rows exist only for accounts, and for
messages that were explicitly imported/linked.

## `mail-account` (M0)

One row per connected mailbox — personal or shared.

| Field | Type | Notes |
|---|---|---|
| `name` | string, required | display name ("Support Inbox", "Ejaz — work") |
| `kind` | enum `personal\|shared`, default `personal` | drives UI grouping + access expectations |
| `email` | string(email), required | the mailbox address; default From |
| `from_name` | string | |
| `reply_to` | string | |
| `imap_host` | string, required | |
| `imap_port` | integer, default 993 | |
| `imap_secure` | boolean, default true | true = implicit TLS; false = STARTTLS |
| `imap_username` | string | blank → falls back to `email` |
| `imap_password_enc` | text, **private** | AES-256-GCM ciphertext `v1:iv:tag:ct` — see 08 |
| `smtp_host` | string, required | |
| `smtp_port` | integer, default 465 | |
| `smtp_secure` | boolean, default true | |
| `smtp_username` | string | blank → falls back to `imap_username` → `email` |
| `smtp_password_enc` | text, **private** | blank → reuse the IMAP password |
| `signature_html` | text | sanitized on save (`sanitizeSignature`) |
| `provisioning_source` | enum `byo\|mailcow`, default `byo` | mailcow rows are managed by M5 |
| `special_folders` | json | detected SPECIAL-USE map `{sent, drafts, trash, junk, archive}`; cached at validate/first connect |
| `unseen_counts` | json | written by the M1 poller: `{"INBOX": 4, ..., "checked_at": ISO}` |
| `is_active` | boolean, default true | inactive = pool refuses, poller skips |
| `last_checked_at` | datetime | last successful IMAP op |
| `last_error` | text | last failure, for the settings screen |
| `owners` | manyToMany → UP user | **the access list** (repo convention) |

Access model (M0): `personal` = exactly one owner (enforced in controller);
`shared` = many owners. `mail_admin` sees every account. M3 adds
`access_roles` (json list of app-role keys) so a shared inbox can be opened to
"everyone in support" without enumerating users.

## `mail-message` (M2)

Materialized **only** via `importMessage` or a triage action on a shared inbox.

| Field | Type | Notes |
|---|---|---|
| `account` | manyToOne → mail-account | |
| `message_id` | string, required-ish, indexed | RFC 5322 Message-ID — the durable identity |
| `dedupe_hash` | string, indexed | sha256(date+from+subject+size); used when Message-ID is absent |
| `folder` | string | last-known IMAP folder — **advisory**, can go stale |
| `imap_uid` | biginteger | advisory; only valid together with `uidvalidity` |
| `uidvalidity` | biginteger | |
| `direction` | enum `inbound\|outbound` | |
| `from_email` / `from_name` | string | |
| `to_json` / `cc_json` / `bcc_json` | json | `[{address, name}]` |
| `subject` | string | |
| `date` | datetime | header date |
| `snippet` | string | first ~200 chars of text |
| `body_html` | text | **sanitized at import** (same pipeline as live view) |
| `body_text` | text | |
| `headers_json` | json | selected headers only (References, In-Reply-To, List-Id, …) |
| `has_attachments` | boolean | |
| `size_bytes` | integer | |
| `triage_status` | enum `none\|open\|assigned\|awaiting\|closed\|spam`, default `none` | `none` = personal/linked-only import (not a queue item) |
| `assigned_to` | manyToOne → UP user | direct FK — crm-lead/contact-ticket precedent |
| `imported_by` | manyToOne → UP user | |
| `owners` | manyToMany → UP user | copied from account owners at import time |

**Idempotency rule:** unique per `(account, message_id)`; when `message_id` is
blank, `(account, dedupe_hash)`. Re-importing returns the existing row and
merges the new links into it. Enforced in the import service (not a DB
constraint — Message-ID duplicates exist in the wild; the service is the
arbiter).

## `mail-link` (M2)

Polymorphic link — the work-item-* pattern (`entity_uid` +
`target_document_id`) rather than direct FKs.

| Field | Type | Notes |
|---|---|---|
| `mail_message` | manyToOne → mail-message | |
| `entity_uid` | string, required | `api::person.person`, `api::crm-contact.crm-contact`, `api::sale-order.sale-order`, `api::contact-ticket.contact-ticket`, … |
| `target_document_id` | string, required | |
| `link_kind` | enum `manual\|auto\|triage` | `auto` = from-address matched person.email |
| `linked_by` | manyToOne → UP user | null for `auto` |

Composite uniqueness `(mail_message, entity_uid, target_document_id)` enforced
in the service.

**Tradeoff record — polymorphic vs direct FKs.** Direct FKs would give Strapi
populate and referential integrity, but every new linkable entity is a schema
+ descriptor + UI migration (4 nullable FKs today, 8 next year). The
polymorphic table matches work-item-comment/watch/activity exactly, is one
indexed query per timeline (`WHERE entity_uid = ? AND target_document_id = ?`),
and costs only a second query to hydrate messages by id. Chosen: polymorphic.

## `mail-attachment` (M2)

| Field | Type | Notes |
|---|---|---|
| `mail_message` | manyToOne → mail-message | |
| `filename` | string | |
| `content_type` | string | |
| `size_bytes` | integer | |
| `checksum` | string | sha256 of the decoded part |
| `cid` | string | inline content-id, nullable |
| `file` | media (single) | stored via the upload provider in a dedicated folder |

Deliberately **not** bare upload-plugin files: the global media library has no
per-file ACL, so private attachments must only ever be reached through
mail-attachment's own gated routes. Caveat + future private-storage option
recorded in [`08-security.md`](./08-security.md).

## What was considered and rejected

- **`mail-signature` CT** — per-account `signature_html` suffices; per-user
  signatures on shared accounts is an M3 decision point.
- **`mail-account-access` CT** — `owners` + (M3) `access_roles` cover it.
- **Thread/conversation CT** — threading is computed client-side from
  References/In-Reply-To (M1); persisting conversations only matters if
  helpdesk-grade ticketing lands here, which is the helpdesk program's job.
