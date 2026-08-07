# 26 — Search & Filtering

[← 25 File Management](25-file-management.md) · [Index](00-index.md) · Next: [27 API Specification](27-api-specification.md)

---

## 26.1 Purpose

Find a ticket, a person, an article or an answer — fast enough that agents actually use search
instead of scrolling.

## 26.2 What exists

Core has **no search capability** (prerequisite P5). Today's filtering is the `documents()`
shim's Strapi filter dialect over knex — adequate for structured filters, not for text search.

## 26.3 Staged approach

Deliberately incremental, because a search cluster is a large operational commitment for a
module that has not yet proven its query volume.

| Stage | Technology | Scope | When |
|---|---|---|---|
| **S1** | Database full-text (MySQL `FULLTEXT` / Postgres `tsvector` + GIN) | Ticket subject/body/messages, KB articles | W1–W2, launch |
| **S2** | + trigram similarity and synonyms | Typo tolerance, Urdu/English variants | W4 |
| **S3** | + vector embeddings alongside the text index | Semantic KB and duplicate detection | W5, with [22 AI](22-ai-features.md) |
| **S4** | Dedicated engine (OpenSearch/Meilisearch) | Only if S1–S3 measurably fail at tenant scale | On evidence |

**Start with the database.** Postgres full-text with a GIN index comfortably serves hundreds of
thousands of tickets, keeps search transactional with the data (no index-lag bugs, no separate
backup story), and adds no infrastructure. Moving to a dedicated engine later is a contained
change behind the `SearchService` interface; introducing one now is a permanent operational tax
paid before the need is demonstrated.

## 26.4 The search service

```
SearchService
  .tickets(actor, query, filters, paging)
  .messages(actor, query, filters, paging)
  .knowledge(actor, query, filters, paging)
  .people(actor, query, paging)
  .global(actor, query)          → grouped results across types
  .suggest(actor, partial)       → typeahead
```

**Every method takes the actor and applies permission filtering inside the query**, never as a
post-filter. Post-filtering leaks: result counts, pagination totals and ranking positions all
disclose the existence of records the user may not see. This is the single most important rule
in this section.

## 26.5 Global search

`/` from anywhere. Results grouped by type with counts:

```
Tickets (12)
  HD-2026-000123  Damaged item in order SO-4471    Sana M. · resolved · 6 Aug
Knowledge (3)
  Damaged goods policy
People (2)
  Sana Mahmood · sana@… · 12 orders
```

Scope: tickets (subject, body, messages, `ticket_no`, tags, custom fields), KB (title, summary,
body), people (name, email, phone), catalog items, and — for admins — automation rules and
macros.

**Prefix operators** for agents who live in search: `#HD-2026-000123`, `from:sana@…`,
`desk:it`, `status:open`, `assignee:me`, `branch:lahore`, `is:breaching`, `has:attachment`,
`tag:vip`, `order:SO-4471`, `before:2026-08-01`.

## 26.6 Structured filtering

The queue's filter set ([06 §6.3](06-navigation-and-menus.md)) is server-side, index-backed, and
composable with text search. Filters and search are one query, not a search followed by a
client-side filter.

**Saved filters** are named, private by default, shareable to a team by a manager, and are the
same objects as queues (§07).

## 26.7 Ranking

| Signal | Weight |
|---|---|
| Exact `ticket_no` match | Absolute — jumps straight to the ticket |
| Field match: subject > tags > body > messages | High → low |
| Recency | Moderate decay |
| Assignment to the searcher | Boost |
| Status: open before closed | Boost |
| KB: helpfulness and view count | Boost |

KB results rank published over draft and never surface `agent_only` articles to requesters
(§11.3).

## 26.8 Performance

| Operation | Target |
|---|---|
| Typeahead | < 300ms p95 |
| Global search | < 1.5s p95 |
| Filtered queue | < 800ms p95 |
| KB search | < 800ms p95 |

Techniques: covering indexes on the queue's filter combinations; `sla_state` materialised so
"breaching" is an indexed lookup rather than a computation per row; keyset pagination rather
than `OFFSET` for deep pages; a short-TTL cache on repeated identical queries; debounced
typeahead (250ms) with request cancellation.

**Never** load the full result set to filter or count in the application. With 500k tickets that
is the difference between a working desk and a dead one.

## 26.9 Multilingual

Urdu and English content coexist. Language-aware analysers per locale; queries search both
unless a locale filter is set; transliterated search (Roman Urdu → Urdu) is an S2 concern via
synonym mapping, which matters in practice because Pakistani customers routinely type Urdu in
Latin script.

## 26.10 Zero results

Show what was searched, suggest spelling corrections, offer to relax the narrowest filter, and
**record the query**. Zero-result queries are the KB's backlog: the list of things people are
looking for and not finding is the most actionable content roadmap available (§11.10).

## 26.11 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/search?q=&types=&…` | Global |
| GET | `/api/helpdesk/search/suggest?q=` | Typeahead |
| GET | `/api/helpdesk/tickets?…` | Structured filter + `q` |
| GET | `/api/helpdesk/kb/articles?q=` | KB |
| GET/POST | `/api/helpdesk/search/saved` | Saved searches |
| GET | `/api/helpdesk/search/zero-results` | Backlog report (manager+) |

## 26.12 Permissions

Search returns only what the actor may read: desk scope, branch scope, ownership, and message
visibility (RULE-10 — internal notes never appear in requester search). Requester search is
restricted to their own tickets and permitted KB tiers.

## 26.13 KPIs

Search usage per agent per day · median latency · zero-result rate · click-through position
(low = good ranking) · refinement rate · KB search → article open rate · deflection from search.

---

## Acceptance criteria for this section

- [ ] Permission filtering is inside the query; counts and pagination never disclose hidden rows.
- [ ] Internal notes never appear in requester search results.
- [ ] `agent_only` KB articles never appear in requester search.
- [ ] Latency targets met with 500k tickets and 5k articles.
- [ ] Keyset pagination on deep pages; no `OFFSET` scans.
- [ ] Zero-result queries recorded and reportable.
- [ ] Prefix operators parse correctly, including malformed input.
- [ ] `SearchService` interface allows an engine swap without touching call sites.
