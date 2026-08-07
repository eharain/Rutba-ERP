# 08 — Ticket Lifecycle

[← 07 Data Model](07-data-model.md) · [Index](00-index.md) · Next: [09 Ticket Workflows](09-ticket-workflows.md)

---

## 8.1 Purpose

The states a ticket can be in, and the rules for moving between them.

## 8.2 The central design decision

> **Rutba already has a configurable workflow engine, so the ticket lifecycle is reusable and
> configurable — not hardcoded.**

This is the architectural spine of the module. Concretely, it means a **two-layer** model:

| Layer | Owned by | Changes how | Purpose |
|---|---|---|---|
| **Canonical statuses** | Code (this document) | Release | A small, fixed vocabulary that side effects, reports, SLA and integrations key on |
| **Stages** | Configuration (per desk) | Data | The business's own step names, transitions and gates |

Every stage declares `maps_to_status`. The engine validates the *stage* transition; the side
effects fire on the *canonical status*. That is what lets a tenant invent
`Awaiting Parts From Supplier` without any code knowing it exists — while SLA pausing,
reporting, notification routing and the customer portal keep working, because that stage maps
to canonical `waiting`.

**Why this matters beyond Helpdesk:** it is the same engine HR leave requests, manufacturing
work orders and sale orders use. Helpdesk *configures* it; it does not fork it. The engine is
being promoted from `pos-strapi/src/utils/workflow-engine.js` to a Core platform service
(prerequisite P2, [00 Index](00-index.md)), and Helpdesk is its first Core-native consumer.

## 8.3 Canonical statuses

| Status | Meaning | Terminal | SLA clock |
|---|---|---|---|
| `open` | Received, not yet being worked | No | Running |
| `in_progress` | An agent is actively working it | No | Running |
| `waiting` | Blocked on someone else — requester, supplier, or another team | No | **Paused** (if policy says so) |
| `resolved` | A resolution has been offered; the requester may still reject it | No | Stopped |
| `closed` | Finished. Immutable except reopen | **Yes** | Stopped |
| `cancelled` | Withdrawn or invalid; never worked to a resolution | **Yes** | Stopped |
| `merged` | Absorbed into another ticket; a redirect | **Yes** | Stopped |

Three of these (`closed`, `cancelled`, `merged`) are new; the four existing values keep their
meaning and their live rows (standing decision 1).

**Why `resolved` and `closed` are distinct.** `resolved` means *we think we're done*;
`closed` means *it stayed done*. Auto-close after N days converts one to the other. Collapsing
them loses the reopen signal, which is one of the most honest quality metrics a desk has.

## 8.4 Reference lifecycle (the default workflow)

Shipped as the seeded default. Any desk may replace it entirely.

```
                    ┌─────────────┐
                    │    open     │◄──────── reopen ────────┐
                    └──────┬──────┘                          │
                           │ start work                      │
                           ▼                                 │
                    ┌─────────────┐                          │
          ┌────────►│ in_progress │◄─────┐                   │
          │         └──────┬──────┘      │                   │
          │                │             │ unblock           │
     resume│         block │             │                   │
          │                ▼             │                   │
          │         ┌─────────────┐──────┘                   │
          └─────────│   waiting   │                          │
                    └──────┬──────┘                          │
                           │ resolve                         │
                           ▼                                 │
                    ┌─────────────┐                          │
                    │  resolved   │──────────────────────────┘
                    └──────┬──────┘
                           │ auto-close after N days, or close
                           ▼
                    ┌─────────────┐
                    │   closed    │───── reopen (within window) ──► open
                    └─────────────┘

  Any non-terminal state ──► cancelled          (withdraw / invalid)
  Any non-terminal state ──► merged             (duplicate)
```

### Default stages over these statuses

| Stage key | Label | `maps_to_status` |
|---|---|---|
| `new` | New | `open` |
| `triaged` | Triaged | `open` |
| `working` | In Progress | `in_progress` |
| `waiting_customer` | Awaiting Customer | `waiting` |
| `waiting_supplier` | Awaiting Supplier | `waiting` |
| `waiting_internal` | Awaiting Another Team | `waiting` |
| `pending_approval` | Awaiting Approval | `waiting` |
| `resolved` | Resolved | `resolved` |
| `closed` | Closed | `closed` |
| `cancelled` | Cancelled | `cancelled` |

Note three distinct "waiting" stages over one canonical status — precisely the reusability the
two-layer model buys. The customer portal shows "We're waiting for your reply" for
`waiting_customer` and "We're chasing this up for you" for the other two, driven by stage
metadata rather than by code branching on an enum.

## 8.5 Transition contract

Every transition defines:

| Property | Meaning |
|---|---|
| `from` / `to` | Stage keys |
| `label` | The button text agents see |
| `allowed_roles` | Who may perform it |
| `guards` | Preconditions that must hold |
| `requires` | Fields that must be supplied (e.g. resolution note, reason) |
| `sla_hours` | Optional per-stage SLA, consumed by the shared sweep |
| `side_effects` | Keyed to the **canonical** status, never the stage |
| `notifications` | Templates fired |
| `automation_hooks` | Rules evaluated after the transition commits |

### The default transition table

| From | To | Roles | Guards | Requires |
|---|---|---|---|---|
| `new` | `triaged` | agent+ | — | desk set |
| `new`/`triaged` | `working` | agent+ (assignee or claim) | assigned | — |
| `working` | `waiting_*` | agent+ | — | reason |
| `waiting_*` | `working` | agent+, or automatic on requester reply | — | — |
| `working` | `pending_approval` | agent+ | approval chain exists | — |
| `pending_approval` | `working` | system, on approval decision | — | — |
| `working` | `resolved` | agent+ | no pending approval | resolution note if desk requires |
| `resolved` | `closed` | agent+, manager, or auto-close sweep | — | — |
| `resolved` | `open` | requester (reopen), agent+ | within `reopen_window_days` | reason |
| `closed` | `open` | manager+, or requester within window | within window | reason |
| any non-terminal | `cancelled` | manager+, requester (own) | — | reason |
| any non-terminal | `merged` | manager+ | target ticket valid | target |

## 8.6 Side effects by canonical status

Keyed to canonical status so a custom stage can never bypass them (RULE-3).

| Status reached | Side effects |
|---|---|
| `open` (from create) | Compute SLA targets · run routing · emit `created` · notify desk/assignee |
| `open` (from reopen) | Restart resolution clock, preserve `first_response_at` (RULE-18) · increment `reopened_count` · emit `reopened` · notify |
| `in_progress` | Stamp `started_at` if unset · resume SLA clock · emit `status_changed` |
| `waiting` | Pause SLA clock if policy says so · schedule a follow-up nudge · emit |
| `resolved` | Stamp `resolved_at` · stop clocks · schedule auto-close · request CSAT · emit `resolved` · notify requester |
| `closed` | Stamp `closed_at` · freeze time entries · emit `closed` |
| `cancelled` | Stop clocks · emit `cancelled` · notify requester |
| `merged` | Move thread to target · set `merged_into` · redirect the reference · emit `merged` |

## 8.7 Automatic transitions

| Trigger | Transition | Guard |
|---|---|---|
| Requester replies to a `waiting_customer` ticket | → `working` | — |
| Requester replies to a `resolved` ticket | → `open`, counts as reopen | Within reopen window; otherwise a new linked ticket is created |
| Auto-close sweep | `resolved` → `closed` | `resolved_at` older than `desk.auto_close_after_days` |
| Approval granted / rejected | `pending_approval` → `working` / `cancelled` | — |
| Automation rule | Any configured | Rule's own permissions (RULE-15) |

> **What never happens automatically:** nothing auto-**resolves**, and nothing auto-**approves**.
> The SLA sweep flags and escalates only (RULE-9). A desk that closes its own tickets to make
> its numbers look good is worse than no desk.

## 8.8 Concurrency

Transitions take an optimistic lock on the ticket version. A losing writer gets `409 Conflict`
with the current state rather than silently overwriting. Two agents resolving simultaneously
results in one success and one conflict the UI resolves by refreshing — not two audit entries
claiming different resolutions.

## 8.9 Migration of existing rows

Live `contact_tickets` rows carry `open|in_progress|waiting|resolved`. On migration each is
mapped to the default workflow's equivalent stage (`open`→`new` when never assigned, else
`triaged`; `in_progress`→`working`; `waiting`→`waiting_customer`; `resolved`→`resolved`). No
status value changes; only `stage_key` is populated. Verified by a count-by-status assertion
before and after.

---

## Acceptance criteria for this section

- [ ] `status` is not writable through any endpoint — proven by an attempted `PATCH`.
- [ ] Every transition is validated by the workflow service, including automation and AI paths.
- [ ] A custom stage mapping to `waiting` pauses the SLA clock without any code change.
- [ ] Nothing auto-resolves or auto-approves under any configuration.
- [ ] `first_response_at` survives reopen.
- [ ] Concurrent transitions produce one success and one 409.
- [ ] Existing rows migrate with no status value changed.
