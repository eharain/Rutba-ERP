# Email Program — Usability Gap Analysis vs Market Leaders

> **Status update (2026-08-15): the daily-driver slice of P1 is BUILT**
> (production build green; api-provider validators green). Archive and
> read/unread as verbs · keyboard shortcuts (j/k/Enter/u/r/a/f/e/s/m/#//,c,
> `?`, Ctrl+Enter, Esc) · draft resume with replace-on-save, 45s auto-save and
> save-on-close · attachment preview for images and PDFs over selective
> `BODY[<part>]` fetch · multi-folder unseen polling with a client-side
> refresh and a new-mail banner · the shared-inbox collision banner from
> [05](./05-shared-inboxes.md) · flag as a bulk action · `\Answered` set when
> a reply is sent · delete confirmation on single and bulk.
>
> Two things came out of that work that were not on this list. First,
> **reading never marked messages read in the first place** — imapflow peeks,
> so `getMessage`'s hardcoded `seen: true` was a lie and messages reverted to
> unread on refresh; `\Seen` is now an explicit decision, which is also what
> makes preview-without-marking-read a real setting. Second, **drafts silently
> dropped Bcc** — nodemailer strips the header unless `keepBcc` is set.
>
> **Still untested against a live mailbox.** The stored `contact@rutba.pk`
> credential still fails authentication against `mail.trustlist.uk:993` (the
> host answers; the password does not work), so every behaviour above is
> verified by build, by unit-level checks of the pure functions, and by
> compiling the exact IMAP commands each path emits — not by a round trip to a
> real mailbox. The human browser pass is STILL outstanding.

> **Status update (2026-08-10, later): the P0 wave + the named must-haves are
> BUILT** (21/21 smoke, production build green). Address books (personal +
> company directory, `mail-contact`), tags (`mail-tag` registry → IMAP
> keywords, chips/filter/bulk-tag), advanced filters (structured IMAP SEARCH:
> unread/flagged/from/to/subject/dates/tag + filter bar), conversation
> threading v1 (normalized-subject groups), bulk actions (one uid-set IMAP
> round-trip), rich-text compose (dependency-free contentEditable editor),
> recipient autocomplete (address book + person spine + CRM, deduped),
> snippets (`mail-snippet`, personal + team, insert-in-compose), inline
> shared-inbox notes (work-item comments, import-on-first-note), and mailbox
> password reset (mailcow edit via registry, shown once). Still open below:
> the P1/P2 tiers, and the backend-split decision.

> Written 2026-08-10, after M0–M6 + the User-Management marriage. Method:
> feature-by-feature walk of every built screen against the tools users will
> compare us to. **Caveat: this is a code-level review; the human browser
> pass is still outstanding** (agent browser doesn't hydrate React), and a
> few of these calls — especially information-density and speed-feel — need
> a real session to confirm.
>
> Framing rule: the ERP mail client does not win by out-Gmailing Gmail. It
> wins on what Gmail cannot do — mail attached to orders, contacts, tickets
> and campaigns in one system. The gaps that matter most are the ones that
> make DAILY use painful enough that staff keep Gmail open in the next tab;
> those are P0 regardless of how "advanced" they sound.

## 1. Mail client (rutba-mail) vs Outlook / Gmail / Thunderbird

What we have that they don't: Link-to-record (person/contact/customer/
order), CRM timelines, shared-inbox triage in the same pane, role-gated
shared access, no per-seat license.

| Capability | Gmail/Outlook | rutba-mail today | Verdict |
|---|---|---|---|
| Conversation threading | Core UX | Flat message list; References/In-Reply-To captured on reply but not used for display | **P0 — the single loudest gap.** Group the list by thread (subject+References heuristic is enough for v1) |
| Compose editor | Rich text, inline images | Plain textarea + auto-HTML wrap, signature append | **P0** — PrimeReact ships Quill (`Editor`); already a dependency, low-cost upgrade |
| Recipient autocomplete | Contacts + history | Free-typed addresses | **P0** — we OWN the person spine; `/api/persons` search on To/Cc is a half-day and beats Gmail (it knows your customers) |
| Bulk actions (select many → read/delete/move) | Core | One message at a time | **P0** |
| Unified "all inboxes" view | Outlook/Thunderbird yes | Per-account switcher only | **P1** — valuable once staff hold 2+ shared boxes |
| Mark read/unread from list, archive | Core | Open-to-read only; delete/move exist, no archive verb | **P1** — archive = move to Archive folder, cheap |
| Keyboard shortcuts | Deep (j/k, e, r) | None | **P1** — even 5 keys (nav, reply, archive) changes speed-feel |
| Undo send | Both | No | **P2** — needs delayed submit; nice, not blocking |
| Snooze / remind | Gmail | No | **P2** — pairs with triage reminders (see §2) |
| Attachment preview | Inline viewers | Download only | **P1** for images/PDF (browser-native `<iframe>`/`<img>`) |
| Search | Instant, cross-folder, operators | Server-side IMAP SEARCH per folder | **P1** — add cross-folder search on the selected account; imported messages are DB-searchable already |
| Offline | Partial | None (live-IMAP by design) | Non-goal — recorded ADR |
| Filters/rules, labels | Deep | Folders only (server-side) | **P2** — rules belong on the mail server (mailcow sieve), not the ERP; at most link to webmail sieve editor |
| Spam controls | Deep | Server-side only | Non-goal — mailcow owns rspamd |
| New-mail notification | Push/badge | 2-min unseen-count cron → folder badges | **P1** — wire the existing notification engine to unseen deltas for shared boxes at least (spec'd in M1, deferred) |

## 2. Shared inboxes vs Front / Missive / Zendesk

We already have the skeleton the entry-level tools charge $19–29/seat for:
triage states, assignment with audit trail, internal comments, role-based
access, CRM linkage on every message.

| Capability | Front/Missive | Us | Verdict |
|---|---|---|---|
| Assignment + audit | Yes | Yes (work-item reuse) | Parity |
| Internal notes on a thread | Inline in conversation | In the triage queue dialog only, not in the main reading pane | **P0** — surface the same work-item comments in MessageView when the account is shared |
| Collision detection ("Ali is replying…") | Core differentiator | None | **P1** — v1 = "assigned to X" banner in MessageView + warn when replying to a message assigned to someone else. True presence needs websockets — defer |
| Canned replies / snippets | Yes | No | **P0** — shared boxes live on repeated answers; a `mail-snippet` CT + insert button in compose is small |
| Reply-from-shared with personal sign-off | Yes | Shared signature only (per-user deferred in M3) | **P1** |
| Tags/topics on conversations | Yes | Triage status only | **P2** — mail-links to entities already cover most "what is this about" |
| SLA timers, response analytics | Yes | No | **P2** — needs imported-message timestamps we already store; report later |
| Round-robin auto-assign | Yes | Manual assign | **P2** |

## 3. Campaigns (rutba-campaigns) vs Mailchimp / Brevo

| Capability | Mailchimp/Brevo | Us | Verdict |
|---|---|---|---|
| Template editor | Drag-drop + gallery | GrapesJS newsletter studio, merge keys, test send | Parity in kind; gallery of 3–5 house templates would help adoption — **P1** |
| Audiences | Segments, forms, imports | Static + filter over crm-contact/customer/person; counts cached | Parity for internal use; CSV **upload UX** (file → mapped columns) vs paste — **P1** |
| Scheduling, recurrence | Yes | Yes (freq/interval/max-runs/failure ledger) | Parity |
| Delivery reporting | Rich dashboards | Run counters + per-recipient grid + events | Parity for v1 |
| Open/click tracking | Yes | Yes (M6 local pixel/redirect, unique counts) | Parity; add click-by-URL breakdown table on the run page (data already in `tracked_links` + events) — **P1** |
| A/B testing | Yes | No | **P2** — M7 as planned |
| Journeys/automation | Yes | No | **P2** — M7 |
| Suppression list browsing | Yes | Counts only; MTA owns the list | **P1** — read-only suppression browser in settings (MTA API exists); without it admins can't answer "why didn't X get it" |
| Deliverability tooling (DKIM/SPF health) | Yes | No | **P2** — belongs to mailcow/MTA; a status card querying the MTA would do |
| Unsub landing/preference center | Yes | MTA RFC-8058 unsubscribe | Adequate; preference center is M7-adjacent |

## 4. User-management email config vs Google Workspace / M365 admin

| Capability | Workspace Admin | rutba-users | Verdict |
|---|---|---|---|
| Create user + mailbox in one flow | Yes | Yes (invite + assign-address auto-provision) | Parity — genuinely competitive |
| Server registry / multi-domain | N/A (they are the server) | mail-server registry, domain-driven resolution | Ours is the right shape for self-hosted |
| Shared mailbox admin | Yes (delegation) | Estate map: owners + access_roles, validated | Parity |
| **Mailbox password reset** | Yes | **Missing** — spec'd in 06 (custody rules) but never built | **P0 — the one true admin gap.** Without it, a user who wants phone/webmail access has no path except the mailcow UI we promised to hide |
| Aliases / groups (support@ → several) | Yes | Design-only (Phase 6 email-group) | **P1** — replaces ORDER_ALERT_EMAIL too |
| Quota view/edit | Yes | Set at provision; never shown after | **P2** — surface mailcow quota/usage on the mailbox row |
| Mailbox deletion / offboarding | Yes | Deferred (delete connection only) | **P1** — offboarding needs "disable mailbox + reassign shared" checklist |
| Audit log of access changes | Yes | work-item audit exists for triage, not for access grants | **P2** |

## 5. Cross-cutting friction (ours alone)

- **Role-grant lag:** api-pro's 30s claim cache means "give Sara the support
  inbox" takes up to 30s + refresh to take effect, with no feedback. Add a
  cache-bust on setAccess/setAppRoles (the users session already clears on
  app_roles writes — mail access_roles changes should clear affected users
  too) or surface "takes effect within a minute" in the UI. **P1**
- **Backend split:** the mail client's live-IMAP surface exists only on
  pos-strapi (:4010) while the fleet default is rutba-core (:4020). Until a
  core `mail` module tranche lands, deploys must pin rutba-mail's API at
  pos-strapi or users get a dead inbox. **P0 decision, not code.**
- **Human browser pass** of rutba-mail / rutba-users / rutba-campaigns is
  still outstanding; do it before any P0 build so real friction reorders
  this list.

## Priority summary

**P0 (make daily use survivable): ✅ ALL BUILT 2026-08-10** — threading in
the message list (subject-group v1; References-chain upgrade recorded) ·
rich-text compose (custom contentEditable, not PrimeReact Editor — avoids the
quill dependency and its SSR gate) · recipient autocomplete (address book +
person spine + CRM) · bulk actions · internal notes inline in shared
MessageView · canned snippets · mailbox password reset · plus the user-named
must-haves: personal/global address books, tags, advanced filters.
**Still open from P0: the backend-split decision** (core `mail` module vs
pinning rutba-mail at pos-strapi).

**P1 (retention): the daily-driver half is BUILT 2026-08-15** — archive/unread
verbs · shortcuts · attachment preview · new-mail notifications · collision
banner · plus flag-as-bulk, `\Answered` on reply, delete confirmation, and
draft resume (which the table above never listed, because the gap was
invisible until someone tried to finish a half-written mail).

*Still open in P1:* unified inbox and cross-folder search — both blocked on
the message-index decision, deliberately not started · per-user shared
signature · CSV import UX · click-by-URL report · suppression browser ·
email-groups/aliases · offboarding flow · role-grant lag fix.

**P2 (parity chasing — schedule, don't rush):** A/B + journeys (M7) · SLAs ·
snooze/undo · tags · deliverability card · quota surfacing · access audit.
