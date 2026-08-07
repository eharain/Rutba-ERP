# 35 — Performance Requirements

[← 34 Multi-Tenant Considerations](34-multi-tenant-considerations.md) · [Index](00-index.md) · Next: [36 Security Requirements](36-security-requirements.md)

---

## 35.1 Purpose

Numeric targets, the scale they hold at, and the techniques that meet them.

## 35.2 Scale assumptions

| Dimension | Launch | Year 1 | Design ceiling |
|---|---|---|---|
| Tickets per tenant | 5k | 100k | **500k** |
| Messages per tenant | 20k | 400k | 2M |
| Concurrent agents | 10 | 50 | **200** |
| Requests/sec (agent surfaces) | 5 | 30 | 150 |
| Tickets created/day | 50 | 500 | 5,000 |
| Attachments | 5k | 100k | 1M |
| KB articles | 50 | 500 | 5,000 |
| Events/day | 500 | 10k | 100k |

Targets below hold **at the design ceiling**, not at launch volume. A queue that is fast with
5,000 tickets and unusable with 500,000 has not met the requirement.

## 35.3 Latency targets

| Operation | p50 | p95 | p99 |
|---|---|---|---|
| Queue list (25 rows, filtered) | 250ms | **800ms** | 1.5s |
| Ticket detail (thread, no context panel) | 300ms | **1s** | 2s |
| Context panel (async) | 500ms | 1.5s | 3s |
| Send message | 200ms | 500ms | 1s |
| Create ticket (full pipeline) | 400ms | 1s | 2s |
| Transition | 200ms | 600ms | 1.2s |
| Global search | 400ms | **1.5s** | 3s |
| Typeahead | 100ms | **300ms** | 600ms |
| Agent/manager dashboard | 500ms | 1.5s | 3s |
| Executive dashboard (rollups) | 1s | 3s | 5s |
| Report (≤ 90 days) | 1s | 3s | 8s |
| Bulk op (100 tickets) | 3s | 8s | 15s |
| Portal ticket list | 300ms | 1s | 2s |

Background: SLA sweep completes within 2 minutes for 500k tickets · event dispatch lag p95 < 5s ·
nightly rollups within 30 minutes · notification dispatch p95 < 30s.

## 35.4 The five queries that matter

Optimise these first; they are ~80% of load.

| # | Query | Technique |
|---|---|---|
| Q1 | Queue: filter + sort + paginate | Covering indexes on `(desk, status, priority, resolution_due_at)` and `(assigned_to, status)`; **keyset pagination**, never deep `OFFSET` |
| Q2 | Breaching soon | **`sla_state` materialised on the ticket** — an indexed lookup, not a per-row computation. The single highest-value denormalisation in the module |
| Q3 | Ticket detail + thread | One query per ticket, one for messages ordered by `(ticket, created_at)`; context panel loaded separately and async |
| Q4 | SLA sweep | Indexed `(status, resolution_due_at)` partial index over non-terminal statuses; process in bounded batches |
| Q5 | Dashboard aggregates | Live widgets from indexed counts; trend widgets from **pre-aggregated rollups**, never from raw tickets |

## 35.5 Techniques

**Indexing.** Every filter combination the queue offers is index-backed. Partial indexes on
non-terminal statuses keep the hot index small — most tickets are closed, and closed tickets are
rarely queried in the working surfaces.

**Denormalisation, deliberately chosen.** `sla_state`, `last_reply_at`, `last_reply_by`,
`message_count`, `open_count` per desk. Each has a **single writer** and an explicit
recomputation path, following the stock-level cache discipline already established in the
codebase. A denormalised value with two writers becomes wrong within a month.

**Caching.** Configuration (desks, workflows, SLA policies) cached per process with explicit
invalidation — with the same caveat that already applies to the workflow cache: a per-process
cache in a clustered deployment needs a real invalidation channel, not just a TTL. Permission
claims reuse the existing api-pro cache. Dashboard payloads cached with a short TTL. Never cache
ticket content — staleness in a live conversation is worse than latency.

**Pagination.** Keyset (`cursor`) for large lists; `OFFSET` acceptable only for the first few
pages. Default page size 25, max 100. Counts on large filtered sets are estimated, with an exact
count available on request — an exact `COUNT(*)` over 500k filtered rows on every queue render is
a self-inflicted outage.

**Async by default.** Notifications, event dispatch, AI calls, rollups, exports, imports, bulk
operations above threshold, embeddings and virus scanning all run outside the request. The user
gets an immediate response and a progress record.

**N+1 avoidance.** Populate explicitly and in bounded sets. A queue of 25 tickets must not issue
25 requester lookups — a persistent risk given the `documents()` shim's populate semantics.

**Payloads.** Sparse fieldsets on lists; the queue never returns message bodies. Compression on.
Thread pagination for long threads (load the most recent 50, page backwards).

## 35.6 Frontend

Bundle: initial JS < 300KB gzipped. Route-level code splitting. Virtualised queue rows beyond
100. Debounced search (250ms) with request cancellation. Optimistic updates with rollback.
Skeletons, not spinners. Poll at 60s, paused when the tab is hidden — a room of 200 agents
polling a hidden tab every 10 seconds is a self-inflicted DDoS.

## 35.7 Degradation

The desk must stay usable when parts fail:

| Failing | Behaviour |
|---|---|
| AI | Features hidden; manual paths unaffected |
| Search index | Fall back to structured filters |
| Context panel | Thread renders; panel shows "unavailable" |
| Notifications | In-app still written; external retried |
| Event dispatcher | Events accumulate in the outbox; processed on recovery |
| Rollups stale | Charts render with a staleness warning ([20 §20.9](20-dashboards.md)) |
| Media host | Thread renders; attachments show as unavailable |

**Intake degrades last.** If anything can still work, it must be the ability to accept a ticket
(§03 F1).

## 35.8 Load testing

Before launch, with **500k tickets and 200 concurrent agents** seeded: queue browse and filter,
ticket open and reply, search, dashboard, bulk operations, SLA sweep, and a burst of 1,000
concurrent public submissions. Soak for 24 hours to surface leaks and unbounded growth.

Test with a realistic distribution — most tickets closed, a long tail of very long threads, a few
tickets with 50 attachments. Uniform synthetic data hides exactly the queries that will hurt.

## 35.9 Monitoring

Per-endpoint latency percentiles · slow-query log · queue depth · SLA sweep duration · event lag
and dead-letter depth · notification failure rate · AI spend and latency · cache hit rates ·
DB connection pool saturation · error rate by type.

Alerts on: p95 above target for 5 minutes, sweep exceeding its window, event lag above 60s,
dead-letter growth, dispatcher not running.

---

## Acceptance criteria for this section

- [ ] All targets met at 500k tickets / 200 concurrent agents in load testing.
- [ ] Q1–Q5 verified index-backed by query plans, with no full scans.
- [ ] No N+1 in queue, detail or dashboard — asserted by query-count tests.
- [ ] Keyset pagination on deep pages.
- [ ] Every denormalised field has one writer and a recomputation path.
- [ ] Each degradation mode tested by fault injection.
- [ ] 24-hour soak shows no leak or unbounded growth.
- [ ] Monitoring and alerts live before launch, not after.
