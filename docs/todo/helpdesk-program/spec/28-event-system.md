# 28 — Event System

[← 27 API Specification](27-api-specification.md) · [Index](00-index.md) · Next: [29 Permission Matrix](29-permission-matrix.md)

---

## 28.1 Purpose

Let modules react to each other without importing each other. This is the mechanism behind
"`StockBelowMinimum` raises a ticket" — and it is **the prerequisite that does not yet exist**.

## 28.2 Current state — build this first

Rutba Core has **no domain event bus**. What exists:

- `strapi.eventHub: new EventEmitter()` in `src/compat/strapi.js` — a bare compat stub with no
  persistence, no subscriber registry, no replay, no ordering guarantee, and no cross-process
  delivery. It exists so ported Strapi code that calls `eventHub.emit` does not crash.
- `useDocumentMiddleware()` — a real interception seam around writes, but synchronous and
  coupled to persistence, not a domain event.
- The `notification-engine`'s `processEvent` — a *notification* dispatcher keyed by event name,
  not a general bus. Helpdesk uses it as a **subscriber**, not as the bus.

**Prerequisite P1 is to build `services/core/src/platform/events.js`.** Helpdesk is its first
consumer, but it belongs to Core and every module should use it.

## 28.3 Design (D1)

**Recommendation: DB-backed transactional outbox with in-process dispatch.**

| Option | Verdict |
|---|---|
| In-process `EventEmitter` only | Rejected — events lost on restart, no replay, no audit, no delivery guarantee |
| **DB outbox + in-process dispatch** | **Chosen** — durable, replayable, auditable, ordered per aggregate, no new infrastructure, and it upgrades cleanly |
| External broker (Redis/NATS/Kafka) | Deferred — real operational cost; justified only when Core runs multi-instance at volume. The outbox is the natural feed into one later |

### Mechanics

1. A domain service, inside its transaction, writes the event row to `core_events`.
2. The transaction commits — **the event and the state change are atomic**. No event describes a
   state that was rolled back; no state change silently fails to notify.
3. A dispatcher polls (or is signalled) for unprocessed events and delivers to subscribers.
4. Each subscriber's delivery is tracked separately with attempts and status, so one slow or
   broken subscriber cannot block another.
5. Failures retry with exponential backoff; permanent failures land in a dead-letter view an
   admin can inspect and replay.

The atomicity in step 2 is the whole reason for the outbox. Emitting after commit from
application code loses events on a crash between the two; emitting before commit fires events
for work that never happened.

### Delivery semantics

**At-least-once.** Subscribers must be idempotent. Every event carries a stable `event_id` and
handlers deduplicate on it. Exactly-once delivery is not achievable across a process boundary,
and pretending otherwise produces subtler bugs than accepting at-least-once and designing for it.

**Ordering** is guaranteed per aggregate (per `entity_uid` + `document_id`), not globally.

## 28.4 Event envelope

```jsonc
{
  "event_id": "evt_01J…",                 // ULID, stable, the dedupe key
  "event_name": "helpdesk.ticket.created",
  "version": 1,
  "occurred_at": "2026-08-08T09:12:33.412Z",
  "tenant_id": "rutba-pk",
  "actor": { "type": "user|system|automation|ai|api_token", "id": 42, "label": "Ayesha K." },
  "subject": { "entity_uid": "api::contact-ticket.contact-ticket", "document_id": "tk_…" },
  "payload": { … },                        // event-specific, versioned
  "correlation_id": "req_…",               // the request or job that caused it
  "causation_id": "evt_…"                  // the event that caused this one
}
```

`correlation_id` and `causation_id` are what make a cascade debuggable — "this ticket exists
because that automation ran because that stock event fired" is otherwise archaeology.

**Payloads carry references and changed values, not whole aggregates.** A subscriber that needs
the full ticket reads it. Fat payloads become a second, stale copy of the model and a leak path
for internal notes.

## 28.5 Naming

`<module>.<aggregate>.<event>` — lower snake, past tense: `helpdesk.ticket.created`,
`sale.order.delivered`, `stock.level.below_minimum`, `hr.leave.approved`.

## 28.6 Events Helpdesk publishes

| Event | Payload highlights |
|---|---|
| `helpdesk.ticket.created` | ticket_no, desk, priority, source, requester_kind, subject link |
| `helpdesk.ticket.updated` | changed fields (before/after) |
| `helpdesk.ticket.assigned` / `.unassigned` | from, to, reason |
| `helpdesk.ticket.status_changed` | from_status, to_status, from_stage, to_stage |
| `helpdesk.ticket.resolved` / `.closed` / `.reopened` / `.cancelled` | resolution, code, durations |
| `helpdesk.ticket.merged` / `.split` | source, target |
| `helpdesk.ticket.priority_changed` / `.desk_changed` | from, to |
| `helpdesk.ticket.message.added` | message_id, **visibility**, author_kind, channel |
| `helpdesk.ticket.first_response` | elapsed_business_minutes |
| `helpdesk.ticket.subject_linked` | entity_uid, document_id |
| `helpdesk.sla.at_risk` / `.breached` / `.paused` / `.resumed` / `.escalated` | clock, target, pct |
| `helpdesk.approval.requested` / `.granted` / `.rejected` / `.expired` | step, approver |
| `helpdesk.ticket.rated` | score, has_comment |
| `helpdesk.kb.article.published` / `.deflection` | article, category |
| `helpdesk.automation.rule.executed` / `.failed` / `.disabled_by_breaker` | rule, outcome |
| `helpdesk.attachment.uploaded` / `.quarantined` | file, reason |
| `helpdesk.remote.session.*` | (remote-support epic) |

> `message.added` carries `visibility` but **never the body**. A subscriber that may not read
> internal notes must not receive one through an event payload — the most likely accidental
> leak path in the whole event design.

## 28.7 Events Helpdesk subscribes to

| Source event | Reaction |
|---|---|
| `stock.level.below_minimum` | Create/refresh a reorder investigation ticket |
| `purchase.order.delayed` | Create a supplier-chase ticket |
| `payment.failed` | Create a payment-recovery ticket for the customer |
| `sale.order.delivery_failed` | Create a delivery-exception ticket |
| `sale.order.delivered` | Close related delivery tickets; trigger CSAT where configured |
| `mfg.work_order.blocked` | Create a production-blocker ticket |
| `hr.leave.approved` | Update agent availability for routing eligibility |
| `hr.employee.terminated` | Return their open tickets to the queue |
| `marketplace.order.dispute` | Create a dispute ticket carrying channel identity |
| `crm.contact.merged` | Re-point tickets to the surviving person |
| `workflow.sla_breach` | Existing generic event — map to helpdesk escalation |

All subscriptions run through [13 Automation](13-automation-engine.md), so they are configurable
data, and all are **idempotent on `dedupe_key`** (RULE-16).

## 28.8 Subscriber contract

```js
registerSubscriber({
  name: 'helpdesk.stock-below-minimum',
  events: ['stock.level.below_minimum'],
  handler: async (event) => { /* idempotent on event.event_id + dedupe_key */ },
  maxAttempts: 5,
  backoff: 'exponential',
})
```

Handlers must be idempotent, must not assume ordering across aggregates, must complete or fail
fast (bounded timeout), and must never throw for business reasons — a business no-op is a
success, not a retry.

## 28.9 Storage

**`core_events`** — `event_id` (unique), `event_name`, `version`, `occurred_at`, `tenant_id`,
`actor` (json), `entity_uid`, `document_id`, `payload` (json), `correlation_id`, `causation_id`,
`created_at`.
**`core_event_deliveries`** — `event_id`, `subscriber`, `status`
(`pending|delivered|failed|dead`), `attempts`, `last_attempt_at`, `last_error`.

Indexes: `(status, occurred_at)` for the dispatcher, `(entity_uid, document_id)` for aggregate
history, `(event_name, occurred_at)` for replay and reporting.

Retention is configurable (default 90 days for delivered, indefinite for dead-lettered until
resolved). The event log is **not** the audit log — see [30](30-audit-logging.md) — though the
two are correlated by `correlation_id`.

## 28.10 Operations

Admin surface: event stream with filters, delivery status per subscriber, dead-letter queue with
replay, per-subscriber lag, per-event-name volume. Alerts on: dispatcher lag above threshold,
dead-letter growth, a subscriber failing repeatedly.

**Multi-instance:** the dispatcher must run in exactly one process, matching the existing cron
model (`RUTBA_CORE_CRONS=1`, documented as leader-only). When Core scales out, both the
dispatcher and the SLA sweep need a real leader lock — currently a known, documented gap rather
than a solved problem.

## 28.11 Testing

Atomicity: a failed transaction leaves no event. Idempotency: replaying an event produces no
duplicate side effect. Ordering per aggregate under concurrency. Dead-letter and replay.
Cascade depth limits (§13.5). Poison-message handling: one bad event never blocks the queue.

---

## Acceptance criteria for this section

- [ ] Event write and state change are atomic — proven by a rollback test.
- [ ] At-least-once delivery with idempotent handlers, proven by forced redelivery.
- [ ] Ordering guaranteed per aggregate.
- [ ] Dead-letter queue with admin replay.
- [ ] One failing subscriber does not block others.
- [ ] `message.added` never carries a body; internal content never leaves via events.
- [ ] `correlation_id` / `causation_id` trace a full cascade end to end.
- [ ] Leadership behaviour defined before Core runs multi-instance.
