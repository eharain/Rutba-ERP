# 20 — Dashboards

[← 19 Manager Workspace](19-manager-workspace.md) · [Index](00-index.md) · Next: [21 Reports & Analytics](21-reports-and-analytics.md)

---

## 20.1 Purpose

Role-appropriate situational awareness at a glance. Dashboards answer *"what needs my attention
now?"*; reports answer *"what happened and why?"* ([21](21-reports-and-analytics.md)).

## 20.2 The four dashboards

| Dashboard | Audience | Question it answers | Refresh |
|---|---|---|---|
| **Agent** | `helpdesk_staff` | What should I work on next? | 60s |
| **Manager** | `helpdesk_manager` | Will we miss anything today? | 60s |
| **Executive** | `helpdesk_admin`, leadership | Is service quality improving? | 15 min |
| **Customer** | `storefront_user` | What's happening with my requests? | On load |

## 20.3 Agent dashboard

Widgets: **Breaching soon (mine)** · My open by status · Assigned to me today ·
Awaiting my reply · Unassigned in my desks (claimable) · Resolved this week ·
My CSAT (last 30d) · Unread mentions · Time logged today.

Default landing: `/`. Every widget drills through to a filtered queue.

## 20.4 Manager dashboard

Specified in [19 §19.2](19-manager-workspace.md). One aggregated API call.

## 20.5 Executive dashboard

Trend-first, not live-ops. Twelve-week windows with period-over-period deltas.

| Widget | Content |
|---|---|
| Volume trend | Created vs resolved, weekly, by desk |
| SLA compliance trend | % within target, by desk, with the target line drawn |
| CSAT trend | Mean + response rate |
| Backlog trend | Open at week end — the leading indicator of capacity trouble |
| First response distribution | p50 / p90 / p99, not just the mean |
| Cost of service | Time logged × rate, by desk (where rates are configured) |
| Top drivers | Most common resolution codes and subject-entity types |
| Deflection | KB deflection rate and its trend |
| Channel mix | Volume by source |
| Repeat contact rate | Requesters raising >1 ticket in 30 days |

> **Distributions, not averages.** A mean first-response time hides the tail where the damage
> is. Every duration widget shows p50/p90/p99. A dashboard that reports only averages will be
> reassuring and wrong.

## 20.6 Customer dashboard

The portal home ([16 §16.3](16-customer-portal.md)) — open requests, last update, unread,
recently resolved with a rate prompt. No metrics, no charts, no SLA.

## 20.7 Widget framework

Each widget declares: `key`, `title`, `type` (`stat|list|bar|line|donut|table|gauge`),
`data_source`, `filters`, `drill_through`, `permission`, `refresh_interval`, `size`.

Users can add/remove/reorder widgets on their own dashboard; admins define the default per role.
Layout persists per user.

**Permission is per widget.** A dashboard never leaks a number the viewer could not obtain by
navigating to the underlying data — for example an agent's personal CSAT is not exposed on a
peer's dashboard.

## 20.8 Data and performance

- Live widgets query the operational store with tight, index-backed queries.
- Trend widgets read from **pre-aggregated daily rollups**, not from raw tickets — a twelve-week
  executive chart must never scan the ticket table.
- Rollups are produced nightly by a Core cron and are idempotent and backfillable.
- Every dashboard is **one aggregated API call**.
- Targets: agent/manager < 1.5s p95; executive < 3s p95.

## 20.9 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/dashboards/:role` | Aggregated widget payloads |
| GET | `/api/helpdesk/dashboards/widgets/:key` | Single widget refresh |
| GET/PATCH | `/api/helpdesk/dashboards/layout` | Per-user layout |
| GET | `/api/helpdesk/dashboards/rollups/status` | Rollup freshness (admin) |

Rollup freshness is exposed deliberately: a chart built on stale rollups must be able to say so
rather than quietly showing yesterday's world as today's.

## 20.10 Visual conventions

Consistent status and priority colours across every surface; colour never the sole carrier of
meaning (accessibility); SLA states use a fixed scale (ok / at-risk / breached) everywhere;
empty widgets say what would fill them; loading uses skeletons sized to the widget; stale data
shows with a timestamp and a warning rather than being replaced by an error.

---

## Acceptance criteria for this section

- [ ] Each dashboard loads in one aggregated call within its target.
- [ ] Trend widgets read rollups, never raw tickets.
- [ ] Rollups are idempotent, backfillable, and their freshness is visible.
- [ ] Duration widgets show p50/p90/p99, not means alone.
- [ ] Per-widget permissions verified; no cross-agent metric leakage.
- [ ] Every widget drills through to filtered data.
- [ ] Customer dashboard exposes no operational metrics.
