# 37 — Database & Domain Model (Rutba Core)

[← 36 Security Requirements](36-security-requirements.md) · [Index](00-index.md) · Next: [38 UI/UX Specifications](38-ui-ux-specifications.md)

---

## 37.1 Purpose

How the domain model of [07](07-data-model.md) is expressed in code and persisted — and the one
platform decision that has to be made before any of it is written.

## 37.2 Domain layer

```
services/core/src/domain/helpdesk/
  ticket.service.js          TicketService        create, transition, assign, merge, split, link
  message.service.js         MessageService       thread read model + append + redaction
  sla.service.js             SLAService           targets, business time, pause, sweep
  routing.service.js         AssignmentService    strategies + eligibility
  automation.service.js      AutomationService    rules, conditions, actions, guards
  catalog.service.js         ServiceCatalogService
  knowledge.service.js       KnowledgeService
  approval.service.js        ApprovalService
  portal.service.js          PortalService        requester read model — separate on purpose
  desk.service.js            DeskService          configuration
  repository/                data access, tenant- and permission-scoped
  policy/                    entitlement checks, one place
services/core/src/modules/helpdesk.js    routes + event subscriptions only
```

**Rules.**
1. Services take an **actor** and enforce entitlement. HTTP is not the gate.
2. Services are the only writers. No controller, cron, event handler or AI action writes
   directly.
3. `PortalService` is a **separate service**, not a flag on `TicketService`. The requester read
   model has different rules (RULE-10, RULE-11) and deserves its own tested boundary rather than
   a boolean threaded through shared code.
4. Repositories own tenant and permission scoping so a forgotten call site cannot leak.
5. Services emit events through the outbox inside their transaction ([28](28-event-system.md)).
6. No service imports another module's service; cross-module reaction is by event.

## 37.3 Persistence reality (D2 — decide before building)

Core is a **strangler**: it serves the same descriptor contract from the same database, deriving
tables from services/strapi's `schema.json` files. The program's standing rule is that `schema.json`
stays services/strapi-owned until a module's migration hands its tables to SQL migrations —
and `validate-schema` must exit clean, because the shim is only correct while the registry's
derivation matches the live schema.

Helpdesk is greenfield, which forces the question early.

| Option | Pros | Cons |
|---|---|---|
| **A. All tables via services/strapi `schema.json`** | Zero platform work; Strapi admin sees the data; `validate-schema` stays clean | A Core-native module depends on the app Core is replacing. Every new table needs a Strapi content-type that nothing uses |
| **B. All tables via Core SQL migrations** | Genuinely Core-native; Helpdesk becomes the migration pilot | Requires building the migration runner (P7); tables invisible to the shim's registry and to Strapi admin |
| **C. Hybrid (recommended)** | `contact_tickets` stays in `schema.json` (it already exists and legacy routes depend on it); **new** helpdesk tables ship as Core migrations | Two mechanisms during the transition — but that is what a strangler is |

**Recommendation: C.** Extend `contact_tickets` through `schema.json` (additive columns only,
keeping `validate-schema` clean and the legacy Strapi routes working), and create every new
table — messages, desks, SLA policies, catalog, automation, approvals — via Core migrations.
This makes Helpdesk the pilot for P7 without destabilising the shim, and it means the module's
own data is Core-owned from day one.

**Consequence to accept consciously:** Core-migrated tables are not in the schema registry, so
`documents()` cannot serve them and Strapi admin cannot see them. Helpdesk's repositories use
knex directly for those tables. Given the module has its own app and its own API, losing Strapi
admin visibility costs nothing real — but it must be a decision, not a discovery.

## 37.4 Migration plan

| # | Migration | Notes |
|---|---|---|
| M1 | Extend `contact_tickets` — new columns, all nullable or defaulted | Additive; no existing column altered |
| M2 | Extend `status` enum with `closed`, `cancelled`, `merged` | Additive |
| M3 | Create `helpdesk_desks` + seed the seven desks | Core migration |
| M4 | Create `helpdesk_ticket_messages` | Core migration |
| M5 | **Backfill** `metadata.latest_reply` → message rows | Idempotent; verified by count |
| M6 | Backfill `desk` from `category` via each desk's `category_map` | Every live `category` value must map |
| M7 | Backfill `stage_key` from `status` ([08 §8.9](08-ticket-lifecycle.md)) | No status value changes |
| M8 | Create SLA policy/target/calendar tables + seed defaults | |
| M9 | Backfill SLA targets on open tickets | Compliant tickets must not become retroactively breached |
| M10 | Create catalog, automation, routing, approval, macro, resolution-code tables | |
| M11 | Create `core_events` + `core_event_deliveries` | Platform (P1) |
| M12 | Indexes per [07 §7.3](07-data-model.md) and [35 §35.4](35-performance-requirements.md) | Concurrently where the engine supports it |
| M13 | Audit extensions + hash-chain columns | Platform (P4) |

**Every migration is:** reversible or explicitly documented as one-way; idempotent; tested against
a copy of live data; and preceded by a backup. M5 and M6 are the two with real risk — M5 because
it is the only chance to recover existing reply history, M6 because an unmapped `category` value
would leave tickets deskless.

## 37.5 Physical notes

- Naming follows the existing Strapi 5 derivation for `contact_tickets`; Core-owned tables use
  plain `helpdesk_*` snake_case.
- `documentId` retained on new tables for cross-app consistency, alongside an internal `id`.
- Timestamps in UTC; converted at the business-calendar boundary ([12 §12.5](12-sla-engine.md)).
- JSON columns (`custom_fields`, `tags`, `metadata`, `payload`) — indexed via generated columns
  where they are filtered on. A JSON column that is queried without an index is a table scan
  waiting for volume.
- Foreign keys with **no cascade delete anywhere** ([07 §7.7](07-data-model.md)).
- Soft archive (`archived_at`); no hard delete of tickets (RULE-13).
- Partition `helpdesk_ticket_messages` and audit tables by month at scale.

## 37.6 Transactions

Core provides `withTransaction()` via AsyncLocalStorage — ambient, and every shim query joins
automatically. Helpdesk services use it for: create (ticket + first message + SLA + audit +
event), transition (status + side effects + audit + event), merge, and approval decisions.

**The event outbox write is inside the transaction** — that atomicity is the entire reason for
choosing an outbox ([28 §28.3](28-event-system.md)).

Knex-direct repositories on Core-owned tables must join the ambient transaction, not open their
own connection — otherwise a rollback leaves helpdesk tables written and `contact_tickets`
reverted, which is the worst possible outcome.

## 37.7 Testing

Unit tests per service with a fake repository. Integration tests against a real database with
two tenants populated ([34 §34.9](34-multi-tenant-considerations.md)). Migration tests against a
copy of live data, asserting row counts before and after. Concurrency tests for claim races,
simultaneous transitions and ticket-number allocation. A `validate-schema` run after M1–M2 to
prove the shim still derives the live schema correctly.

---

## Acceptance criteria for this section

- [ ] D2 decided and recorded before any migration is written.
- [ ] `validate-schema` exits clean after the `contact_tickets` extension.
- [ ] Every migration idempotent and tested against a copy of live data.
- [ ] M5 recovers every existing `metadata.latest_reply` as a message row.
- [ ] M6 maps every live `category` value to a desk.
- [ ] M9 does not retroactively breach a compliant ticket.
- [ ] No cascade delete on any relation.
- [ ] Knex-direct repositories join the ambient transaction — proven by a rollback test spanning
      both `contact_tickets` and a Core-owned table.
- [ ] Services enforce entitlement without HTTP.
