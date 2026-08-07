# 13 — Automation Engine

[← 12 SLA Engine](12-sla-engine.md) · [Index](00-index.md) · Next: [14 Assignment & Routing](14-assignment-and-routing.md)

---

## 13.1 Purpose

Let the desk run itself for the predictable cases, so agents spend their time on the
unpredictable ones. This is also the mechanism by which **ERP events become tickets** — the
capability that makes an ERP-native helpdesk different from a bolted-on one.

## 13.2 Rule anatomy

```
TRIGGER  →  CONDITIONS  →  ACTIONS
```

**`AutomationRule`** — `name`, `description`, `desk` (null = tenant-wide), `trigger` (json),
`conditions` (json), `actions` (json), `is_active`, `run_order`, `run_as` (system identity),
`last_run_at`, `run_count`, `failure_count`, `max_runs_per_ticket`.

### Triggers

| Type | Fires on | Example |
|---|---|---|
| `domain_event` | Any Core event (P1 event bus) | `sale.order.delivered`, `stock.below_minimum` |
| `ticket_event` | Helpdesk's own events | `helpdesk.ticket.created` |
| `field_change` | A watched field changing | `priority` → `urgent` |
| `schedule` | Cron expression | Nightly stale-ticket sweep |
| `time_since` | Elapsed relative to a timestamp | 48h since `last_reply_at` |
| `manual` | An agent runs it | "Escalate to engineering" |

### Conditions

A declarative expression tree — `all` / `any` / `not` over comparisons on ticket fields,
requester attributes, subject-entity fields, time-of-day, calendar state and event payload.
No arbitrary code execution: conditions are data, evaluated by the engine.

```json
{ "all": [
  { "field": "desk.key",  "op": "eq", "value": "customer-support" },
  { "field": "priority",  "op": "in", "value": ["high", "urgent"] },
  { "any": [
    { "field": "source", "op": "eq", "value": "whatsapp" },
    { "field": "requester.is_vip", "op": "eq", "value": true }
  ]}
]}
```

### Actions

`assign` · `route` · `set_priority` · `set_desk` · `set_team` · `transition` · `add_tag` ·
`remove_tag` · `add_watcher` · `reply` (template) · `add_internal_note` · `notify` ·
`create_ticket` · `link_subject` · `set_field` · `request_approval` · `call_ai` ·
`emit_event` · `webhook`.

## 13.3 ERP events → tickets

The headline capability. Examples shipped as seeded, **disabled-by-default** rules:

| Event | Rule | Resulting ticket |
|---|---|---|
| `stock.below_minimum` | Create reorder investigation | Desk: Maintenance · Priority: high · Subject: the product · Dedupe: product + open |
| `purchase.delayed` | Create supplier chase | Desk: Customer Support · Subject: the PO · Watcher: purchasing manager |
| `payment.failed` | Create payment-recovery ticket | Desk: Customer Support · Subject: the order · Requester: the customer |
| `sale.order.delivery_failed` | Create delivery exception | Desk: Field Service · Subject: the order · Branch from the order |
| `mfg.work_order.blocked` | Create production blocker | Desk: Maintenance · Priority: urgent |
| `hr.leave.rejected` | Offer an HR follow-up | Desk: HR · Requester: the employee |
| `helpdesk.sla.breached` | Escalate | Notify manager, raise priority |
| `marketplace.order.dispute` | Create dispute ticket | Desk: Customer Support · Channel identity retained |

**Idempotency is mandatory (RULE-16).** Every event-raised rule computes a `dedupe_key`
(typically `rule.key + subject_entity_uid + subject_document_id`). If an open ticket with that
key exists, the rule **updates** it — appending a note recording the recurrence — rather than
creating a second one. Without this, one flapping stock level produces four hundred tickets
overnight and the desk is abandoned by lunchtime.

Rules may also **resolve**: an event signalling the condition cleared can transition the open
ticket to `resolved` with a system resolution code (BR-Y4). This is the one place automation may
resolve a ticket, and only for tickets automation itself created.

## 13.4 Common desk automations (seeded, off by default)

| Rule | Trigger | Action |
|---|---|---|
| Auto-acknowledge | `ticket.created` | Public reply from a template with the reference number |
| First-touch routing | `ticket.created` | `route` per [14](14-assignment-and-routing.md) |
| VIP flag | `ticket.created`, requester is VIP | Priority `high`, tag `vip`, notify manager |
| Reopen on reply | requester replies to `resolved` | Transition to `open` |
| Stale nudge | 48h since `last_reply_at` in `waiting_customer` | Reminder to requester |
| Auto-close | 7 days in `resolved` | Transition to `closed` |
| Out-of-hours notice | `ticket.created` outside calendar | Public reply setting expectations |
| Duplicate detection | `ticket.created` | AI similarity check → internal note linking candidates |
| CSAT request | `ticket.resolved` | Send rating request |
| Language routing | `ticket.created`, body detected Urdu | Route to an Urdu-capable team |

## 13.5 Execution model

1. Trigger fires (event bus, field-change hook, or scheduler).
2. Load active rules matching the trigger, ordered by `run_order`.
3. For each: evaluate conditions → if true, execute actions in order.
4. Every action runs **as `run_as`** and is permission-checked (RULE-15).
5. Every action writes an audit row with `source: automation` and the rule name.
6. Failures are recorded per rule and per ticket; a failing action does not abort the others
   unless the rule is marked `atomic`.

### Loop protection — non-negotiable

An automation engine that can create and modify tickets can trivially create an infinite loop.

| Guard | Rule |
|---|---|
| Per-ticket cap | `max_runs_per_ticket` (default 10) per rule |
| Cascade depth | An action-triggered rule may not cascade beyond depth 3 |
| Self-trigger | A rule never re-triggers itself on its own change |
| Global rate | Per-tenant ceiling on automation actions per minute; excess queues and alarms |
| Circuit breaker | A rule failing N times consecutively auto-disables and notifies the admin |

Every guard trip is logged and visible in the run log — silently dropping automation is as bad
as looping.

## 13.6 The run log

A first-class screen, not a debug afterthought. Every evaluation records: rule, trigger, ticket,
conditions result, actions attempted, outcome, duration, error. Filterable by rule, outcome and
date; retained per the retention policy.

Automation is the feature most likely to behave unexpectedly and the hardest to reason about
after the fact. The run log is what makes it supportable.

## 13.7 Testing and safety

- **Dry-run mode**: evaluate against real tickets and report what *would* happen, changing
  nothing. Required before enabling any rule that writes.
- **Simulation**: run a draft rule against the last 30 days and report match count — the fastest
  way to catch a condition that matches everything.
- **Staged rollout**: enable a rule for one desk or branch before tenant-wide.
- **Seeded rules ship disabled.** An automation that starts acting the moment it is deployed is
  a production incident waiting to happen.

## 13.8 API

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/helpdesk/automation/rules` | Manage rules |
| POST | `/api/helpdesk/automation/rules/:id/enable` · `/disable` | Toggle |
| POST | `/api/helpdesk/automation/rules/:id/dry-run` | Evaluate without acting |
| POST | `/api/helpdesk/automation/rules/:id/simulate` | Historical match count |
| POST | `/api/helpdesk/automation/rules/:id/run` | Manual trigger |
| GET | `/api/helpdesk/automation/runs` | Run log |

## 13.9 Events

`helpdesk.automation.rule.executed` · `.failed` · `.disabled_by_breaker` · `.guard_tripped`.

## 13.10 Permissions

`helpdesk.automation.read` (manager+) · `helpdesk.automation.configure` (admin) ·
`helpdesk.automation.run` (manual rules; manager+).

## 13.11 KPIs

Rules active · actions per day · % tickets touched by automation · auto-assignment rate ·
auto-resolution rate for system tickets · guard trips · breaker trips · mean rule latency ·
dedupe hit rate (how many duplicate tickets were prevented).

---

## Acceptance criteria for this section

- [ ] Every loop guard has a test that trips it deliberately.
- [ ] Event-raised tickets are idempotent — 100 identical events yield one ticket.
- [ ] Automation cannot exceed `run_as` permissions, proven by a negative test.
- [ ] Every automated action is audited with the rule name and `source: automation`.
- [ ] Dry-run changes nothing, proven by a write-assertion.
- [ ] Seeded rules ship disabled.
- [ ] Automation may only resolve tickets it created.
