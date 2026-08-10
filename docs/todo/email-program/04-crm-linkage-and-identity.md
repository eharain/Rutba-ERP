# Email Program — CRM Linkage & Identity (M2, M6)

The point of having mail *inside* the ERP: an email attaches to the records it
concerns, and those records show their mail.

## `person` is the email-identity spine

`api::person.person` is the canonical human ("one row per real human", with
`email`, `user` link, and merge machinery). Contact-unification Phase 1A wired
`sale-order` and `contact-ticket` to it; `crm-contact`/`customer` are still
unlinked (their turn comes with the wider unification work).

For mail this means:

- **Auto-link suggestion** (M2): when viewing a message, look up
  `person.email $eqi from_email` (and to/cc for outbound) → suggest
  "Link to <person>" one click away. `link_kind='auto'` when accepted
  automatically by rule (M3+), `'manual'` when clicked.
- Until crm-contact is person-linked, the LinkPicker searches persons, CRM
  contacts, customers, orders, and tickets **separately** — the link table
  doesn't care (`entity_uid` + `target_document_id`).
- M6 folds campaigns into the same spine: `cmp-recipient` gains a person
  relation, so "every email we ever exchanged with this human" — personal,
  shared-inbox, and campaign — is one timeline query family.

## Import-on-link flow (M2)

1. User clicks **Link** on a live message (or a triage action fires on a
   shared inbox — see 05).
2. `createImport` → gateway `importMessage(account, folder, uid, links[])`:
   - fetch BODY[], `mailparser` parse, sanitize;
   - idempotency check `(account, message_id)` / `(account, dedupe_hash)` —
     existing row wins, links merge;
   - create `mail-message` (+ `mail-attachment` rows, files via upload
     provider) + `mail-link` rows;
   - write a `crm-activity` (`type: 'Email'`, subject, date, contact) when the
     link target is a crm-contact — the CRM dashboard already surfaces
     activities;
   - `logActivity()` (work-item-activity) on the message for the audit trail.
3. The live view now shows a "linked" badge; the target record's timeline
   shows the message.

Unlinking removes the `mail-link` row; the message row stays (it may have
other links, comments, or triage history). A message with zero links and no
triage history may be garbage-collected — retention decision deferred to M3.

## Timelines (M2)

- **rutba-crm** contact/lead pages and **rutba-order-management** order pages
  gain a "Mail" panel: `mail-links?entity_uid=…&target_document_id=…` →
  hydrate messages → list with snippet, direction arrow, date; click opens a
  read-only MessageView (imported copy — works even if the mail server no
  longer has the message).
- The panel writes nothing itself; linking happens in rutba-mail (or via the
  auto-rule later). Keeps the CRM apps read-only consumers.

## Compose from CRM (M2)

"Email this contact" buttons in rutba-crm / order pages deep-link into
rutba-mail compose (`/`?compose=1&to=…&link=api::crm-contact.crm-contact:abc`)
with the link target pre-attached — sending then imports the outbound message
automatically (direction `outbound`, `link_kind='manual'`).

## What auto-linking must NOT do

- Never auto-import bulk/newsletter mail (List-Id / Precedence: bulk headers
  present) — suggestion only.
- Never auto-link on domain match alone (everyone @bigcorp.com is not one
  person).
- Auto-rules are per-account opt-in and land M3+, after the manual flow has
  taught us the false-positive shapes.
