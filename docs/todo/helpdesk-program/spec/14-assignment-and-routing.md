# 14 — Assignment & Routing

[← 13 Automation Engine](13-automation-engine.md) · [Index](00-index.md) · Next: [15 Notifications](15-notifications.md)

---

## 14.1 Purpose

Get every ticket to the right person quickly and fairly, with as little human triage as
possible (G3: ≥70% assigned without a human).

## 14.2 Routing pipeline

Routing runs on creation, on desk change, on explicit re-route, and on unassignment.

```
1. Resolve DESK      explicit > catalog item > automation rule > keyword match > tenant default
2. Resolve TEAM      desk default > skill match > branch match
3. Resolve AGENT     strategy (below), filtered by eligibility
4. Fallback          leave UNASSIGNED in the desk queue and notify the manager
```

**Routing never fails a ticket.** If no agent is eligible, the ticket sits unassigned in the
queue and the desk manager is notified. A ticket that cannot be routed must still exist
(§03 F1).

## 14.3 Strategies

| Strategy | How | Best for |
|---|---|---|
| `round_robin` | Next eligible agent in rotation, per team | Uniform work, uniform skill |
| `least_busy` | Fewest open tickets, weighted by `capacity_weight` | Uneven ticket sizes |
| `least_busy_weighted` | Weighted by open tickets × priority weight | Mature desks |
| `skill_based` | Match ticket tags/catalog item to agent skills, then least-busy among matches | Specialised desks (IT) |
| `branch_based` | Agents serving the ticket's branch | Multi-branch operations |
| `language_based` | Agent speaks the detected language | Urdu/English tenants |
| `load_balanced` | Composite: skill → branch → language → least-busy | Default recommendation |
| `manual` | Nobody; queue only | Small desks that prefer self-claim |
| `ai_assisted` | Model suggests, subject to the same eligibility filter | [22](22-ai-features.md) |
| `sticky` | Same agent as the requester's last ticket, if eligible and under load cap | Relationship continuity |

Strategy is configured per desk, overridable per team and per catalog item.

## 14.4 Eligibility filter

Applied to every strategy — a strategy proposes, eligibility disposes.

An agent is eligible if **all** hold: active user · holds a role on the ticket's desk · is a
member of the resolved team (when team routing) · within working hours per their team calendar ·
not on leave (checked against HR leave records) · below their `max_open_tickets` cap · not the
requester (an agent cannot be assigned their own request) · holds any capability the ticket
requires (e.g. remote-support grant).

> **The leave check is the one most often forgotten and most visible when missed.** Assigning
> to someone on annual leave silently guarantees a breach. HR already holds the data; use it.

## 14.5 Rebalancing

| Situation | Behaviour |
|---|---|
| Agent goes on leave | Manager prompted to bulk-reassign their open tickets; not automatic — reassignment is a judgement call |
| Agent leaves the company | Their open tickets return to the desk queue, audited |
| Agent over cap | Excluded from new routing until below cap |
| Queue ageing | Tickets unassigned beyond a threshold escalate to the manager |
| Shift handover | Optional handover routing at shift boundary, with a handover note |

## 14.6 Self-claim

Agents pull from a queue with `POST /tickets/:id/claim`. Claiming is atomic — a compare-and-set
on `assigned_to IS NULL`, so two agents clicking simultaneously produce one winner and one
`409`, never a silent double-assignment. This is the commonest race in any desk product and is
specified explicitly for that reason.

## 14.7 Configuration

**`RoutingRule`** — `desk`, `sequence`, `conditions` (same expression tree as automation),
`strategy`, `target_team`, `target_agent`, `is_active`. First matching rule wins; a default rule
with empty conditions is the catch-all.

Routing rules are evaluated by the same condition evaluator as [13 Automation](13-automation-engine.md)
— one expression language, one evaluator, one set of tests.

## 14.8 API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/helpdesk/tickets/:id/assign` · `/unassign` · `/claim` | Manual |
| POST | `/api/helpdesk/tickets/:id/route` | Re-run routing |
| POST | `/api/helpdesk/tickets/bulk/reassign` | Rebalance |
| GET | `/api/helpdesk/routing/rules` · POST/PATCH | Configure (admin) |
| POST | `/api/helpdesk/routing/preview` | Dry-run: who would get this ticket, and why |
| GET | `/api/helpdesk/agents/availability` | Eligibility snapshot with reasons |

`/routing/preview` returning **why** an agent was chosen — the rule, the strategy, the
eligibility outcomes — is what makes routing debuggable rather than magical.

## 14.9 Events

`helpdesk.ticket.assigned` · `.unassigned` · `.routed` · `.routing_failed` (unassigned fallback) ·
`helpdesk.agent.over_capacity`.

## 14.10 Permissions

`helpdesk.ticket.assign` (manager+) · `helpdesk.ticket.assign.self` (agent claim) ·
`helpdesk.routing.configure` (admin) · `helpdesk.routing.preview` (manager+).

## 14.11 KPIs

Auto-assignment rate · median time-to-assignment · unassigned backlog and its age ·
reassignment rate (high = routing is wrong) · load distribution (std. dev. of open per agent) ·
routing-failure count · claim-race count.

---

## Acceptance criteria for this section

- [ ] Claim is atomic; concurrent claims yield one success and one 409.
- [ ] Eligibility excludes agents on leave, over cap, out of hours, off-desk and the requester.
- [ ] Routing failure leaves the ticket unassigned and notifies — never errors.
- [ ] `/routing/preview` explains the decision.
- [ ] Routing and automation share one condition evaluator.
- [ ] Load distribution measured and within target after 30 days.
