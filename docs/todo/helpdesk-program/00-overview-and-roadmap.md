# Helpdesk Program — Overview & Roadmap

> ⚠️ **Superseded for architecture.** This document is Strapi-framed. The current
> specification is the Core-native 40-section set in **[spec/00-index.md](spec/00-index.md)**.
>
> What is still valid here: the **as-is survey** of what exists today (§ Starting state) and
> the gap analysis. What is superseded: the phase plan, the "reuse `work-item-comment` for the
> thread" leaning (the spec gives the thread its own table — see
> [spec/07 §7.4](spec/07-data-model.md#74-ticketmessage)), and the Strapi content-type framing
> throughout.

> Program-level plan for turning the existing `contact-ticket` primitive into a **general
> service-desk platform** (`rutba-helpdesk`, port **4019**) that serves many areas — customer
> support, IT, HR, facilities, field service, warranty/RMA, maintenance — and then extends
> into **remote support** (remote control of enrolled devices) as a wider IT capability.
>
> Each phase below is designed to be built and shipped separately. This document is the map:
> what already exists, the platform primitives every phase reuses instead of reinventing, the
> dependency graph, and the sequencing.

Authored: 2026-08-08. **Status: NOT STARTED** — no `rutba-helpdesk` app, no `helpdesk` domain,
no prior spec. This is the first helpdesk document in the repo.

Decisions locked with the user (2026-08-08):

1. **Build on the existing ticket recording.** `api::contact-ticket.contact-ticket` and its
   `contact_tickets` table are the foundation — extended in place, not replaced by a parallel
   model. Existing rows, routes and the storefront contact-us flow keep working throughout.
2. **General, not vertical.** The model must fit many desks (support / IT / HR / facilities /
   field service / RMA / maintenance) rather than hardcoding one. Desks are configured data,
   not enum branches in code.
3. **Phased.** Ship a usable desk early; layer automation, portal and remote support after.
4. **Remote control is in scope** as a later phase — see
   [epic-5-remote-support.md](epic-5-remote-support.md).

---

## Starting state (verified against `dev`, 2026-08-08)

### What exists

| Piece | Where | State |
|---|---|---|
| `contact-ticket` content type | [pos-strapi/src/api/contact-ticket/.../schema.json](../../../pos-strapi/src/api/contact-ticket/content-types/contact-ticket/schema.json) | `ticket_no, subject, message, status(open\|in_progress\|waiting\|resolved), sla_due_at, resolved_at, last_reply_by, last_reply_at, metadata`; relations `user`, `person`, `assigned_to`, `employee`; `category(General\|IT\|HR\|Facilities)` |
| Public storefront flow | `submit`, `:id/reply`, `:id/sla-breach` — [routes](../../../pos-strapi/src/api/contact-ticket/routes/01-custom-contact-ticket.js) | `auth:false` + `ensureUser` (selfAuth); resolves `person` via contact-unification; fires `contact.submitted` / `contact.reply.added` / `contact.sla.breach` |
| Internal employee helpdesk | `mine`, `submit-internal`, `team`, `:id/resolve` | interceptor-gated; scoped by `isHrManager` / `managedReportDocIds` in `utils/hr-access.js` |
| Same routes served by core | [rutba-core/src/modules/crm.js:60-68](../../../rutba-core/src/modules/crm.js) | ported + smoke-verified, see [tranche-3-crm.md](../core-server-multitenancy-program/tranche-3-crm.md) |
| Descriptor | [api-provider/api/contact-tickets.js](../../../packages/api-provider/api/contact-tickets.js) | `domains: ['hr','ess']` only |
| Agent UI | [rutba-hr/pages/tickets.js](../../../rutba-hr/pages/tickets.js), [rutba-ess/pages/tickets.js](../../../rutba-ess/pages/tickets.js) | two near-duplicate ~166-line Bootstrap pages |
| Storefront intake | [rutba-web/src/pages/contact.tsx](../../../rutba-web/src/pages/contact.tsx) + `cms-contact-form-section.tsx` | submit only; CMS `enable_contact_form` |

### What is missing — the gaps this program closes

1. **No thread.** `addReply` overwrites `metadata.latest_reply`; only the newest reply
   survives. There is no conversation history at all. *This is the load-bearing gap — every
   other item is a field.*
2. **Assignment is dead.** `assigned_to` is read for notification routing but no endpoint
   ever writes it. No queues, no teams, no routing rules.
3. **SLA is a client-side honour system.** `sla_due_at` comes from a caller-supplied
   `sla_hours` (default 24) on *public* submit only — internal tickets get none — and
   `sla-breach` fires only if a client chooses to call it.
4. **No priority, source/channel, tags, resolution, reopen, or close.**
5. **Status has no state machine**, despite the definable workflow engine existing and HR
   already using it for leave.
6. **`category` is a hardcoded enum**, duplicated as a hardcoded `CATEGORIES` array in both
   `tickets.js` pages — the exact drift the `EnumSelect` + `/enums/:name/:field` convention
   exists to prevent.
7. **Requesters can file but never see a ticket again.** `rutba-web-user` has no ticket page.
8. **A ticket can't point at anything.** No link to the order, invoice, product, asset or work
   order it is about — which is precisely what makes a desk useful in many areas.

---

## The reuse thesis

Most of a service desk is already built in this repo as **generic, entity-agnostic
primitives**. The single most important architectural decision in this program is to wire
`contact-ticket` into them rather than build helpdesk-specific copies.

| Need | Existing primitive | Notes |
|---|---|---|
| Conversation thread | `api::work-item-comment` (`entity_uid` + `target_document_id`, author stamped server-side) | Needs an `internal_only` flag + a ticket-scoped endpoint (see security note below) |
| Watchers / CC | `api::work-item-watch` (one row per user per item) | Already has custom routes |
| Audit trail | `api::work-item-activity` + `utils/work-item-activity.js#logActivity` | `kind: created\|transition\|assigned\|unassigned\|watch\|unwatch\|comment\|note` — already exactly the helpdesk vocabulary; best-effort, never throws |
| Configurable stages/transitions per desk | `api::workflow` + [utils/workflow-engine.js](../../../pos-strapi/src/utils/workflow-engine.js) | Stages carry `maps_to_status`, so custom stages never bypass canonical side effects; falls back to hardcoded maps when no workflow row exists — zero behaviour change until configured |
| **SLA breach detection** | `workflowSlaSweep` cron, `*/15 * * * *` — [config/workflow-cron-tasks.js](../../../pos-strapi/config/workflow-cron-tasks.js) | Scans every active SLA-configured workflow, fires a deduped `workflow.sla_breach` event. **Flags only — never auto-transitions.** A no-op until a workflow sets `sla_hours` on a transition |
| Notifications | `api::notification.notification-engine#processEvent` | `contact.*` templates already routed |
| Identity across channels | `api::person` + `ensureForUser` | contact-unification already wired into `submit` |
| Assets (for IT desks) | `api::hr-asset` + `api::hr-asset-assignment` | `asset_tag`, `serial_number`, `category`, `status`, branch/account links |

**Consequence: Phase 1 adds almost no new tables.** SLA, audit, watchers and configurable
stages arrive by configuration, not by code.

> **Security note that shapes Phase 1.** `work-item-comment` today exposes plain core
> `find`/`create` scoped to the `manufacturing` and `order-management` domains. Requesters
> (customers, employees) must **never** be given that generic `find` — it would expose every
> work item's discussion in the system. The ticket thread must be served by a **ticket-scoped
> endpoint** (`/contact-tickets/:documentId/messages`) that authorises against the ticket,
> filters to that `entity_uid` + `target_document_id`, and strips `internal_only` rows for
> non-agents. The generic route stays staff-only.

---

## The phases

| # | Phase | Owning code | Ships | Depends on |
|---|-------|-------------|-------|-----------|
| 1 | **Desk foundation** — generalise the ticket, add the thread, wire the platform primitives | `pos-strapi` + `rutba-core` + api-provider | A ticket that can be threaded, assigned, prioritised, SLA'd and pointed at any entity | — |
| 2 | **`rutba-helpdesk` app (:4019)** — the agent console | new app + roles/domains registration | Agents work every desk from one queue | 1 |
| 3 | **Requester surfaces** — portal + omnichannel intake | `rutba-web-user`, `rutba-web`, HR/ESS, pos-shared | Requesters see and reply to their own tickets; tickets arrive from more than a form | 1, 2 |
| 4 | **Automation & knowledge** — routing rules, canned replies, KB, CSAT, reports | `pos-strapi` + `rutba-helpdesk` | The desk scales past manual triage | 2, 3 |
| 5 | **Remote support** — device enrolment, remote control sessions, consent + audit | new CTs + provider adapters + `rutba-helpdesk` | IT resolves device issues from inside the ticket | 2; asset model | 

Phases 1–2 are the minimum for a usable product. Phase 3 is what makes it a *service* desk
rather than an internal tracker. Phases 4 and 5 are independent of each other and can be
sequenced by demand.

---

## Phase 1 — Desk foundation (backend)

Extend `contact-ticket` in place. Every change is **additive**; no existing route changes
shape, no existing row becomes invalid.

### 1.1 Generalise the ticket

New fields on `contact-ticket`:

| Field | Type | Purpose |
|---|---|---|
| `desk` | relation → `helpdesk-desk` | Replaces the hardcoded `category` enum as the routing dimension |
| `priority` | enum `low\|normal\|high\|urgent` (default `normal`) | Drives SLA target and queue ordering |
| `source` | enum `web\|portal\|email\|phone\|whatsapp\|walk_in\|internal\|api` | Channel of intake |
| `requester_kind` | enum `customer\|employee\|supplier\|anonymous` | One desk, many requester types |
| `subject_entity_uid` + `subject_document_id` | string + string | **Generic link to any entity** — the order, invoice, product, asset, work order or shipment the ticket is *about*. Mirrors the `work-item-*` addressing convention |
| `first_response_at` | datetime | First-response SLA, distinct from resolution SLA |
| `resolution` | text | What was actually done — the input to the KB in Phase 4 |
| `closed_at`, `reopened_count` | datetime, integer | Close is distinct from resolve; reopen is countable |
| `tags` | json | Free-form classification without a schema change |

Status enum extended additively: `open, in_progress, waiting, resolved` **+ `closed`,
`cancelled`**. `category` is **retained and back-filled** from `desk` for the life of the
existing storefront and HR/ESS callers — it is deprecated, not removed.

### 1.2 `helpdesk-desk` — the generality mechanism

A small reference collection type, seeded via the migrations path (not `src/seed/data`):

```
key, name, description, is_active, sequence,
default_priority, default_assignee, member_roles (json),
sla_first_response_hours, sla_resolution_hours,
requester_visibility (internal | customer | both),
workflow (relation → api::workflow, optional)
```

Seeded desks: **Customer Support, IT, HR, Facilities, Field Service, Warranty/RMA,
Maintenance**. Adding a desk for a new area is then a data operation, not a release.

Frontends read desks from the API — and any surviving enum through
`/enums/:name/:field` via `EnumSelect`. **No hardcoded category or status lists**, which
also fixes the existing duplication in the two `tickets.js` pages.

### 1.3 The thread

- Add `internal_only` (boolean, default `false`) and `author_kind`
  (`requester|agent|system`) to `work-item-comment`.
- New ticket-scoped routes:
  `GET /contact-tickets/:documentId/messages`, `POST /contact-tickets/:documentId/messages`
  — authorised against the ticket, filtered to `entity_uid = 'api::contact-ticket.contact-ticket'`
  and that `target_document_id`, `internal_only` rows stripped for non-agents.
- `addReply` is **kept and reimplemented** to append a message row (and keep stamping
  `last_reply_by` / `last_reply_at` for back-compat). The `metadata.latest_reply` overwrite
  stops being the only record.
- Backfill migration: existing `metadata.latest_reply` values become the first message row so
  no history is lost.

### 1.4 Lifecycle, assignment, SLA

- A `contact-ticket` **state machine service** routed through `workflow-engine`, so each desk
  can define its own stages while side effects stay keyed to canonical statuses.
- New endpoints: `assign`, `unassign`, `changePriority`, `changeDesk`, `reopen`, `close`,
  `addInternalNote` — each writing a `work-item-activity` row via `logActivity`.
- Watchers reuse `work-item-watch` unchanged.
- **SLA arrives by configuration**: a workflow row for `api::contact-ticket.contact-ticket`
  with `sla_hours` on its transitions activates the existing 15-minute
  `workflowSlaSweep`. The desk's `sla_*_hours` seed the workflow. The legacy client-triggered
  `sla-breach` route stays for back-compat but stops being the mechanism.
- Notification events extended: `helpdesk.ticket.assigned`, `.escalated`, `.resolved`,
  `.reopened`, `.message.added`, alongside the existing `contact.*`.

### 1.5 API surface

Rewrite [contact-tickets.js](../../../packages/api-provider/api/contact-tickets.js) for
`domains: ['helpdesk','hr','ess','crm']`, per-method `scope`, and the named-policy
convention. Mirror every new route in [rutba-core/src/modules/crm.js](../../../rutba-core/src/modules/crm.js)
— or split a `helpdesk.js` module — keeping literal paths registered before `:documentId`.

> **Gate:** new actions 403 until `npm run seed -- --only=api-provider,up-permissions` runs.
> Seeding does not happen at boot.

---

## Phase 2 — `rutba-helpdesk` app (port 4019)

Registration checklist (per the new-ERP-app convention):

- `helpdesk` entry in [domains.json](../../../packages/api-provider/config/domains.json) with
  `helpdesk_admin` / `helpdesk_manager` / `helpdesk_staff` (`helpdesk_agent` as the staff-level
  alias if agent reads better in the UI).
- [pos-shared/lib/roles.js](../../../packages/pos-shared/lib/roles.js): `APP_URLS.helpdesk`,
  `VALID_APP_KEYS`, `APP_META` entry. Category: **`sales` (Sales & Customers)** — a customer-facing
  desk sits closer to CRM than to Administration.
- `/auth/callback` page, `RoleSwitcher`, `PrimeReactProvider`.
- `scripts/rutba_apps.sh`: `RUTBA_SVC_CMD` / `_DESC` / `_PORT[rutba_helpdesk]="4019"` — the
  single-source registry; nothing else lists services.
- docker-compose + Caddy route.

Screens:

1. **Queue / inbox** — filter by desk, status, priority, assignee, SLA state; saved views;
   bulk assign/close.
2. **Ticket detail** — thread with public replies vs internal notes, requester panel (person +
   their other tickets + linked orders), the linked subject entity, activity timeline,
   watchers, assignment, priority, desk, SLA countdown.
3. **Desk admin** — desks, members, SLA targets, workflow binding.
4. **Dashboard** — open by desk, breach count, first-response and resolution time, agent load.

---

## Phase 3 — Requester surfaces

- **`rutba-web-user` portal**: `tickets.js` list + detail with reply, reopen, CSAT. Uses the
  ticket-scoped message endpoint, never the generic comment route.
- **Storefront**: `contact.tsx` posts a real desk-routed ticket (`source=web`,
  `desk=Customer Support`), and logged-in customers get a link to the portal thread.
- **Contextual raise-a-ticket** from order-management / rider / marketplace, populating
  `subject_entity_uid` + `subject_document_id`.
- **De-duplicate HR/ESS**: extract the shared ticket UI into `pos-shared` and re-point both
  `tickets.js` pages at the new API. They stay as *filing* surfaces; agents work in
  `rutba-helpdesk`.
- **Email intake** via Rutba-MTA inbound (RSMTPREST ingress is listed as partial in the
  [RightApp gap analysis](../rightapp-gap-analysis/README.md) — confirm before committing).
  Reply-to-thread by parsing the ticket reference.
- **WhatsApp intake** rides the H1 WhatsApp commerce work on the roadmap.

Deliberately **not** merged here: `order-message` keeps owning order-scoped customer
conversation, including its two-way peer sync and `internal_only` notes. Phase 3 *surfaces*
order threads in the ticket detail when `subject_entity_uid` is a sale-order; it does not
migrate them. Revisit only if the two threads prove genuinely redundant in use.

---

## Phase 4 — Automation & knowledge

- **Routing rules** — desk/priority/assignee by source, requester kind, keyword, or linked
  entity type. Round-robin and load-balanced assignment.
- **Canned replies / macros** — a reply plus a set of field changes in one action.
- **Escalation** — on SLA breach, on reopen count, on priority; escalate to the desk's
  manager, reusing the existing sweep's events rather than a second scheduler.
- **Knowledge base** — articles authored from `resolution` text; served through the CMS so
  the storefront can publish public help articles without a second content system.
- **CSAT** — a rating request on resolve; feeds the dashboard and CRM activity.
- **Reports** — volume, first-response/resolution time, breach rate, reopen rate, per desk and
  per agent.

---

## Phase 5 — Remote support

Device enrolment, remote-control sessions with explicit consent, session audit and recording,
behind a provider-adapter seam (self-hosted RustDesk / MeshCentral / Guacamole). Full spec:
**[epic-5-remote-support.md](epic-5-remote-support.md)**.

---

## Cross-cutting conventions every phase must honour

1. **Descriptors are the source of truth.** Every route gets a descriptor entry in
   `api-provider/api/` with an explicit `method:` and per-method `scope`. A missing `method:`
   silently becomes a GET; a non-whitelisted verb makes the seeder skip the action, which
   surfaces as a 403.
2. **`apps` is the caller.** Cross-app writes need the calling app in `apps`.
3. **Custom-route `action` must equal the handler name.**
4. **Never hardcode enum lists in frontends** — `EnumSelect` against `/enums/:name/:field`.
   Desks come from the desk API.
5. **Ownership relations are always `owners`** (plural manyToMany) where row-level ownership
   is used.
6. **Reference data ships as migrations**, not `src/seed/data` JSON.
7. **Notification rows the engine owns must use `trigger_event='none'`** so they don't fire on
   real orders.
8. **Additive only on live data.** `contact_tickets` holds real rows on dev and live — extend
   enums, don't redefine them; back-fill before you rely on a new field.
9. Re-seed after any new action: `npm run seed -- --only=api-provider,up-permissions`.

---

## Open questions to settle before Phase 1 lands

1. **Rename or keep `contact-ticket`?** Keeping the UID avoids a migration across
   `pos-strapi`, `rutba-core`, descriptors, generated clients and the notification templates.
   Recommendation: **keep the UID**, present it as "Helpdesk Ticket" in the UI.
2. **Agent identity** — do agents need an `hr-employee` record (as the internal flow assumes
   today via `resolveOrCreateEmployeeForUser`), or is a users-permissions user with a
   `helpdesk_*` role enough? Recommendation: **role is enough**; keep the employee link
   optional so external/contract agents work.
3. **Does the HR line-manager scoping survive?** Today `teamTickets` scopes by reporting line.
   Under desks, membership should be the primary scope with the reporting line as an
   additional grant for HR desks specifically.
4. **Multi-tenancy** — desks are tenant-scoped under the H2 SaaS work; confirm the desk key is
   unique per tenant, not globally.
