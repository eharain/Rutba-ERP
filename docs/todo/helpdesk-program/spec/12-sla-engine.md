# 12 — SLA Engine

[← 11 Knowledge Base](11-knowledge-base.md) · [Index](00-index.md) · Next: [13 Automation Engine](13-automation-engine.md)

---

## 12.1 Purpose

Give every ticket a measurable promise, track it against a business calendar, warn before it
breaks, and report honestly when it does.

## 12.2 What exists today

- `sla_due_at` on `contact_tickets`, set **only** on the public `submit` route from a
  caller-supplied `sla_hours` (default 24). Internal tickets get none.
- `POST /contact-tickets/:id/sla-breach` — a client tells the server it breached. If no client
  calls it, nothing happens.
- A **real, generic sweep already exists**: `workflowSlaSweep`
  (`pos-strapi/config/workflow-cron-tasks.js`, every 15 minutes) calls
  `workflow.sweepOverdueStages()`, which scans active SLA-configured workflows and fires a
  deduped `workflow.sla_breach` event per overdue entity. **Flags only — never auto-transitions.**
  It is a no-op until a workflow sets `sla_hours` on a transition.

So the sweep infrastructure is built and proven; what is missing is the **policy model**
(targets per desk and priority), the **business calendar**, **pausing**, and **first-response**
as a separate measurement.

## 12.3 The two clocks

| Clock | Starts | Stops | Why it matters |
|---|---|---|---|
| **First response** | Ticket created | First **public** agent message | The requester's experience of being heard. Stamped once, never recomputed, even after reopen (RULE-18) |
| **Resolution** | Ticket created | Status reaches `resolved` | The requester's experience of being helped. Restarts on reopen |

Both are measured **in business time**, not wall-clock (RULE-8).

## 12.4 Policy model

**`SlaPolicy`** — `name`, `desk`, `business_calendar`, `pause_on_waiting` (bool),
`pause_stages` (json — which stages pause; defaults to every stage whose canonical status is
`waiting`), `is_active`.

**`SlaTarget`** — one row per priority: `priority`, `first_response_minutes`,
`resolution_minutes`, `at_risk_threshold_pct` (default 80), `escalation_steps` (json).

Resolution order for a ticket: catalog item's policy → desk's policy → tenant default. Pinned at
creation; a later policy change does not retroactively breach a compliant ticket (F5).

### Default targets

| Priority | First response | Resolution |
|---|---|---|
| `urgent` | 30 min | 4 business hours |
| `high` | 1 business hour | 8 business hours |
| `normal` | 4 business hours | 3 business days |
| `low` | 1 business day | 5 business days |

## 12.5 Business calendar

Reuses HR's calendar reference data (seeded by the work-calendar seeder) rather than defining a
second one.

`BusinessCalendar` — `name`, `timezone`, `working_days` (per-weekday start/end, supporting split
shifts), `holidays` (rel), `is_default`.

**Calculation rules.**
- Elapsed business time = sum of working intervals between two instants, in the calendar's
  timezone.
- Due-at = the instant at which the target's business minutes will have elapsed, skipping
  non-working time.
- A ticket created outside working hours starts its clock at the next working minute.
- Holidays are excluded wholesale.
- **Timezone is the calendar's, not the server's, not the user's.** Pakistan is UTC+5 with no
  DST, which makes the common case simple — but multi-tenant and multi-region tenants make
  storing everything in UTC and converting at the calendar boundary non-negotiable.
- If no calendar resolves: `sla_state = indeterminate`, a warning is logged, and the ticket is
  still created (§03 F1 — intake never fails).

## 12.6 Pausing

When a ticket enters a stage flagged as pausing (by default any stage mapping to canonical
`waiting`), the clock stops: `sla_paused_at` is stamped, and on resume the elapsed pause is
accumulated into `sla_paused_ms` and `resolution_due_at` is pushed out.

**Only the resolution clock pauses. First response never pauses** — you cannot claim credit for
not having replied yet because you are waiting for the person you have not replied to.

Pausing is configurable per policy, because some desks (regulated SLAs, paid support contracts)
must measure elapsed time regardless.

## 12.7 States and transitions

| `sla_state` | Meaning |
|---|---|
| `ok` | Within target |
| `at_risk` | Past `at_risk_threshold_pct` of the target |
| `breached` | Target passed without the milestone |
| `paused` | Clock stopped |
| `indeterminate` | No calendar/policy resolvable |

Materialised on the ticket so the queue can filter and sort on it without recomputation per row
— the single most important query-performance decision in the module, because "show me what's
breaching" is the most-run query on any desk.

## 12.8 The sweep

Extends the existing `workflowSlaSweep` rather than adding a second scheduler.

- Runs every 15 minutes (configurable); registered via Core's `registerCron`, gated by
  `RUTBA_CORE_CRONS=1` and the selective kill-switch.
- Per run: find non-terminal tickets whose `first_response_due_at` or `resolution_due_at` has
  passed, or crossed the at-risk threshold, since the last run.
- Update `sla_state`, emit `helpdesk.sla.at_risk` / `helpdesk.sla.breached`, run escalation
  steps, notify.
- **Deduped** — one breach event per ticket per milestone, never one per sweep.
- **Flags only.** No auto-transition, no auto-resolve, no auto-approve (RULE-9).
- Idempotent and restart-safe: state is derived from stored timestamps, so a missed run
  catches up rather than losing breaches.

> **Known platform limit to fix:** the workflow cache is per-process with a 30s TTL, and crons
> must run in exactly one process (`RUTBA_CORE_CRONS=1` is documented as leader-only). When Core
> goes multi-instance, sweep leadership needs an explicit lock — otherwise every instance
> escalates the same breach.

## 12.9 Escalation

`escalation_steps` on a target, evaluated in order:

```json
[
  { "at_pct": 80,  "action": "notify",   "to": "assignee" },
  { "at_pct": 100, "action": "notify",   "to": "team_manager" },
  { "at_pct": 100, "action": "priority", "to": "high" },
  { "at_pct": 150, "action": "notify",   "to": "desk_manager" },
  { "at_pct": 200, "action": "reassign", "to": "desk_manager" }
]
```

Every escalation is audited and visible on the ticket timeline. Escalation may raise priority
and reassign; it may never resolve, close or approve.

## 12.10 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/sla/policies` · `/:id` | Policies + targets |
| POST/PATCH | `/api/helpdesk/sla/policies` | Configure (admin) |
| GET | `/api/helpdesk/sla/calendars` · `/holidays` | Calendars |
| GET | `/api/helpdesk/sla/breaches` | Breach log with drill-through |
| GET | `/api/helpdesk/tickets/:id/sla` | Per-ticket detail: targets, elapsed, paused, remaining |
| POST | `/api/helpdesk/sla/recompute` | Admin recompute after config change (audited, bounded) |

## 12.11 Events

`helpdesk.sla.at_risk` · `helpdesk.sla.breached` · `helpdesk.sla.paused` · `.resumed` ·
`helpdesk.sla.escalated`.

## 12.12 Reports & KPIs

Compliance % by desk, priority, agent, branch, catalog item and month · median and p90 first
response · median and p90 resolution · breach count and reasons · at-risk backlog now · pause
time as a share of total (a high value usually means requesters are slow, not agents) ·
imported tickets excluded from every compliance figure.

---

## Acceptance criteria for this section

- [ ] Business-time calculation unit-tested across weekends, holidays, split shifts, out-of-hours
      creation and timezone boundaries.
- [ ] First-response clock never pauses; resolution clock pauses per policy.
- [ ] `first_response_at` survives reopen; resolution clock restarts.
- [ ] Sweep is idempotent, deduped and catches up after downtime.
- [ ] Sweep never transitions a ticket, under any configuration.
- [ ] Policy change does not retroactively breach compliant tickets.
- [ ] Missing calendar yields `indeterminate` and a created ticket, not an error.
- [ ] Multi-instance leadership decided before Core scales out.
