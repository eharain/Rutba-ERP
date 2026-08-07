# 27 — API Specification (Rutba Core)

[← 26 Search & Filtering](26-search-and-filtering.md) · [Index](00-index.md) · Next: [28 Event System](28-event-system.md)

---

## 27.1 Purpose

The complete HTTP contract, and the conventions every endpoint honours.

## 27.2 Conventions

**Base:** `/api/helpdesk/*` (agent/admin) · `/api/me/helpdesk/*` (requester, selfAuth) ·
`/api/helpdesk/public/*` (anonymous, per-desk, rate-limited).

The three namespaces are **structurally separate on purpose**. A scoping mistake in an agent
endpoint cannot accidentally expose a requester surface, and the requester namespace can be
security-reviewed as a single unit.

**Envelope** — exactly Core's existing REST layer (`src/http/rest.js`):

```jsonc
// success
{ "data": { … } | [ … ], "meta": { "pagination": { "page": 1, "pageSize": 25, "pageCount": 9, "total": 213 } } }
// error
{ "data": null, "error": { "status": 400, "name": "ValidationError", "message": "…", "details": { … } } }
```

**Identifiers.** `documentId` everywhere in paths. `ticket_no` is a human reference, usable as a
*search* term, never as an authorization token.

**Verbs.** `GET` read · `POST` create and intent-named actions · `PATCH` partial update ·
`PUT` unused · `DELETE` only where deletion is genuinely supported (never for tickets, RULE-13).

**Intent-named actions over field writes.** `POST /tickets/:id/assign`, not
`PATCH {assigned_to}`. State changes carry meaning, permissions, side effects and audit that a
field write cannot express — and `status` is not writable at all (RULE-4).

**Pagination.** `?page=&pageSize=` (default 25, max 100); keyset via `?cursor=` on large lists.
**Sorting.** `?sort=field:asc,field2:desc`, whitelisted per endpoint.
**Filtering.** Strapi filter dialect, as the shim already implements.
**Sparse fields / populate.** `?fields=` and `?populate=` per Core conventions.

**Headers.** `Authorization: Bearer <jwt>` · `X-Rutba-App` (the calling app — descriptors
match on it) · `X-Rutba-App-Role` (active role from RoleSwitcher) · `Idempotency-Key`
(optional on POST; required for public intake).

## 27.3 Ticket endpoints

| Method | Path | Action | Permission |
|---|---|---|---|
| GET | `/api/helpdesk/tickets` | `find` | `ticket.read` |
| GET | `/api/helpdesk/tickets/:documentId` | `findOne` | `ticket.read` |
| POST | `/api/helpdesk/tickets` | `create` | `ticket.create` |
| PATCH | `/api/helpdesk/tickets/:documentId` | `update` | `ticket.update` |
| POST | `/api/helpdesk/tickets/:documentId/transition` | `transition` | per workflow role gate |
| POST | `.../resolve` · `/close` · `/reopen` · `/cancel` · `/hold` | named aliases | per workflow |
| POST | `.../assign` · `/unassign` · `/claim` | `assign` etc. | `ticket.assign` / `.self` |
| POST | `.../route` | `route` | `ticket.assign` |
| POST | `.../merge` · `/split` | `merge` / `split` | `ticket.merge` |
| POST | `.../subject` | `linkSubject` | `ticket.update` |
| GET/POST | `.../messages` | `messages` / `addMessage` | `ticket.read` / `.reply` |
| GET/POST/DELETE | `.../watchers` · `/participants` | | `ticket.watch` |
| GET/POST/PATCH | `.../tasks` | | `ticket.task.manage` |
| GET/POST | `.../attachments` | | `ticket.read` / `.update` |
| GET/POST | `.../time-entries` | | `ticket.time.log` |
| GET | `.../activity` | `activity` | `ticket.read` |
| GET | `.../sla` | `sla` | `ticket.read` |
| POST | `.../apply-macro` | `applyMacro` | `ticket.update` |
| POST | `.../request-approval` | `requestApproval` | `approval.request` |
| POST | `.../extend-sla` | `extendSla` | `sla.extend` |
| POST | `.../handover` | `handover` | `ticket.handover` |
| POST | `.../children` | `createChild` | `ticket.child.create` |
| POST | `/api/helpdesk/tickets/bulk` | `bulk` | per-action, per-ticket |

### `POST /api/helpdesk/tickets`

```jsonc
// request
{
  "subject": "Damaged item in order SO-4471",
  "body": "The blue shirt arrived torn.",
  "desk": "customer-support",
  "priority": "high",
  "source": "whatsapp",
  "requester": { "person_document_id": "abc123" },      // or { "email", "phone", "name" }
  "subject_entity_uid": "api::sale-order.sale-order",
  "subject_document_id": "so_4471_doc",
  "branch": "lahore-main",
  "catalog_item": null,
  "custom_fields": {},
  "tags": ["damaged"],
  "attachments": ["file_doc_1"]
}
// 201
{ "data": { "documentId": "tk_…", "ticket_no": "HD-2026-000123", "status": "open",
            "stage_key": "new", "sla": { "first_response_due_at": "…", "resolution_due_at": "…",
            "state": "ok" }, "assigned_to": { … } }, "meta": {} }
```

### `POST /api/helpdesk/tickets/:documentId/transition`

```jsonc
{ "to_stage": "resolved", "resolution": "Replacement dispatched",
  "resolution_code": "replacement_sent", "reason": null }
```
Errors: `400` invalid transition (with the legal set) · `403` role not permitted · `409`
version conflict or guard failed · `422` required field missing.

## 27.4 Configuration endpoints

`/api/helpdesk/desks` · `/teams` · `/queues` · `/workflows` · `/sla/policies` · `/sla/calendars` ·
`/catalog` · `/automation/rules` · `/routing/rules` · `/macros` · `/resolution-codes` ·
`/settings` — each `GET`/`POST`/`PATCH`, admin-scoped, with `DELETE` only where a row is
genuinely removable and unreferenced.

## 27.5 Requester endpoints

| Method | Path |
|---|---|
| GET | `/api/me/helpdesk/tickets` · `/:documentId` |
| POST | `/api/me/helpdesk/tickets` |
| GET/POST | `/api/me/helpdesk/tickets/:documentId/messages` |
| POST | `/api/me/helpdesk/tickets/:documentId/reopen` · `/close` · `/rate` · `/nudge` |
| GET | `/api/me/helpdesk/requests` (ESS alias with the same semantics) |
| GET | `/api/helpdesk/catalog?audience=…` |

All `selfAuth` (`auth:false` + explicit gate), ownership-checked, thread filtered to `public`.

## 27.6 Public endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/api/helpdesk/public/tickets` | Desks with `allow_anonymous`; rate-limited; `Idempotency-Key` required |
| GET | `/api/web/help/articles` · `/:slug` | Public KB |

**No public read of a ticket by reference.** Status lookup requires a second factor (§16.6).

## 27.7 Legacy compatibility

Unchanged contracts, reimplemented over `TicketService` (F13):
`POST /contact-tickets/submit` · `/:documentId/reply` · `/:documentId/sla-breach` ·
`GET /contact-tickets/mine` · `/team` · `POST /contact-tickets/submit-internal` ·
`POST /contact-tickets/:documentId/resolve`.

Deprecation: announced at launch, `Deprecation` and `Sunset` headers from launch+1, removal no
earlier than launch+2 releases.

## 27.8 Errors

| Status | Name | When |
|---|---|---|
| 400 | `ValidationError` | Malformed input; `details` carries per-field messages |
| 401 | `UnauthorizedError` | Missing/invalid token |
| 403 | `ForbiddenError` | Authenticated, not permitted |
| 404 | `NotFoundError` | Absent **or** not visible to the caller |
| 409 | `ConflictError` | Version conflict, illegal transition, claim race |
| 422 | `UnprocessableEntity` | Well-formed but violates a business rule |
| 429 | `TooManyRequests` | Rate limited; `Retry-After` |
| 500 | `InternalServerError` | Unexpected; correlation id, never internals |

**404, not 403, for records the caller cannot see.** A 403 confirms the record exists, which
enumerates tickets. 403 is reserved for actions on records the caller *can* see.

Core maps thrown error classes to statuses (`ValidationError`→400, `ApplicationError`→400,
etc.) — domain services throw those classes rather than composing responses.

## 27.9 Rate limiting

| Surface | Limit |
|---|---|
| Public ticket creation | 5/hour per IP, 3/hour per email |
| Public KB | 100/min per IP |
| Requester authenticated | 60/min |
| Agent authenticated | 600/min |
| Search | 30/min per user |
| Bulk | 5/min per user |
| AI endpoints | Per-tenant cost ceiling (§22.7) |

## 27.10 Idempotency

`Idempotency-Key` on POST: the key plus the actor plus the endpoint maps to a stored response for
24 hours; a replay returns the original response rather than creating a duplicate. **Required**
on public intake (a customer double-tapping Submit must not open two tickets) and on
event-driven creation, which additionally uses `dedupe_key` (RULE-16).

## 27.11 Descriptors

Every endpoint has an entry in `packages/api-provider/api/helpdesk-*.js` with explicit `method:`,
`action` equal to the handler name, `apps` (the callers), `approle`, and per-method `scope`.

The standing traps apply: a missing `method:` silently becomes a GET; a verb outside the api-pro
whitelist makes the seeder skip the action and it 403s; `apps` is the **caller**, not the target;
literal paths must be registered before `:documentId` paths (koa-router prefix order); and
nothing works until `npm run seed -- --only=api-provider,up-permissions` runs, because seeding
does not happen at boot.

## 27.12 Versioning

No URL version. Additive changes only; breaking changes ship as a new endpoint with the old one
deprecated via headers. New response fields are additive; clients must tolerate unknown fields.

## 27.13 Webhooks

Outbound per tenant: URL, secret, event subscriptions, active flag. Payload matches the event
envelope (§28). HMAC-SHA256 signature over the raw body with a timestamp to prevent replay;
retries with exponential backoff for 5 attempts; failures visible in the delivery log; a
persistently failing endpoint auto-disables and alerts.

**Webhook payloads never contain internal notes** (RULE-10), and the subscription's permitted
scope is fixed at configuration time by an admin.

---

## Acceptance criteria for this section

- [ ] Every endpoint has a descriptor with explicit `method:` and matching `action`.
- [ ] The three namespaces are separately routable and separately reviewable.
- [ ] Invisible records return 404, not 403 — verified by enumeration tests.
- [ ] `status` cannot be written by any endpoint.
- [ ] Idempotency verified: replayed public submissions create one ticket.
- [ ] Rate limits enforced and return `Retry-After`.
- [ ] Legacy contracts byte-compatible, verified against recorded live requests.
- [ ] Webhook signatures verified; payloads carry no internal notes.
