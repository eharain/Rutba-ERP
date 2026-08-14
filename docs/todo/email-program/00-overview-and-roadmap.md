# Email Program — Overview & Roadmap

> **Status (2026-08-10): ✅ M0–M6 + the usability P0 wave built.** The P0
> wave (from `09-usability-gap-analysis.md`, all smoke-verified 21/21):
> personal + company address books (`mail-contact`), tag registry
> (`mail-tag` → IMAP keywords, so tags live on the mail server), snippets
> (`mail-snippet`), advanced filters as one structured IMAP SEARCH,
> conversation grouping, uid-set bulk actions, rich-text compose with
> ERP-wide recipient autocomplete, inline shared-inbox notes
> (import-on-first-note), and one-click mailbox password reset through the
> mail-server registry. Earlier status history follows.

> **Status (2026-08): ✅ M0–M6 built** (M0 + the same-day continuation).
> M6 (campaigns Phases 4–5 + identity layer): local open/click tracking —
> the §5 decision taken as **option (b)** since Rutba-MTA scopes generic
> tracking out (`FUNCTION.md` "out of scope for now"); `{{_trk}}` merge-key
> tokens keep per-recipient attribution inside ONE MTA batch; public
> `/api/cmp/t/o/:token` pixel + `/api/cmp/t/c/:token/:link` redirect
> (destination resolved server-side from `cmp-run.tracked_links` by index —
> no open redirect); unique-recipient `opened`/`clicked` counters;
> `cmp-recipient` → person/crm-contact/customer resolution by email at run
> time; campaign send/first-open/first-click each write a `crm-activity` on
> contact-matched recipients; `/api/persons` read-only client surface (crm,
> mail, campaigns apps) + Person option in the mail LinkPicker; run page
> shows opens/clicks, composer gained track_opens/track_clicks toggles.
> Verified 19/19 (M6 smoke: instrumentation purity, live pixel/redirect,
> dedupe, tamper cases, activity tie-in, persons gating). Still unexercised:
> an MTA-connected send carrying `_trk` end-to-end (`MTA_BASE_URL` blank in
> dev). Deferred from M6: the suppression-respect check before shared-inbox
> bulk actions (07 §where-they-meet), and deeper person↔crm-contact
> unification (belongs to the contact-unification program).
> M1: transfer/move, drafts (APPEND), unseen-count cron (`mail-cron-tasks.js`,
> `MAIL_CRON_ENABLED`), folder badges. M2: `mail-message`/`mail-link`/
> `mail-attachment` (metadata-only MVP — binary snapshots recorded as the
> upgrade), idempotent `createImport`, LinkPicker in the reading pane,
> crm-activity Email entries, Mail timeline on the CRM contact page.
> M3: `access_roles` on shared accounts, triage queue pages
> (`/shared`), assign/status routes with work-item audit + comments reuse,
> `mail.assigned` notification event (fires once a notification-template row
> exists for it). M4: audience resolver, campaign runner + failure ledger,
> `campaign-cron-tasks.js` (due sweep + report poll, `CAMPAIGNS_CRON_ENABLED`
> consumed at last), public HMAC-verified `/api/cmp/webhook`, audiences/
> composer/runs UI. M5: `mailcow-client.js` + one-click provision
> (needs `MAILCOW_BASE_URL`/`MAILCOW_API_KEY`).
>
> **Verified:** 31/31-check API smoke across M1–M5 (plus the original 22-check
> M0 suite) against the live dev stack; production builds of rutba-mail,
> rutba-campaigns, rutba-crm pass. **Still pending:** the live-mailbox happy
> path — ALL company mailboxes live on the mailcow at **mail.trustlist.uk**
> (the env files' old smtp.hostinger.com entries were stale and are now
> corrected), but the stored contact@rutba.pk password fails 535 there too
> (tested 465/587/993, also as no-reply@) — reset the mailbox password in
> mailcow, then either put it in `POS_STRAPI__EMAIL_PASS` or connect the box
> via Settings. Also pending: a human browser pass (agent pane doesn't
> hydrate React), an MTA-connected campaign send (`MTA_BASE_URL` blank in
> dev), and a mailcow-connected provision
> (`MAILCOW_BASE_URL=https://mail.trustlist.uk` + an admin API key).
>
> Original M0 record: Spec set + gateway + `mail-account` API +
> `rutba-mail` (:4021, registered at all seven points) + 3-pane client,
> compose, and account settings — one session.
>
> **Verified** (22-check API smoke against the live dev stack): domain/policy
> seeding (24 domains, 862 methods, 4039 policies), role gating (role-less →
> 403; `mail_admin` → 200), AES-GCM credential storage (ciphertext in DB, no
> plaintext, never serialized), password-less PUT preserves the stored secret,
> bogus-host validate fails structured within the deadline (~200ms, no hang),
> and the gateway reaches real IMAP/SMTP servers with clean error mapping.
> Production `next build` passes.
>
> **NOT yet verified: the live-mailbox happy path** (folders/read/send/APPEND)
> — the `contact@rutba.pk` password in the env files no longer authenticates
> against smtp/imap.hostinger.com (535 on both, confirmed directly). Finish by
> connecting any working mailbox in the UI (Settings → Connect Mailbox → Test
> Connection). The browser UI also needs one human pass — React does not
> hydrate in the agent's browser pane (known repo-wide gap, campaigns doc §0).
>
> **Two implementation lessons recorded** (bit us during verification):
> Strapi 5 core routes bind `:id`, not `:documentId` — overridden core CRUD
> must read `ctx.params.id`; and UP-user relations (`owners`) are rejected by
> the content-API input validator and silently DROPPED from query filters —
> strip-and-apply via the trusted query layer (the crm-lead pattern), never
> pass them through ctx.query/body.

The umbrella program for everything email in Rutba ERP:

1. **A dedicated mail client** (`rutba-mail`, **:4021**) — users read and send
   from their **own** mailboxes and from **shared** team mailboxes (support@,
   sales@), without leaving the ERP.
2. **Deep CRM/customer linkage** — an email can be attached to a person,
   CRM contact, sale order, or ticket, and shows up on those records' timelines.
3. **Campaigns** — the in-flight `rutba-campaigns` module (:4019, phases 2–6
   outstanding) is sequenced by this roadmap; see
   [`07-campaigns-integration.md`](./07-campaigns-integration.md).

## The architecture decision that shapes everything (ADR)

**Live-IMAP gateway, import-on-demand.** The ERP does **not** sync or mirror
mailboxes. It reads folders and messages **live from the mail server** through
a pooled IMAP connection, exactly like webmail (Roundcube model). A message
becomes a database row **only when it is linked** to something — a person,
contact, order, ticket, or a shared-inbox triage action. The mail server stays
the source of truth; the ERP stores credentials, links, and the small set of
imported messages.

Why (decided with the user, 2026-08):

- No sync engine: no flag reconciliation, no deletion mirroring, no drift.
- No storage blowup: mail bodies/attachments stay on the mail server.
- Privacy by default: the ERP database only holds business-relevant mail.
- Proven shape: stateless-ish IMAP webmail is 20-year-old, well-trodden ground.

Costs, and how they're paid:

- **Latency** → connection pool (one live `imapflow` client per active account,
  idle-evicted), so a request is one IMAP round-trip, not TLS+login.
- **Unread badges / new-mail alerts** → a cheap `STATUS (UNSEEN)` cron poll
  (M1), not IDLE. IDLE/push would graduate the pool into a standalone worker
  (marketplace-worker pattern) — only if ever needed.
- **Cross-entity timelines need persisted rows** → that's what import-on-link
  is; see [`04-crm-linkage-and-identity.md`](./04-crm-linkage-and-identity.md).

> **Under examination (2026-08-14).** [`10-index-decision.md`](./10-index-decision.md)
> tests this ADR against [`09`](./09-usability-gap-analysis.md)'s findings and
> recommends **qualifying** it, not reversing it: a headers-only envelope index,
> with **bodies still never stored**. Body search, cross-folder search,
> cross-account search, unified inbox and real threading turn out to be one
> missing capability rather than five features. Not yet ratified.

Mailbox onboarding is **bring-your-own IMAP/SMTP first** (works with the
mailcow at mail.trustlist.uk, Hostinger, Gmail app-passwords — anything), with
**mailcow admin-API provisioning** as its own phase
([`06-mailcow-provisioning.md`](./06-mailcow-provisioning.md)).

## Document map

| Doc | Contents |
|---|---|
| [`01-data-model.md`](./01-data-model.md) | `mail-account` / `mail-message` / `mail-link` / `mail-attachment`, identity + idempotency rules |
| [`02-imap-gateway.md`](./02-imap-gateway.md) | Pool, mutex, deadlines, op API, sanitization, SMTP send + APPEND |
| [`03-mail-client-app.md`](./03-mail-client-app.md) | `rutba-mail` screens/components, registration checklist |
| [`04-crm-linkage-and-identity.md`](./04-crm-linkage-and-identity.md) | Import-on-link, person as email spine, timelines |
| [`05-shared-inboxes.md`](./05-shared-inboxes.md) | Shared accounts, triage lifecycle, work-item-* reuse |
| [`06-mailcow-provisioning.md`](./06-mailcow-provisioning.md) | mailcow admin API, provision flows, password custody |
| [`07-campaigns-integration.md`](./07-campaigns-integration.md) | How this program sequences rutba-campaigns 2–6 |
| [`08-security.md`](./08-security.md) | Credential crypto, HTML threat model, ACLs, timeouts |
| [`09-usability-gap-analysis.md`](./09-usability-gap-analysis.md) | Feature-by-feature walk against Gmail/Outlook, Front/Missive, Mailchimp/Brevo |
| [`10-index-decision.md`](./10-index-decision.md) | **Does this ADR survive 09?** Recommends a headers-only envelope index (bodies never stored) and names MODSEQ as the prerequisite |

Campaigns' own spec stays authoritative for campaigns internals:
[`../rutba-campaigns-implementation.md`](../rutba-campaigns-implementation.md).

## Umbrella roadmap

| Phase | Contents | Size | Depends on |
|---|---|---|---|
| **M0** ✅ | Spec set + `mail-account` CT + credential crypto + IMAP gateway (pool / folders / list / read / flags / delete / send+APPEND / validate) + routes/descriptors/`mail` domain + full app registration + 3-pane inbox + compose + settings | M | — |
| **M1** ✅ | `transferMessage` (move), drafts (APPEND Drafts), `mail-cron-tasks.js` unseen poll (`MAIL_CRON_ENABLED`), folder badges. *Deferred within M1: threading UI, attachment streaming, notification-template for new-mail* | M | M0 |
| **M2** ✅ | `mail-message`/`mail-link`/`mail-attachment` CTs (attachment metadata only — binary snapshots deferred), idempotent `importMessage`, LinkPicker UI, `crm-activity` Email entries, Mail timeline on CRM contacts. *Deferred: auto-link rules, person picker (needs person client endpoints — M6), order-page timeline* | M | M0 |
| **M3** ✅ | `access_roles`, triage queues (`/shared`), assign/status routes + work-item audit/comments, `mail.assigned` event. *Deferred: per-user signatures on shared accounts* | M | M2 |
| **M4** ✅ | Audience resolver, runner + failure ledger, `campaign-cron-tasks.js`, HMAC `/api/cmp/webhook`, report poller, audiences/composer/runs UI. *Recorded bound: one MTA batch per run* | M+M | — (parallel track) |
| **M5** ✅ | `mailcow-client.js`, one-click provision (mailbox + connected account, encrypted generated password). *Deferred: HR-onboarding hook, alias management, delete-mailbox flow* | M | M0 |
| **M6** ✅ | Local open/click tracking (option b: `{{_trk}}` tokens, public pixel/redirect, server-side link table), campaign → crm-activity tie-in (send + first open + first click), `cmp-recipient` → person/contact/customer by email, `/api/persons` client surface + LinkPicker Person. *Deferred: suppression check on shared-inbox bulk actions; MTA-connected `_trk` send unexercised* | M | M2, M4 |
| **M7 — Campaigns 6 automation** | A/B, nurture journeys, lead scoring (scoped separately per campaigns doc §9) | L | M4 |

M4 can run in parallel with M1–M3 — it shares no code with the mail client,
only the roadmap and (from M6) the person identity layer.

## What this program does NOT do

- No POP3, no Exchange/EWS/Graph — IMAP/SMTP only. (Graph/EWS would be a new
  adapter behind the same gateway API if ever demanded.)
- No mail hosting inside the ERP — mailcow (or any provider) hosts; we connect.
- No full-text index of unimported mail — search is server-side IMAP SEARCH.
  ([`10`](./10-index-decision.md) recommends an **envelope** index, which is not
  a full-text index and does not change this line's intent.)
- Campaigns continue to send through **Rutba-MTA**, never through a user's
  personal SMTP (see 07 §identity separation).
