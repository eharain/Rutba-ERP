# 21 — Reports & Analytics

[← 20 Dashboards](20-dashboards.md) · [Index](00-index.md) · Next: [22 AI Features](22-ai-features.md)

---

## 21.1 Purpose

Answer *what happened, and why* — with figures defensible enough to act on and to show an
auditor.

## 21.2 Report library

### Volume & throughput
| Report | Dimensions | Purpose |
|---|---|---|
| Ticket volume | Desk, priority, source, branch, catalog item, requester kind, day/week/month | Demand shape |
| Created vs resolved | Desk, period | Are we keeping up? |
| Backlog ageing | Desk, age bucket | The quiet accumulation |
| Repeat contact | Requester, 30-day window | Are we fixing things first time? |
| Reopen analysis | Desk, agent, resolution code | Where "resolved" isn't |

### Performance
| Report | Dimensions | Purpose |
|---|---|---|
| SLA compliance | Desk, priority, agent, branch, month | The promise |
| First response distribution | p50/p90/p99, desk, priority | Tail behaviour |
| Resolution distribution | p50/p90/p99, desk, priority | Tail behaviour |
| Breach analysis | Desk, reason, agent, period | Root cause |
| Pause analysis | Desk, stage | Who is actually blocking |
| Escalation analysis | Desk, step, outcome | Escalation effectiveness |

### People
| Report | Dimensions | Purpose |
|---|---|---|
| Agent activity | Tickets handled, replies, resolutions, time logged | Workload |
| Agent quality | CSAT, reopen rate, SLA compliance | Coaching signal |
| Team comparison | Desk, team | Capacity planning |
| Approval performance | Approver, step, duration | Bottlenecks |

### Customer & quality
| Report | Dimensions | Purpose |
|---|---|---|
| CSAT | Desk, agent, period, with comments | Satisfaction |
| Root cause | Resolution code, subject entity type, product | What actually breaks |
| Product issue frequency | Product, batch, branch | **Quality signal back into the business** |
| Channel effectiveness | Source vs CSAT and resolution time | Where to invest |
| Deflection | Article, category | KB value |

### Cost
| Report | Dimensions | Purpose |
|---|---|---|
| Cost of service | Time × rate, by desk and catalog item | What support costs |
| Cost per ticket | Desk, source | Channel economics |
| Billable time | Customer, contract | Paid support |

> **The report that justifies the module.** *Product issue frequency* — "eleven tickets this
> month name the same product, nine of them the same batch" — is a finding no standalone
> helpdesk can produce, because it needs the ticket, the order, the stock item and the batch in
> one query. Build it early; it is the clearest demonstration of why the desk belongs inside the
> ERP.

## 21.3 Report framework

Each report declares `key`, `name`, `category`, `description`, `dimensions`, `measures`,
`default_filters`, `permission`, `export_formats`, `data_source` (`live` | `rollup`).

Users set filters (date range, desk, priority, agent, branch, source, tag, catalog item),
choose grouping, save configurations privately or share them to a team, and schedule delivery.

## 21.4 Measurement rules

These make the numbers defensible. They matter more than the report list.

1. **Business time, not wall-clock**, for every duration — per the ticket's calendar (RULE-8).
2. **Imported tickets excluded** from SLA compliance and duration reports; counted in volume,
   flagged separately.
3. **Merged tickets counted once**, on the surviving ticket. The merged-away ticket contributes
   its creation to volume and nothing to resolution.
4. **Reopened tickets** contribute one resolution per resolution event; `first_response_at` is
   measured once (RULE-18).
5. **System-raised tickets** are reported separately by default — they distort human-desk
   volume and satisfaction figures.
6. **CSAT** is reported with its response rate; a 4.8 from 3% of tickets is not a 4.8.
7. **Distributions over means** for every duration.
8. **Timezone** is the desk's business calendar, and every report states which timezone it used.
9. **"Now" is the query time**, stamped on every export — a report without a run timestamp is
   an argument waiting to happen.

## 21.5 Data architecture

| Layer | Contents | Refresh |
|---|---|---|
| Operational | Live tickets and children | Real time |
| **Daily rollup** | Per desk × priority × agent × branch × day: counts, durations, percentile sketches | Nightly cron, idempotent, backfillable |
| Report cache | Rendered report results | TTL per report |

Reports spanning more than ~30 days read rollups. Percentiles come from stored sketches
(t-digest or equivalent) rather than from re-scanning raw rows, so a twelve-month p99 is cheap.

Rollups are **recomputable from source**. If a rollup is ever wrong, deleting and rebuilding it
must be a safe operation.

## 21.6 Export & scheduling

Formats: CSV, XLSX, PDF (formatted), JSON (API). Large exports run asynchronously with a
download link on completion.

**Exports enforce the same permissions as the UI, and are audited** — who exported what, when,
and with which filters. An export is the easiest way for data to leave the tenant, so it is
treated as a privileged action, and requester-identifying exports are restricted to manager+.

Scheduled reports deliver by email on a cron with the recipient's permissions applied at
**send** time, not at schedule time — otherwise a role change leaves a stale subscription
leaking data.

## 21.7 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/reports` | Library |
| POST | `/api/helpdesk/reports/:key/run` | Run with filters |
| POST | `/api/helpdesk/reports/:key/export` | Async export → job id |
| GET | `/api/helpdesk/reports/exports/:jobId` | Status / download |
| GET/POST | `/api/helpdesk/reports/saved` | Saved configurations |
| GET/POST | `/api/helpdesk/reports/schedules` | Scheduled delivery |

## 21.8 Permissions

`helpdesk.report.read` (manager+, scoped to their desks) · `helpdesk.report.read.all` (admin) ·
`helpdesk.report.export` · `helpdesk.report.schedule` · `helpdesk.report.pii` (requester-
identifying detail; manager+ only).

## 21.9 Analytics beyond reports

Cohort analysis (requesters by first-contact month) · correlation views (does response time
predict CSAT?) · seasonality for staffing · anomaly flags (volume spike on a desk) ·
cross-module joins (tickets per product per branch per batch).

Anomaly detection here is **statistical, not AI** — a moving average with standard-deviation
bands is explainable, cheap, and does not need a model. AI-flavoured analytics belong in
[22](22-ai-features.md).

---

## Acceptance criteria for this section

- [ ] Every measurement rule in §21.4 has a test with a hand-computed expected value.
- [ ] Rollups are idempotent and recomputable from source; a rebuild changes nothing.
- [ ] Percentiles from sketches match raw computation within tolerance.
- [ ] Exports enforce permissions and are audited.
- [ ] Scheduled reports apply permissions at send time.
- [ ] Every report and export states its timezone and run timestamp.
- [ ] Product issue frequency report joins ticket → order → stock item → batch correctly.
