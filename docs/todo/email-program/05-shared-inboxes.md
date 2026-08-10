# Email Program — Shared Inboxes & Triage (M3)

A shared inbox is just a `mail-account` with `kind='shared'` and several
`owners`. Everyone with access reads the same live IMAP mailbox; triage state
lives in the ERP, keyed to materialized messages.

## Access model

- M0: `owners` manyToMany **is** the access list. `mail_admin` sees all
  accounts; `mail_manager` can create/edit accounts; staff see accounts they
  own.
- M3: `access_roles` (json list of app-role keys, e.g. `["crm_staff"]`) so a
  team inbox opens to a role without enumerating users. Checked in
  `ensureAccountAccess` alongside owners.
- Personal accounts hard-enforce a single owner; nobody else — not even
  managers — reads them. Only `mail_admin` can *delete* (not read) any account.

## Triage lifecycle

Triage state lives **on `mail-message`** (`triage_status`, `assigned_to`) —
one-table queue filters, the crm-lead/contact-ticket precedent.

- `none` — imported for linking only; not a queue item.
- `open` → `assigned` → `awaiting` (waiting on customer) → `closed`; `spam`.
- **A triage action on a live (unimported) message materializes it first**:
  assign = import + assign, atomically from the user's point of view. This is
  the import-on-demand rule doing double duty — the queue only ever contains
  real rows, and unhandled mail lives only in the mailbox (where it is visibly
  unhandled).

## Collaboration — reuse, don't rebuild

Keyed `entity_uid='api::mail-message.mail-message'`,
`target_document_id=<message documentId>`:

- `work-item-comment` — internal notes on a message (never emailed out).
- `work-item-watch` — follow a message; toggle route exists.
- `work-item-activity` — append-only audit (assigned/transition/comment kinds)
  via `src/utils/work-item-activity.js` `logActivity()` — call it from every
  triage chokepoint.

## Collisions

Two agents opening the same message is normal (IMAP has no locks):

- Assignment is last-write-wins **with visibility**: the queue shows
  `assigned_to` live, and `logActivity` records reassignment; a reassign
  prompts "already assigned to X — take over?".
- Reply collisions are mitigated socially (assignment + `\Answered` flag
  visible in the list), not by locking. Helpdesk-grade concurrency control is
  the helpdesk program's job; this stays a mail client.

## Notifications (M3)

- Assignment fires the notification engine (`processEvent` with an
  `mail.assigned` event) → in-app; email only for critical per engine rules.
- New-mail-in-shared-inbox badge comes from the M1 unseen-count poll; a
  per-account "notify on new mail" toggle decides whether it also raises an
  in-app notification.

## Send-as semantics

Replies from a shared inbox send through the shared account's SMTP (the
account IS the identity — `From: support@…`). The agent's name may appear in
`from_name` ("Rutba Support — Ayesha") as a per-account format option (M3).
