# 11 — Knowledge Base

[← 10 Service Catalog](10-service-catalog.md) · [Index](00-index.md) · Next: [12 SLA Engine](12-sla-engine.md)

---

## 11.1 Purpose

Answer a question once, reuse the answer forever. The KB serves three jobs, in order of value:

1. **Deflection** — the requester finds the answer and never raises a ticket.
2. **Agent speed** — the agent inserts a known-good answer instead of composing one.
3. **AI grounding** — the corpus the copilot answers from ([22 AI Features](22-ai-features.md)).

## 11.2 Where it lives

The KB is **tenant-scoped and desk-tagged**, not desk-owned ([05 §5.2](05-information-architecture.md)) —
one "how to reset your password" article serves the IT desk and the customer portal at once.

> **Publishing decision.** Public-facing articles are surfaced on the storefront through the
> **CMS** (`rutba-cms` → `rutba-web`), not through a second content system. The KB owns
> authoring, versioning and internal visibility; the CMS owns public presentation, SEO and
> navigation for the `public` subset. Building a second public content stack inside Helpdesk
> would duplicate the CMS's page, menu and SEO machinery for no gain.

## 11.3 Data model

### `KbCategory`
`key`, `name`, `description`, `icon`, `parent` (self-relation, max depth 3), `sequence`,
`visibility` (`public|internal|both`), `is_active`.

### `KbArticle`
| Field | Type | Notes |
|---|---|---|
| `title` | string, required | |
| `slug` | uid | Readable URL, stable across edits |
| `category` | rel → KbCategory | |
| `desks` | m2m → Desk | Tags, not ownership |
| `visibility` | enum `public\|internal\|agent_only` | Three audiences, deliberately |
| `status` | enum `draft\|in_review\|published\|archived` | |
| `summary` | text | Shown in search results and AI grounding |
| `body` | richtext | |
| `locale` | string | `en`, `ur` |
| `translation_of` | rel → KbArticle | Links locale variants |
| `tags` | json | |
| `related_articles` | m2m → KbArticle | |
| `attachments` | media | |
| `author`, `reviewer` | rel → user | |
| `published_at`, `review_due_at` | datetime | Staleness control |
| `view_count`, `helpful_count`, `unhelpful_count`, `deflection_count` | integer | Effectiveness |
| `source_ticket` | rel → Ticket | Provenance when authored from a resolution |

### `KbArticleVersion`
Immutable snapshot per publish: `article`, `version`, `title`, `body`, `summary`,
`published_by`, `published_at`, `change_note`. Rollback restores by creating a new version from
an old one — never by mutating history.

**Visibility semantics.** `public` = anyone including anonymous. `internal` = authenticated
employees and customers-with-accounts as configured per category. `agent_only` = helpdesk roles
only — for internal procedures ("how to process a chargeback") that must never reach a
requester. This third tier is why KB visibility is not a boolean.

## 11.4 Authoring flow

```
draft → in_review → published → (archived)
                 ↘ back to draft on rejection
```

- Agents may create drafts; **publishing requires `helpdesk.kb.publish`** (manager/admin), because
  a published article is a public statement by the business.
- **Author from a resolved ticket** — one click carries the ticket's problem statement and
  resolution into a draft, links `source_ticket`, and notifies the author when it publishes.
  This is the single most important authoring path: it turns work already done into reusable
  knowledge with almost no extra effort.
- `review_due_at` drives a staleness sweep that reopens review on aged articles; an article
  nobody will vouch for is worse than no article.

## 11.5 Search

- Requester-facing search over `public` (+ `internal` when authenticated), ranked by relevance,
  then helpfulness, then recency.
- Agent-facing search over all three tiers.
- Typeahead suggestions **while composing a ticket** — deflection at the point of intent.
- Suggested articles on the ticket detail, matched against subject and body.
- See [26 Search & Filtering](26-search-and-filtering.md) for the engine.

## 11.6 Deflection measurement

The metric that justifies the KB's existence, so it must be measured honestly:

1. Requester opens a catalog item or starts a ticket form.
2. Suggested articles render.
3. Requester opens an article and **abandons the form within the session** → counted as a
   deflection against that article.
4. Requester opens an article and submits anyway → counted as a *failed* deflection, which is a
   signal the article is wrong or unclear, and is reported as such.

Both numbers are reported. A KB report that only counts successes teaches nobody anything.

## 11.7 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/kb/articles` | Search/list, visibility-filtered |
| GET | `/api/helpdesk/kb/articles/:slug` | Article (published version) |
| GET | `/api/helpdesk/kb/categories` | Tree |
| POST/PATCH | `/api/helpdesk/kb/articles` | Author |
| POST | `/api/helpdesk/kb/articles/:id/submit-review` · `/publish` · `/archive` | Lifecycle |
| GET | `/api/helpdesk/kb/articles/:id/versions` · POST `/rollback` | Versioning |
| POST | `/api/helpdesk/kb/articles/:id/feedback` | Helpful / not helpful |
| POST | `/api/helpdesk/kb/from-ticket/:ticketId` | Draft from resolution |
| GET | `/api/helpdesk/kb/suggest?q=…&ticketId=…` | Suggestions |
| GET | `/api/web/help/articles` · `/:slug` | Public storefront read (selfAuth/anonymous) |

## 11.8 Events

`helpdesk.kb.article.published` · `.archived` · `.review_due` · `.feedback_received` ·
`helpdesk.kb.deflection`.

## 11.9 Permissions

`helpdesk.kb.read` (tiered by visibility) · `helpdesk.kb.author` · `helpdesk.kb.review` ·
`helpdesk.kb.publish` · `helpdesk.kb.archive` · `helpdesk.kb.configure`.

## 11.10 KPIs

Deflection rate · failed-deflection rate · articles per desk · % resolved tickets citing an
article · helpfulness ratio · stale-article count · time-to-publish from ticket resolution ·
top search terms **with no result** (the backlog of articles that should exist).

---

## Acceptance criteria for this section

- [ ] `agent_only` articles never appear in requester search, suggestions, portal or AI answers.
- [ ] Publishing requires the publish permission; drafts are invisible to requesters.
- [ ] Version rollback creates a new version rather than mutating history.
- [ ] "Author from ticket" carries problem, resolution and provenance link.
- [ ] Both deflection and failed-deflection are measured and reported.
- [ ] Public articles render through the CMS on the storefront, not a second content stack.
- [ ] Zero-result search terms are captured and reportable.
