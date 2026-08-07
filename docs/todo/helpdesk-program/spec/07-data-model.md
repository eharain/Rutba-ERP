# 07 — Data Model

[← 06 Navigation & Menus](06-navigation-and-menus.md) · [Index](00-index.md) · Next: [08 Ticket Lifecycle](08-ticket-lifecycle.md)

---

## 7.1 Purpose

Every entity, its fields, relationships, validation, indexes and events. Physical storage,
migrations and DDL are [37 Database & Domain Model](37-database-and-domain-model.md); this
section is the **domain** model.

## 7.2 Entity map

```
Desk ──┬── Team ──── TeamMember
       ├── Queue
       ├── SlaPolicy ──── SlaTarget          (per priority)
       ├── ServiceCatalogItem ──── CatalogField
       ├── AutomationRule
       ├── Macro
       └── Ticket ──┬── TicketMessage
                    ├── TicketAttachment
                    ├── TicketWatcher
                    ├── TicketParticipant
                    ├── TicketApproval ──── ApprovalStep
                    ├── TicketTimeEntry
                    ├── TicketRating
                    ├── TicketLink            (merge / split / relates-to)
                    └── TicketActivity        (audit)

Workflow (shared platform entity — NOT helpdesk-owned)
BusinessCalendar / Holiday (shared — HR-owned)
KbCategory ──── KbArticle ──── KbArticleVersion
Person / User / Employee / Branch  (existing, referenced)
```

**Two things Helpdesk deliberately does not own:** the `Workflow` entity (shared platform,
[09](09-ticket-workflows.md)) and business calendars (HR reference data). Owning either would
fork a platform capability.

---

## 7.3 Ticket — the aggregate root

Backed by the existing `contact_tickets` table, extended additively (standing decision 1).

### Existing fields (retained, unchanged semantics)

| Field | Type | Notes |
|---|---|---|
| `ticket_no` | uid | Human reference; format configurable (§32) |
| `subject` | string, required | ≤ 200 chars |
| `message` | text, required | The opening body. **Retained** for back-compat; the canonical opening text is also the first `TicketMessage` |
| `status` | enum | Extended — see below |
| `sla_due_at` | datetime | Legacy resolution due; superseded by the explicit target fields, kept in sync |
| `resolved_at` | datetime | |
| `last_reply_by` | enum `user\|agent` | Denormal, retained for legacy callers |
| `last_reply_at` | datetime | Denormal |
| `metadata` | json | Legacy `latest_reply` continues to be written for two releases (F13) |
| `user` | rel → users-permissions.user | Requester's login, when they have one |
| `person` | rel → person | Canonical identity — the join to CRM |
| `assigned_to` | rel → users-permissions.user | Now actually written (F3) |
| `category` | enum | **Deprecated**, back-filled from `desk`; retained for legacy callers |
| `employee` | rel → hr-employee | Internal requester |

### New fields

| Field | Type | Required | Default | Purpose |
|---|---|---|---|---|
| `desk` | rel → Desk | ✔ | tenant default | RULE-1 |
| `priority` | enum `low\|normal\|high\|urgent` | ✔ | desk default | Ordering + SLA |
| `source` | enum `web\|portal\|email\|phone\|whatsapp\|walk_in\|internal\|api\|system\|marketplace` | ✔ | `api` | Channel |
| `requester_kind` | enum `customer\|employee\|supplier\|system\|anonymous` | ✔ | derived | Surface + policy |
| `branch` | rel → branch | | requester's | Branch scope (§33) |
| `team` | rel → Team | | | Routing/reporting |
| `subject_entity_uid` | string | | | Generic subject link (F6) |
| `subject_document_id` | string | | | |
| `catalog_item` | rel → ServiceCatalogItem | | | Set when raised from the catalog |
| `custom_fields` | json | | `{}` | Catalog-item field values |
| `workflow` | rel → Workflow | | desk's | Bound at creation; see §09 |
| `stage_key` | string | | workflow's initial | Current configurable stage |
| `sla_policy` | rel → SlaPolicy | | desk's | Bound at creation |
| `first_response_due_at` | datetime | | computed | |
| `first_response_at` | datetime | | | Stamped once, never recomputed (RULE-18) |
| `resolution_due_at` | datetime | | computed | Replaces the legacy `sla_due_at` role |
| `sla_state` | enum `ok\|at_risk\|breached\|paused\|indeterminate` | ✔ | `ok` | Derived, materialised for querying |
| `sla_paused_at` / `sla_paused_ms` | datetime / integer | | | Clock pausing while awaiting requester |
| `resolution` | text | | | Required when the desk demands it (RULE-6) |
| `resolution_code` | rel → ResolutionCode | | | Structured reason for reporting |
| `closed_at` | datetime | | | Close ≠ resolve |
| `reopened_count` | integer | ✔ | 0 | |
| `merged_into` | rel → Ticket | | | RULE-14 |
| `split_from` | rel → Ticket | | | |
| `tags` | json (string[]) | | `[]` | |
| `is_imported` | boolean | ✔ | false | Excluded from SLA compliance reporting (F12) |
| `origin_event` | json | | | Event name + payload for system-raised tickets (BR-Y3) |
| `dedupe_key` | string, indexed | | | Idempotency for event-raised tickets (RULE-16) |
| `owners` | manyToMany → user | | | Row-level ownership, standing convention |
| `archived_at` | datetime | | | Soft archive; deletion is not supported (RULE-13) |

### Status enum (extended additively)

`open` · `in_progress` · `waiting` *(existing)* · `resolved` *(existing)* · **`closed`** ·
**`cancelled`** · **`merged`**

> Existing values keep their meaning and their rows. `waiting` is refined into a stage-level
> distinction (`waiting_customer` / `waiting_supplier` / `waiting_internal`) via configurable
> **stages**, all of which map to the canonical `waiting` status — this is exactly the
> workflow engine's `maps_to_status` mechanism and the reason the lifecycle is configurable
> without an enum migration per desk.

### Validation

- `subject` non-empty, ≤200; `message` non-empty on create.
- `desk` must be active; `priority` must exist in the desk's allowed set.
- `status` is never directly writable — transitions only (RULE-4).
- `resolution` required when `desk.require_resolution_note` and target status is `resolved`.
- `subject_entity_uid` must be a registered Core UID; `subject_document_id` must resolve.
- `merged_into` must not create a cycle (RULE-17).
- `dedupe_key` unique among non-terminal tickets.

### Indexes

`(desk, status)` · `(assigned_to, status)` · `(status, resolution_due_at)` for the SLA sweep ·
`(person)` · `(subject_entity_uid, subject_document_id)` · `(branch, status)` ·
`(dedupe_key)` unique-partial where status not terminal · `ticket_no` unique ·
`(created_at)` · full-text on `(subject, message)` — see [26 Search](26-search-and-filtering.md).

### Events

`created` · `updated` · `assigned` · `unassigned` · `status_changed` · `resolved` · `closed` ·
`reopened` · `cancelled` · `merged` · `split` · `priority_changed` · `desk_changed` ·
`subject_linked` · `sla.at_risk` · `sla.breached` · `rated`. Full contracts in [28](28-event-system.md).

---

## 7.4 TicketMessage

The thread. **This entity is what fixes the module's central defect** — today replies overwrite
`metadata.latest_reply` and only the newest survives.

| Field | Type | Notes |
|---|---|---|
| `ticket` | rel → Ticket, required | Aggregate parent |
| `body` | text, required | |
| `body_format` | enum `text\|html\|markdown` | Default `text`; HTML sanitised on write |
| `visibility` | enum `public\|internal`, required | RULE-10 |
| `author` | rel → user | Null for system/anonymous |
| `author_kind` | enum `requester\|agent\|system\|automation\|ai` | |
| `author_label` | string | Snapshot of display name at write time |
| `channel` | enum, as `source` | How it arrived or was sent |
| `in_reply_to` | rel → TicketMessage | Optional threading |
| `attachments` | media, multiple | |
| `external_id` | string | Email Message-ID / WhatsApp id, for dedupe |
| `delivery_state` | json | Per-recipient sent/failed for outbound |
| `redacted_at`, `redacted_by`, `redaction_reason` | | Tombstone, admin-only, audited |
| `is_first_response` | boolean | Denormal for reporting |

**Validation.** Non-empty body. Only agents may write `visibility: internal`. Append-only —
no edit endpoint. `external_id` unique per channel for idempotent inbound.

**Indexes.** `(ticket, created_at)` · `(visibility)` · `(external_id)` unique-partial.

> **Storage decision.** Reuse the generic `work-item-comment` store (`entity_uid` +
> `target_document_id`), adding `visibility`, `author_kind`, `channel`, `external_id` and the
> redaction columns — *or* create a dedicated `helpdesk_ticket_messages` table.
> **Recommendation: dedicated table.** The generic store's core `find` route is already exposed
> to the manufacturing and order-management domains; every additional consumer widens the
> surface on which a single mistake leaks internal notes across modules. Helpdesk's thread has
> materially different requirements (channels, delivery state, redaction, inbound idempotency)
> and by far the highest confidentiality stakes. Keep `work-item-comment` for work-item
> discussion; give the ticket thread its own table and its own single authorization gate.
> *(This revises the earlier "reuse the comment store" leaning in the pre-Core overview.)*

---

## 7.5 Desk

The generality mechanism — a new area of the business is a row, not a release.

| Field | Type | Notes |
|---|---|---|
| `key`, `name`, `description` | string | `key` unique per tenant |
| `is_active`, `sequence` | boolean, integer | |
| `visibility_mode` | enum `member_only\|org_visible\|restricted` | §04.4 |
| `default_priority` | enum | |
| `default_assignee` / `default_team` | rel | |
| `workflow` | rel → Workflow | Configurable lifecycle |
| `sla_policy` | rel → SlaPolicy | |
| `business_calendar` | rel → BusinessCalendar | |
| `allow_anonymous` | boolean | Public intake |
| `require_resolution_note` | boolean | RULE-6 |
| `grant_line_manager_access` | boolean | Preserves ESS/HR behaviour (§04.5) |
| `requester_kinds` | json | Which requester types this desk accepts |
| `reopen_window_days` | integer | Default 14 |
| `auto_close_after_days` | integer | Resolved → closed sweep; default 7 |
| `csat_enabled` | boolean | |
| `email_address` | string | Inbound alias for this desk |
| `branches` | manyToMany → branch | Empty = all branches |
| `category_map` | json | Legacy `category` value → this desk (F13) |

**Validation.** A desk cannot be saved without a workflow, an SLA policy and a calendar
(RULE-7). Deactivating a desk with open tickets requires a target desk to move them to.

**Seeded desks:** Customer Support · IT · HR · Facilities · Field Service · Warranty/RMA ·
Maintenance.

---

## 7.6 Supporting entities

### Team / TeamMember
`name`, `desk`, `manager`, `members[]`, `working_hours`, `skills[]`, `is_active`.
Membership carries `role_in_team` (`member` | `lead`) and `capacity_weight` for load balancing.

### Queue
A named, ordered, saved view: `name`, `desk`, `filter` (json), `sort`, `columns`, `owner`,
`shared_with_team`, `sequence`. Queues are views, never a second copy of tickets.

### SlaPolicy / SlaTarget
Policy: `name`, `desk`, `business_calendar`, `pause_on_waiting`, `is_active`.
Target (one per priority): `priority`, `first_response_minutes`, `resolution_minutes`,
`escalation_steps` (json). See [12](12-sla-engine.md).

### ServiceCatalogItem / CatalogField
Item: `key`, `name`, `description`, `icon`, `category`, `desk`, `workflow`, `sla_policy`,
`approval_chain` (json), `visibility_roles`, `visibility_branches`, `is_active`.
Field: `key`, `label`, `type` (`text|textarea|number|date|select|multiselect|user|entity|file|boolean`),
`required`, `options`, `validation`, `sequence`, `help_text`, `conditional_on`. See [10](10-service-catalog.md).

### AutomationRule
`name`, `desk`, `trigger` (event | schedule | condition-change), `conditions` (json),
`actions` (json), `is_active`, `run_order`, `last_run_at`, `failure_count`. See [13](13-automation-engine.md).

### Macro
`name`, `desk`, `message_template`, `field_changes` (json), `transition`, `visibility_roles`.

### TicketApproval / ApprovalStep
Approval: `ticket`, `catalog_item`, `status` (`pending|approved|rejected|cancelled|expired`),
`current_step`, `requested_at`, `completed_at`.
Step: `sequence`, `approver` | `approver_role`, `mode` (`sequential|parallel|any_of`),
`status`, `decided_by`, `decided_at`, `reason`, `timeout_hours`, `delegate_to`. See [23](23-approval-workflows.md).

### TicketTimeEntry
`ticket`, `user`, `minutes`, `activity_type`, `is_billable`, `note`, `started_at`, `ended_at`.

### TicketRating
`ticket`, `person`, `score` (1–5), `comment`, `submitted_at`. One per ticket per resolution
cycle; a reopen permits a new rating.

### TicketWatcher / TicketParticipant
`ticket`, `user` (watcher) or `person` (participant), `added_by`, `added_at`, `notify_on` (json).

### TicketLink
`from_ticket`, `to_ticket`, `link_type` (`merged_into|split_from|relates_to|duplicate_of|blocks|blocked_by`),
`created_by`. Cycles rejected (RULE-17).

### TicketActivity
The audit trail — `entity_uid`, `target_document_id`, `kind`, `summary`, `from_value`,
`to_value`, `actor`, `actor_label`, `data`, plus `ip`, `user_agent`, `reason`, `source`
(`ui|api|automation|ai|import|system`). Append-only (RULE-12). See [30](30-audit-logging.md).

### ResolutionCode
`key`, `name`, `desk`, `is_active`, `requires_note`, `counts_as_resolved` — structured
resolution reasons, so "why do tickets close?" is reportable rather than free text.

### KbCategory / KbArticle / KbArticleVersion
See [11 Knowledge Base](11-knowledge-base.md).

---

## 7.7 Relationships to existing ERP entities

| Relation | Target | Cardinality | Cascade |
|---|---|---|---|
| `person` | `api::person.person` | many→one | None — ticket survives |
| `user` / `assigned_to` / `owners` | users-permissions.user | many→one / m2m | None |
| `employee` | `api::hr-employee` | many→one | None |
| `branch` | `api::branch.branch` | many→one | None |
| `subject_*` | any Core entity | polymorphic by UID | **None** — reference only |
| `attachments` | media | one→many | Delete with ticket only on hard purge |

**No cascade deletes, anywhere.** Tickets are evidence; they outlive the records they describe.

---

## 7.8 Derived / read models

Computed, never stored as drift-prone counters: open-ticket count per desk/agent/queue,
total time logged per ticket, SLA countdown, thread message count, requester ticket history,
"tickets about this entity". Materialise only where a query proves too slow, and then via a
refresh with an explicit invalidation path — the same discipline the stock-level cache follows.

---

## Acceptance criteria for this section

- [ ] All new columns are additive; no existing column dropped or narrowed.
- [ ] `status` extension verified against live `contact_tickets` rows.
- [ ] Backfill migration proven: every existing `metadata.latest_reply` becomes a message row.
- [ ] `category` → `desk` mapping covers every value present in live data.
- [ ] Indexes verified against the queue, SLA-sweep and search query plans.
- [ ] No cascade delete exists on any ticket relation.
- [ ] Thread storage decision (dedicated table) ratified — or consciously overridden.
