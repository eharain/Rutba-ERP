# 03 — Functional Requirements

[← 02 Business Requirements](02-business-requirements.md) · [Index](00-index.md) · Next: [04 Roles & Permissions](04-user-roles-and-permissions.md)

---

## 3.1 Purpose

The feature-by-feature contract. This is the largest section of the spec set; the engines
(SLA, automation, routing, knowledge, catalog) each have their own document — this section
specifies the **core ticketing features** and defers to those for depth.

Every feature below follows the same template:
**Purpose · Description · Preconditions · Workflow · Inputs · Outputs · Business rules ·
Exceptions · API · Events · Permissions.**

Service names refer to [00 Index § Architectural position](00-index.md#architectural-position).

---

## F1 — Create ticket

**Purpose.** Turn any inbound request into a tracked object with an owner and a promise.

**Description.** One creation path in the domain (`TicketService.create`), many entry points:
storefront form, customer portal, employee portal, agent-on-behalf-of, email, WhatsApp, API,
and Core domain events. The entry point sets `source`; it never changes the invariants.

**Preconditions.** Requester identity resolvable (authenticated user, `person` record, or an
anonymous contact with at least an email or phone). Target desk resolvable (explicit,
catalog-derived, or the tenant default).

**Workflow.**
1. Resolve requester → `person` via the contact-unification graph (`ensureForUser` for logged-in
   users, match-or-create for anonymous).
2. Resolve desk — explicit > catalog item > automation rule > tenant default.
3. Apply desk defaults: priority, workflow, SLA policy, visibility.
4. Persist the ticket in `open`, allocate `ticket_no` (see [32 Configuration](32-configuration.md)).
5. Write the opening message as the first thread entry (never as a naked field).
6. Compute SLA targets via `SLAService.computeTargets`.
7. Run assignment rules (`AssignmentService.route`).
8. Emit `helpdesk.ticket.created`.
9. Notify per [15 Notifications](15-notifications.md).

**Inputs.** `subject` (required, ≤200 chars), `body` (required), `desk`, `priority`, `source`,
`requester_kind`, `subject_entity_uid` + `subject_document_id`, `branch`, `catalog_item`,
`custom_fields`, `attachments[]`, `tags[]`.

**Outputs.** Ticket with `ticket_no`, status `open`, SLA targets, assignment (or explicit
unassigned), first thread message, audit row, emitted event.

**Business rules.** RULE-1, RULE-3, RULE-7, RULE-12, RULE-16.

**Exceptions.**

| Condition | Result |
|---|---|
| Missing subject or body | `400 ValidationError` |
| Unknown or inactive desk | `400 ValidationError` |
| Requester unresolvable and no contact details | `400 ValidationError` |
| Catalog item's required fields missing | `400 ValidationError` with per-field detail |
| Attachment exceeds limit / blocked type | `400`, ticket still created without it |
| Assignment rules find nobody | Ticket created **unassigned** in the desk queue — never fails |
| SLA calendar missing | Ticket created, SLA flagged `indeterminate`, warning logged — never fails |
| Duplicate event dedupe key with an open ticket | Existing ticket returned and updated; no new ticket (BR-Y2) |

> **Design stance: intake never fails on a downstream concern.** Routing, SLA, notification and
> AI failures degrade the ticket, they do not reject it. Losing a customer's request because a
> calendar was misconfigured is the worst possible failure mode.

**API.** `POST /api/helpdesk/tickets` · `POST /api/helpdesk/tickets/public` (selfAuth).

**Events.** Emits `helpdesk.ticket.created`.

**Permissions.** `helpdesk.ticket.create` (agents, on behalf of anyone), `helpdesk.ticket.create.own`
(requesters), public route open per desk `allow_anonymous`.

---

## F2 — Conversation thread

**Purpose.** Preserve the whole conversation. *This closes the single largest gap in the system
today, where each reply overwrites the last.*

**Description.** An append-only sequence of messages on a ticket. Each message has a
`visibility`: `public` (requester sees it) or `internal` (agents only). Messages carry author,
author kind, channel, attachments and delivery metadata.

**Preconditions.** Ticket exists and is not `closed` (closed tickets accept internal notes only).

**Workflow.** Author submits → validate visibility against role → persist message → update
`last_reply_by`/`last_reply_at` → stamp `first_response_at` if this is the first public agent
message → recompute SLA state → emit event → notify participants and watchers.

**Inputs.** `body`, `visibility`, `attachments[]`, `channel`, optional `in_reply_to`.

**Outputs.** Message row, updated ticket denormals, audit row, notifications.

**Business rules.**
- RULE-10 — internal notes never reach a requester through *any* surface: API, portal, email,
  search results, exports, AI summaries or webhooks.
- A requester reply on a `resolved` ticket moves it to `in_progress` and counts as a reopen if
  past the resolution point.
- `first_response_at` is stamped once and never recomputed, even on reopen (RULE-18).
- Editing a message is not permitted; corrections are new messages. Deletion is redaction only,
  by admin, audited, leaving a tombstone.

**Exceptions.** Empty body → `400`. Requester attempting `visibility: internal` → `403`.
Message on a closed ticket by a requester → `409` with guidance to reopen.

**API.** `GET/POST /api/helpdesk/tickets/:id/messages`.

**Events.** `helpdesk.ticket.message.added`, `helpdesk.ticket.first_response` (once).

**Permissions.** `helpdesk.ticket.reply`, `helpdesk.ticket.note.internal`, `helpdesk.ticket.reply.own`.

> **Implementation note.** The generic `work-item-comment` store is the natural substrate
> (see [07 Data Model](07-data-model.md)), but requesters must **never** be granted its generic
> `find` route — it would expose every work item's discussion in the ERP. The thread is served
> exclusively by the ticket-scoped endpoint, which authorises against the ticket and filters
> `internal` out for non-agents.

---

## F3 — Assign / reassign

**Purpose.** Give every ticket exactly one accountable owner.

**Description.** Manual assignment, self-claim from a queue, and rule-based routing all funnel
through `TicketService.assign`. Reassignment is a recorded transfer with an optional reason.

**Preconditions.** Assignee holds a role on the ticket's desk and is active; the ticket is not
closed.

**Workflow.** Validate assignee eligibility → capture previous owner → write assignment → audit
(`kind: assigned`, from/to) → emit → notify new assignee and (on transfer) the previous one.

**Inputs.** `assignee_id` (null to unassign), `reason`.

**Business rules.** RULE-2. Unassignment returns the ticket to the desk queue and is itself
audited. Assigning does not change status — that is a separate transition (RULE-4).

**Exceptions.** Assignee lacks desk membership → `403`. Assignee inactive/on leave → `400` with
a suggested alternate. Assigning a closed ticket → `409`.

**API.** `POST /api/helpdesk/tickets/:id/assign` · `.../unassign` · `.../claim`.

**Events.** `helpdesk.ticket.assigned`, `helpdesk.ticket.unassigned`.

**Permissions.** `helpdesk.ticket.assign` (manager/admin, any), `helpdesk.ticket.assign.self`
(agent, claim only).

---

## F4 — Status transitions

**Purpose.** Move a ticket through its lifecycle safely and configurably.

**Description.** All status change goes through `TicketService.transition(ticket, targetStage)`,
which delegates validation to the shared workflow service. **Status is never a writable field.**

See [08 Ticket Lifecycle](08-ticket-lifecycle.md) and [09 Ticket Workflows](09-ticket-workflows.md).

**Business rules.** RULE-3, RULE-4, RULE-5, RULE-6.

**API.** `POST /api/helpdesk/tickets/:id/transition` plus the intent-named aliases
`/resolve`, `/close`, `/reopen`, `/cancel`, `/hold`.

**Events.** `helpdesk.ticket.status_changed` plus specific `helpdesk.ticket.resolved|closed|reopened|cancelled`.

---

## F5 — Priority, desk and field changes

**Purpose.** Correct a ticket's classification as understanding improves.

**Description.** Changing priority or desk recomputes SLA targets against the *new* policy and
may re-run routing. Both are audited transfers with old and new values.

**Business rules.** Changing desk re-evaluates the workflow binding; if the new desk uses a
different workflow, the ticket maps to the equivalent canonical status, and if no equivalent
stage exists the transition is rejected with an explanatory error rather than silently reset.
SLA recomputation never *retroactively* breaches a ticket that was compliant — the new target
applies from the change forward, and the original target is retained for reporting.

**API.** `PATCH /api/helpdesk/tickets/:id` (whitelist of mutable fields only).

**Events.** `helpdesk.ticket.priority_changed`, `helpdesk.ticket.desk_changed`, `helpdesk.ticket.updated`.

---

## F6 — Link to a business entity

**Purpose.** Make the ticket know what it is about — the feature that makes an ERP-native desk
worth building.

**Description.** `subject_entity_uid` + `subject_document_id` point at any Core entity: sale
order, invoice, product, stock item, purchase order, work order, shipment, employee, asset. The
agent workspace renders a live context panel for known types and a generic link for the rest.

**Workflow.** Agent or automation sets the subject → Core resolves a display projection for that
entity type → the panel renders → the reverse view ("tickets about this order") becomes
available on the entity's own screen.

**Business rules.** The link is a reference, not ownership — deleting is not cascaded, and a
ticket survives its subject being archived. Access to the *ticket* does not grant access to the
*subject*: the context panel renders only fields the viewer is already permitted to see.

**API.** `POST /api/helpdesk/tickets/:id/subject` · `GET /api/helpdesk/tickets?subject_entity_uid=…&subject_document_id=…`.

**Events.** `helpdesk.ticket.subject_linked`.

---

## F7 — Merge and split

**Purpose.** Handle the two commonest data-quality problems on any desk: the same issue reported
twice, and one report containing three issues.

**Merge.** Source ticket's messages and attachments move to the target; the source becomes
`merged` (a terminal status) holding a `merged_into` pointer; its `ticket_no` continues to
resolve, redirecting to the target (RULE-14). Requesters of both are notified once. SLA of the
target is unchanged; the source's clock stops.

**Split.** Selected messages move to a new ticket that inherits requester, desk and subject, and
links back to the original as `split_from`. The new ticket gets its own SLA from creation time.

**Exceptions.** Cannot merge a ticket into itself or create a cycle (RULE-17). Cannot merge
across tenants, ever. Merging tickets with different requesters requires an explicit confirm and
is recorded with a reason, because it exposes one requester's thread to another — the service
refuses unless both requesters resolve to the same `person`.

**API.** `POST /api/helpdesk/tickets/:id/merge` · `POST /api/helpdesk/tickets/:id/split`.

**Events.** `helpdesk.ticket.merged`, `helpdesk.ticket.split`.

**Permissions.** `helpdesk.ticket.merge`, `helpdesk.ticket.split` — manager and above.

---

## F8 — Watchers and participants

**Purpose.** Keep interested parties informed without giving them ownership.

**Description.** Watchers receive notifications and read access. Participants are requester-side
CCs who see the public thread. Both are explicit lists, both audited.

**Business rules.** Adding a watcher grants ticket read access — so it is permission-checked
against the watcher's own entitlements and refused for users who could not otherwise be granted
the desk. Adding a requester-side participant exposes the public thread to a new person and
requires `helpdesk.ticket.participant.add`.

**API.** `POST/DELETE /api/helpdesk/tickets/:id/watchers` · `.../participants`.

**Events.** `helpdesk.ticket.watcher_added|removed`.

---

## F9 — Time tracking

**Purpose.** Measure effort, support billing for paid support, and cost the desk.

**Description.** Agents log time against a ticket, manually or by timer. Entries carry
duration, activity type, and a billable flag.

**Business rules.** Time entries are editable by their author until the ticket closes, then
frozen. Total effort is a derived read model, never a stored counter that can drift.

**API.** `GET/POST /api/helpdesk/tickets/:id/time-entries`, `PATCH|DELETE /api/helpdesk/time-entries/:id`.

**Events.** `helpdesk.time.logged`.

---

## F10 — Bulk operations

**Purpose.** Let one manager act on a hundred tickets without a hundred clicks.

**Description.** Bulk assign, transition, change priority/desk, tag, and close, applied over a
selection or a saved filter.

**Business rules.** Bulk operations are **not** a permission bypass: every ticket is
individually authorised and individually audited. Partial success is the norm — the response
reports per-ticket outcomes rather than failing the batch. Bulk operations above a configurable
threshold (default 200) require confirmation and run asynchronously with a progress record.

**API.** `POST /api/helpdesk/tickets/bulk` → `{ results: [{ id, ok, error? }], summary }`.

**Events.** One event per affected ticket, plus one `helpdesk.bulk.completed`.

---

## F11 — Ticket templates and canned replies

**Purpose.** Make the common case fast and consistent.

**Description.** Templates prefill a new ticket; canned replies (macros) insert message text and
optionally apply field changes and a transition in one action.

**Business rules.** A macro's field changes are subject to the executing agent's permissions —
a macro cannot let an agent do what they could not do by hand. Macro application is audited as
a macro, naming which one.

**API.** `GET /api/helpdesk/macros` · `POST /api/helpdesk/tickets/:id/apply-macro`.

---

## F12 — Import and migration

**Purpose.** Bring history in from whatever the tenant used before.

**Description.** CSV/JSON import of tickets and messages, following the existing bulk-import
pattern (resolve → preview → process) rather than a bespoke flow.

**Business rules.** Imported tickets preserve original timestamps and are flagged `imported` so
they never distort SLA compliance reporting for the live desk. Import is idempotent on an
external reference key.

**API.** `POST /api/helpdesk/import/resolve` · `/preview` · `/process`.

---

## F13 — Backward compatibility with `contact-ticket`

**Purpose.** Ship without breaking the storefront or ESS.

**Description.** The legacy routes — `POST /contact-tickets/submit`, `/:id/reply`,
`/:id/sla-breach`, `GET /contact-tickets/mine`, `/team`, `POST /submit-internal`,
`/:id/resolve` — keep their exact request and response contracts, reimplemented as thin
adapters over `TicketService`.

**Business rules.**
- `addReply` appends a real thread message *and* keeps stamping the legacy denormals.
- The legacy `metadata.latest_reply` field continues to be written for at least two releases.
- A migration backfills existing `metadata.latest_reply` values into the message table so no
  history is lost.
- Legacy callers that omit a desk resolve to the desk mapped from their `category`.

**Acceptance.** The existing storefront contact form and both `tickets.js` pages work unchanged
against the new backend, verified before any frontend is touched.

---

## 3.2 User stories

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-1 | Customer | to report a problem with my order in two clicks from order history | I don't have to explain which order |
| US-2 | Customer | to see what's happening with my complaint | I don't have to chase it |
| US-3 | Employee | to request a laptop replacement and know when it's approved | I can plan my work |
| US-4 | Agent | to see the customer's order, payment and past tickets on one screen | I can answer without switching apps |
| US-5 | Agent | to answer common questions with two clicks | I can handle volume |
| US-6 | Agent | to ask a colleague privately inside the ticket | the customer doesn't see internal debate |
| US-7 | Manager | to see which tickets will breach in the next two hours | I can intervene before we fail |
| US-8 | Manager | to rebalance a queue when an agent goes on leave | work doesn't stall |
| US-9 | HR manager | requests from my reports only | I respect other teams' privacy |
| US-10 | Branch manager | my branch's tickets | I'm not drowning in other branches' noise |
| US-11 | Admin | to add a new desk for a new department without a release | the tool follows the business |
| US-12 | Admin | to prove who changed what and when | I can answer an audit |
| US-13 | Ops lead | a ticket automatically when stock drops below minimum | nothing depends on someone noticing |
| US-14 | Finance | a refund request to route through approval before money moves | controls hold |
| US-15 | Customer | to rate the help I got | the business knows if it's working |

---

## 3.3 Acceptance criteria for this section

- [ ] F1–F13 each have automated tests covering the happy path and every listed exception.
- [ ] The "intake never fails" stance is verified: routing, SLA, notification and AI failures
      are each fault-injected and the ticket is still created.
- [ ] RULE-10 has a dedicated leakage test suite across API, portal, email, search, export and
      AI summary surfaces.
- [ ] F13 legacy contracts verified by replaying recorded requests from the live storefront.
- [ ] Every user story maps to at least one acceptance test.
