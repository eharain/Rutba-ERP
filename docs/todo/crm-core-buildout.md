# CRM core build-out — typed timeline + saved segments

Roadmap item **0.6** (H0, size M). Implements §5.1 and §5.3 of the CRM plan in
[rightapp-gap-analysis/README.md](./rightapp-gap-analysis/README.md). Additive
depth on the existing `crm-*` module — no new app, no new port.

> **Status:** landed. §5.2 (pipeline), §5.4 (bulk import), §5.5 (associations),
> §5.6–5.9 remain future work. See "Not in this tranche" below.

---

## The two design decisions worth knowing

### 1. The typed timeline does NOT replace `crm-activity` with `work-item-activity`

The tree already carries an entity-agnostic collaboration primitive
(`work-item-comment` / `-watch` / `-activity`, keyed by `entity_uid` +
`target_document_id`). The obvious move is to fold CRM touches into it. We
deliberately didn't, because the two record different things:

| | `work-item-activity` | `crm-activity` |
|---|---|---|
| Author | system | human |
| Records | what CHANGED on a record (transition, assign, watch) | a customer TOUCH (call, meeting, mail) |
| Occurred-at | is `createdAt` | separate `date` — you log yesterday's call today |
| Mutability | append-only audit | editable |
| Payload | `kind` / `from` / `to` / free `data` json | direction, outcome, duration, follow-up, attachments |

The typed payload is the point: §5.3 segment rules filter on activity type,
call outcome and last-touch date. Stuffing those into the audit trail's `data`
json makes them unfilterable, and widening the audit schema with CRM-only
columns makes it not-generic. So:

- **Touches** stay on `crm-activity` (extended).
- **Collaboration** — comments and watchers on a contact — uses the shared
  work-item primitive with `entity_uid = 'api::crm-contact.crm-contact'`.
  CRM has **no** comment table of its own.
- `GET /crm-activities/timeline` **merges both** server-side into one
  reverse-chronological feed, so the UI reconciles nothing.

`crm` was added to the `apps`/`domains` of the three `work-item-*` descriptors
— without it the CRM app 403s on the shared primitive.

### 2. Segments resolve to `person`, not to a CRM-local row

Per [contact-entity-unification.md](./contact-entity-unification.md), `person`
is the canonical contact identity. A segment engine that returned `crm-contact`
rows would be a second, parallel contact entity — the exact thing unification
exists to prevent, and it would hand H1 campaigns the wrong audience key.

That required **Phase 1C.1** (`crm-contact` → `person`), which this tranche
also lands:

- `crm-contact.person` FK (+ `person.crm_contacts` inverse, so person-based
  segments can filter on CRM attributes).
- Dual-write in the `crm-contact` controller via the new shared
  `src/utils/person-link.js`.
- Ambiguous matches go to `person-dedup-audit` rather than auto-merging.

**One deliberate deviation from the plan doc:** it says a single candidate
auto-links only when BOTH email and phone match. Read literally that audits
every email-only contact — the common case — and the audit pile stops being a
signal. Implemented rule: *every identifier the source row actually carries
must match.* Email+phone rows still need both. Documented in `person-link.js`.

Every segment run projects `{ documentId, name, email, phone }` for the
matched person; rows with no person are returned flagged `unlinked` rather
than silently dropped, so the gap is visible instead of invisible.

---

## What shipped

### Schema

| Content-type | Change |
|---|---|
| `crm-activity` | + `direction`, `outcome`, `duration_minutes`, `followup_at`, `followup_note`, `followup_done_at`, `attachments`, `actor`, `actor_label`, `lead`, `person`; `type` gains `WhatsApp` + `Site`. All additive — no existing enum value renamed. |
| `crm-lead` | + `activities` (inverse of `crm-activity.lead`) |
| `crm-contact` | + `person` FK |
| `person` | + `crm_contacts` inverse |
| `crm-segment` | **new** — name, description, folder, entity, definition (json), columns, sort, member_count, last_run_at, owners |

### Endpoints

| Route | Action | Purpose |
|---|---|---|
| `GET /crm-activities/timeline` | `timeline` | merged 360° feed for one contact / lead / person |
| `GET /crm-activities/followups` | `followups` | reminder queue (`window=overdue\|today\|week\|all`, `mine`) |
| `POST /crm-activities/:id/complete-followup` | `completeFollowup` | close / reopen a follow-up |
| `GET /crm-segments/fields` | `fields` | the field catalog the builder renders from |
| `POST /crm-segments/resolve` | `resolve` | run an UNSAVED definition (live preview) |
| `GET /crm-segments/:id/members` | `members` | run a SAVED segment (report grid — one row per base entity) |
| `GET /crm-segments/:id/audience` | `audience` | the SEND list — one row per contactable human |
| `POST /crm-segments/:id/recount` | `recomputeCount` | refresh `member_count` + `last_run_at` |

Descriptors in `packages/api-provider/api/crm-{activities,segments}.js`;
generated clients scaffolded; all three validators pass. UP grants for the new
custom actions added to `CUSTOM_ACTIONS` in `src/seed/up-permissions-seed.js`.
All routes are also mounted in `services/core/src/modules/crm.js` — including
`crm-contact` create/update as core-action overrides, so contacts created
through core still get their person link.

### The segment engine (`services/strapi/src/utils/crm-segment-engine.js`)

A **whitelisted field catalog** + filter compiler. This is load-bearing
security, not ergonomics: a segment definition is client-authored JSON, and
passing it to `strapi.documents()` as raw `filters` would let any CRM staffer
walk arbitrary relations (`{ owners: { resetPasswordToken: … } }`) and read the
whole graph a field at a time. Nothing reaches the query layer that isn't in
the catalog.

- 3 base entities — `person` (15 fields), `crm-contact` (16), `crm-lead` (13).
- ~20 operators, each declaring which field types it applies to.
- One level of group nesting; max 40 rules; page size capped at 200.
- Rejected at compile time: unknown field, unknown operator, operator/type
  mismatch, missing value, deeper nesting, unknown entity. `create`/`update`
  compile the definition too, so a segment can never be *saved* broken.

**Known semantics:** two rules over the same to-many relation AND at the row
level, not the related row — "has a Call" AND "has an activity in the last 30
days" can be satisfied by two different activities. That matches mainstream
segment builders. Rules that must hold on one related row need a purpose-built
catalog field (see `open_followup`, which pins both conditions together).

### `members` vs `audience` — read this before consuming a segment

They answer different questions and returning the wrong one sends duplicate
email:

| | `members` | `audience` |
|---|---|---|
| Row granularity | one per BASE entity | one per HUMAN |
| Two leads, same person | two rows (correct — you want to see both) | one row |
| No email address | included | excluded (unless `channel=none`) |
| Merged-away duplicate | may appear | excluded — the survivor holds the identity |
| Shape | selected columns + person projection | `{documentId, name, email, phone}` |

`audience` is implemented by pushing the compiled filter down onto a `person`
query — `crm-contact` filters get prefixed with `crm_contacts`, `crm-lead`
filters with `crm_contacts.leads`. Querying `person` is inherently
distinct-by-human, so it de-duplicates in the database and pages correctly,
rather than needing the whole matched set in memory to dedupe.

`meta` carries `people` (humans reached at all), `reachable` (those with the
requested channel) and `unreachable`, so a campaign UI can warn before sending
instead of silently reaching fewer people than the member count implied.

**Paging safety:** `compileSort` always ends on `id`, and `audience` sorts by
`id` alone. A non-unique sort leaves ties in database-defined order, which can
differ between the queries serving page 1 and page 2 — a consumer paging the
whole audience would silently skip people.

### Frontend (`apps/sales/crm`)

- `components/ActivityTimeline.js` — merged feed, source-coded, inline
  follow-up close/reopen, attachment download links, and an edit affordance on
  the entries that are actually editable (CRM touches — audit rows and comments
  aren't). Editing re-fetches the full row, because a timeline entry is a
  normalised projection, not the raw record.
- 360° contact drawer — tabs Timeline / Details / Leads / Collaboration; the
  Collaboration tab is the shared `WorkItemPanel` (`canAssign={false}` — a
  contact has no `assignee` relation, so the generic assign endpoint would
  reject it).
- `pages/segments.js` + `pages/[documentId]/segment.js` + the rule builder,
  with column selection (§5.3's "pick columns") and CSV export of every
  matching row — not just the page on screen. The export walks `resolve`, the
  same engine path the preview uses, so the file matches what's displayed; it
  carries a UTF-8 BOM so Excel renders Urdu/Arabic names rather than mojibake,
  and it stops at 20k rows with an explicit message instead of truncating
  silently.
- `pages/followups.js` — the reminder queue.
- Lead detail now renders the shared timeline, keyed on the linked contact.

### Enum hygiene

Repo convention is that frontends never hardcode enum lists. Fixed everything
in the CRM app's path, consuming the shared component that already lives in
`pos-shared` (`components/EnumSelect.js` + `lib/use-enum-values.js`):

- Removed hardcoded lists: activity `TYPES` (activities page + form), lead
  `SOURCES`/`STATUSES` (LeadForm), `LEAD_STATUSES` + `OPEN_STATUSES`
  (dashboard, kanban, lead detail). `leadStatus.js` now exports
  `useLeadStatuses()` reading `/enums/crm-lead/status`; `leadStatusColor` stays
  (colour is presentation, and an unknown status falls through to neutral).
- The segment builder extends the same rule to its own metadata: field list,
  operators per field, and each enum field's `/enums` source all come from
  `GET /crm-segments/fields`.

---

## Deploying this

New content-type + new custom actions, so seeding is **required** — none of it
runs at boot:

```bash
npm run seed -- --only=api-provider,up-permissions
```

Without it every new route 403s. `crm-segment`'s table is created by Strapi's
schema sync on first boot.

Then link any pre-existing contacts to a person. Not essential (a fresh DB has
nothing to link, and the dual-write covers every new row), so it's opt-in:

```bash
npm run seed -- --only=crm-contact-person
```

Do a dry run first on a database with real data — it computes the full plan and
logs the counts without writing anything:

```bash
RUTBA_PERSON_BACKFILL_DRY_RUN=1 npm run seed -- --only=crm-contact-person
```

The backfill is idempotent (it only touches contacts whose `person` FK is null,
so a re-run over a linked table is one count query), non-destructive, and parks
ambiguous matches in `person-dedup-audit` instead of guessing. It shares the
decision logic in `person-link.js` with the controller dual-write — a row
backfilled and a row created through the API resolve identically. Audits
de-duplicate while unresolved, so re-running doesn't grow the pile.

## Integration with `apps/content/campaigns` (roadmap 1.4) — wired

`apps/content/campaigns` landed on dev before this tranche did, and left the seam
open deliberately: `cmp-audience.source` already had a `'segment'` value whose
resolver threw *"not built yet (ROADMAP 0.6)"*, behind the contract
`resolve(audience) → { members: [{ email, mergeData }], total }`.

That branch is now implemented, in the campaigns resolver rather than as a
second copy of the engine:

- `cmp-audience` gains a `segment` relation → `crm-segment`.
- `source: 'segment'` compiles the saved segment through
  `crm-segment-engine.audienceFilter()` and pages over `person`.
- `merge_mapping` still applies, so campaign templates see the same merge keys
  regardless of which source produced the list.
- A segment whose catalog changed under it fails as a 400
  (`audience_bad_segment`) naming the segment, not a 500.

**Why route a campaign audience through `segment` rather than `filter`.** Both
work; they are not equivalent:

| | `source: 'filter'` | `source: 'segment'` |
|---|---|---|
| Filter provenance | `filter_json` on the row, passed to the query layer as-is | compiled from the whitelisted catalog |
| Row granularity | one per row of `entity` | one per person |
| Two leads, same human | two members until the email dedupe collapses them | one member before dedupe |
| Reusable in CRM | no | yes — same saved segment drives the CRM grid |

The email-level dedupe in the resolver catches the duplicate-human case for
`filter` audiences too, but only when both rows carry the *same* address; two
records for one human with different addresses still get two sends. Resolving
by person is what actually fixes it.

**Still to do on the campaigns side** (not done here — it's their app):
`crm-segments.js` declares `apps: ['crm']`, so a `campaigns`-domain caller
gets a 403 from the segment endpoints. The campaigns UI can't yet offer a
segment picker until that domain is added to `list`/`byId`/`listAudience` and
`npm run seed -- --only=api-provider,up-permissions` is re-run. The
server-side resolver above works today because it calls the engine in-process,
not over HTTP.

What campaigns still owns, and CRM deliberately does NOT provide:

- **Suppression / unsubscribe.** Rutba-MTA already owns suppression,
  unsubscribe and reputation throttling. A CRM segment is "who matches these
  rules", not "who may lawfully be emailed today" — keep that gate on the send
  path where it can't be bypassed by a differently-built audience.
- **Audience snapshots.** `audience` is live: run it twice a week apart and
  membership moves. If a campaign needs to record who it actually sent to,
  that snapshot belongs to the campaign row, not the segment.
- **Per-channel identity.** The audience returns a person's `email`/`phone`.
  Channel preferences and per-channel consent aren't modelled anywhere yet.

## Not in this tranche

- §5.2 opportunity/deal pipeline (roadmap 1.5) — net-new, its own item.
- §5.4 bulk contact import, §5.5 company↔person associations.
- §5.6 softphone, §5.7 tracked email (needs Rutba-MTA wiring), §5.8 site
  activity (needs the `rutba-analytics` tracker), §5.9 dashboard-from-segments.
- Segments are team-visible by design — no per-owner scope. `owners` records
  the creator (stamped server-side, never accepted from the client) so a
  "mine" filter or a future scope policy has something to key on.
- The dedup-audit pile has no triage UI. Rows accumulate correctly and the
  contact detail page flags an unlinked contact, but resolving one means going
  through Strapi admin until the Phase 3.1 merge UI lands.
