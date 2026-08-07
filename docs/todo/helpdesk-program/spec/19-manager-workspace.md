# 19 — Manager Workspace

[← 18 Agent Workspace](18-agent-workspace.md) · [Index](00-index.md) · Next: [20 Dashboards](20-dashboards.md)

---

## 19.1 Purpose

Let a desk manager answer four questions, fast:

1. Are we going to miss anything today?
2. Is the work fairly distributed?
3. Where are we slow, and why?
4. Who needs help?

The manager surface is about **intervention before failure**, not reporting after it. Reporting
is [21](21-reports-and-analytics.md); this is the operational cockpit.

## 19.2 Team dashboard

Live, auto-refreshing (60s, paused when hidden).

| Widget | Content | Why it earns its place |
|---|---|---|
| **Breaching soon** | Tickets crossing at-risk in the next 4h, sorted by time remaining | The one widget that prevents failures rather than recording them |
| **Breached today** | Count + list, with reason | Immediate accountability |
| Unassigned backlog | Count + oldest age | Routing gaps |
| Open by status | Bar, drill-through | Where work is stuck |
| Agent workload | Open per agent vs capacity, colour-coded | Fairness at a glance |
| Awaiting customer | Count + how long | Distinguishes "our fault" from "their turn" |
| Aged tickets | Older than N days | The quiet backlog nobody looks at |
| Today's throughput | Created vs resolved | Are we keeping up? |
| Negative CSAT | Ratings ≤2 in the last 7 days | Individual recoveries |
| Approval bottlenecks | Steps pending longest, by approver | The commonest hidden delay |
| Automation health | Failures, breaker trips | Silent breakage |

## 19.3 Agent workload view

Per agent on the manager's desks: open (by priority), assigned today, resolved this week, median
resolution, SLA compliance, CSAT, time logged, current availability (working hours, leave, cap).

**Actions:** reassign selected · adjust cap · set out-of-office and rebalance · view their queue.

> **A note on how this is used.** These figures are for balancing work, spotting overload, and
> finding where someone needs help or training. Raw ticket counts are a poor measure of an
> individual's contribution — the agent handling the hardest cases will always close fewer than
> one clearing simple ones. Report volume alongside complexity and CSAT, and treat outliers as a
> prompt to ask a question, not as a verdict. The UI should present them that way rather than as
> a leaderboard.

## 19.4 Queue management

Rebalance (bulk reassign by filter) · reprioritise · reassign an absent agent's tickets ·
adjust routing rules for the desk · define and share saved views · set desk-level caps.

## 19.5 Escalation management

An escalation queue of tickets escalated to the manager, with the reason (SLA, priority,
requester request, agent request), age since escalation, and actions: take ownership, reassign
to a senior agent, extend the SLA with a recorded reason, or resolve directly.

**SLA extension is a first-class, audited action** with a mandatory reason. Managers will
otherwise achieve the same effect by quietly reclassifying priority, which corrupts the data.
Giving the honest action a button keeps the numbers honest.

## 19.6 Approvals

Approvals where the manager is the approver, plus oversight of approvals on their desks:
pending by age, overdue steps, delegation management for absent approvers.

## 19.7 Team configuration

Membership, leads, skills, working hours, capacity weights, routing strategy for the desk,
saved views shared to the team, macros for the team.

## 19.8 Reports the manager runs most

Direct links, pre-filtered to their desks: SLA compliance this month · first-response
distribution · resolution-time distribution · reopen rate by agent and by resolution code ·
volume by source and by catalog item · CSAT with comments · backlog trend.

## 19.9 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/manager/dashboard` | Aggregated widgets in one call |
| GET | `/api/helpdesk/manager/workload` | Per-agent load and availability |
| GET | `/api/helpdesk/manager/escalations` | Escalation queue |
| POST | `/api/helpdesk/tickets/bulk/reassign` | Rebalance |
| POST | `/api/helpdesk/tickets/:id/extend-sla` | Audited extension with reason |
| GET/PATCH | `/api/helpdesk/teams/:id` | Team config |

The dashboard is **one aggregated call**, not fifteen widget calls — otherwise the most-loaded
screen in the product becomes the slowest.

## 19.10 Permissions

All scoped to desks the user manages: `helpdesk.manager.dashboard` ·
`helpdesk.ticket.assign` · `helpdesk.ticket.bulk` · `helpdesk.sla.extend` ·
`helpdesk.team.configure` · `helpdesk.report.read`.

A manager sees **only their desks**. Cross-desk visibility is an admin capability, or an
explicit multi-desk manager assignment.

## 19.11 KPIs

Time-to-intervention on at-risk tickets · % breaches with a prior at-risk warning acted on ·
load distribution std. dev. · escalation resolution time · approval bottleneck duration ·
rebalancing frequency.

---

## Acceptance criteria for this section

- [ ] Dashboard loads in one call, < 1.5s p95 with 100k tickets.
- [ ] "Breaching soon" is accurate against the SLA engine, including paused clocks.
- [ ] Manager sees only their desks, enforced server-side.
- [ ] SLA extension requires a reason and is audited.
- [ ] Workload view presents volume alongside CSAT and complexity, not as a ranking.
- [ ] Bulk reassign authorises and audits per ticket.
