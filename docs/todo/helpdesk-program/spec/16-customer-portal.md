# 16 — Customer Portal

[← 15 Notifications](15-notifications.md) · [Index](00-index.md) · Next: [17 Employee Portal](17-employee-portal.md)

---

## 16.1 Purpose

Give customers one place to ask for help and see what is happening — closing the gap where
today a customer can file a contact form and then never see the ticket again.

**Host:** `rutba-web-user` (:4004), with entry points from `rutba-web` (:4000).

## 16.2 Design stance

The portal is a **reassurance surface**, not a working surface. Its job is to answer three
questions without the customer having to ask a human:

1. Did you get my message?
2. What is happening with it?
3. What happens next, and when?

Everything else is subordinate. No queue positions, no SLA countdowns, no priority labels, no
agent workload, no internal reasoning.

## 16.3 Pages

### `/support` — Home
Open requests (status, last update, unread badge) · "Raise a request" · search help articles ·
recently resolved with a rate prompt.
**Empty state:** help-article suggestions plus a prominent "Ask us something".

### `/support/new` — Raise a request
Catalog picker (customer-visible items only) or a free-form request. As the subject is typed,
**suggested articles appear inline** — deflection at the point of intent (§11.6).
Fields: type/catalog item · subject · description · related order (picker over their own orders
only) · attachments.
On submit: confirmation with the reference number, the expected turnaround in plain language,
and a link to the thread.

### `/support/tickets` — My requests
Filter by open/closed. Card list: reference, subject, plain-language status, last update,
unread indicator.

### `/support/tickets/[documentId]` — Conversation
Full **public** thread, chronological, with attachments; reply box; status with a plain-language
explanation of what is happening and what is expected of the customer; related order panel;
reopen (within window); rate (when resolved).

### `/support/knowledge` and `/support/knowledge/[slug]`
Public and (when authenticated) internal-tier articles; helpful/not-helpful feedback;
"still need help?" → pre-filled ticket carrying the article reference.

## 16.4 Contextual entry points

| Location | Action | Effect |
|---|---|---|
| `rutba-web-user` order detail | "Get help with this order" | Ticket pre-linked to the order (BR-C4) |
| Return detail | "Ask about this return" | Pre-linked to the return |
| Storefront `/contact` | Contact form | Ticket on the Customer Support desk, `source: web` |
| Storefront `/help/[slug]` | "Still need help?" | Pre-filled from the article |
| Order confirmation email | Support link | Deep link to a pre-linked new ticket |

## 16.5 Plain-language status mapping

Driven by the stage's `requester_label` metadata, not by code branching on status:

| Stage → canonical | Customer sees |
|---|---|
| `new`, `triaged` → `open` | "We've received your request" |
| `working` → `in_progress` | "We're working on it" |
| `waiting_customer` → `waiting` | "We're waiting for your reply" |
| `waiting_supplier`, `waiting_internal` → `waiting` | "We're chasing this up for you" |
| `pending_approval` → `waiting` | "Waiting for approval" |
| `resolved` | "Resolved — let us know if this isn't sorted" |
| `closed` | "Closed" |
| `cancelled` | "Cancelled" |

Customers never see raw enum values. That mapping living in stage configuration is what lets a
tenant add a stage and get sensible customer-facing copy without a release.

## 16.6 Anonymous submission

Desks with `allow_anonymous` accept storefront submissions without an account. The response
gives a reference number and invites registration.

**Security rule (restated because it is the portal's sharpest edge):** a reference number is
**never** sufficient to read a ticket. Any "check status by reference" flow requires a second
factor — the email or phone on the ticket — and is rate-limited and monitored. Sequential
references plus a bare lookup would expose every ticket in the tenant.

When an anonymous submitter later registers with the same email, the `person` graph links their
history — after email verification, never on an unverified claim.

## 16.7 Authorization

Every read resolves the caller to a `person` and checks requester-or-participant (RULE-11).
The thread read model strips `internal` messages **in the read model**, not in the UI, so no
API, export or webhook path can bypass it (RULE-10).

Agent identity is exposed as a display name only — never email, username, employee id or
internal role.

## 16.8 API (requester surface)

| Method | Path | Auth |
|---|---|---|
| GET | `/api/me/helpdesk/tickets` | selfAuth |
| GET | `/api/me/helpdesk/tickets/:documentId` | selfAuth + ownership |
| POST | `/api/me/helpdesk/tickets` | selfAuth |
| GET/POST | `/api/me/helpdesk/tickets/:documentId/messages` | selfAuth + ownership; public only |
| POST | `/api/me/helpdesk/tickets/:documentId/reopen` · `/rate` · `/close` | selfAuth + ownership |
| POST | `/api/helpdesk/public/tickets` | anonymous, per-desk, rate-limited |
| GET | `/api/web/help/articles` · `/:slug` | public |

The `/api/me/helpdesk/*` namespace exists so requester endpoints are **structurally separate**
from agent endpoints — a mistake in an agent endpoint's scoping cannot accidentally expose a
requester surface, and the requester namespace can be audited as one unit.

## 16.9 Session and token handling

`rutba-web-user` uses NextAuth over Strapi JWTs, which expire in ~2 hours and must be rotated
via `/auth/refresh`. A customer reading a long thread must not be silently logged out
mid-reply — refresh on focus, and preserve the draft across a re-auth.

## 16.10 Notifications to customers

Email by default, WhatsApp when available. Every notification deep-links into the thread.
Reply-by-email threads back into the ticket (§15.7).

## 16.11 CSAT

On resolution: a 1–5 rating and an optional comment, reachable from the email without logging in
(one-time signed link, single use, expiring). Ratings ≤2 notify the desk manager. Ratings are
visible to managers, and to the agent in aggregate — individual scores shown to an individual
agent, with comments, only where the tenant enables it.

## 16.12 Localisation and accessibility

Urdu and English at launch; RTL-safe layout; dates and numbers locale-formatted. WCAG 2.1 AA:
keyboard navigable, screen-reader labelled, sufficient contrast, no colour-only status.

## 16.13 KPIs

Portal adoption (tickets via portal ÷ all customer tickets) · self-service deflection · median
time-to-first-portal-view after notification · reply-via-portal vs reply-via-email · CSAT
response rate · reopen rate from the portal.

---

## Acceptance criteria for this section

- [ ] A customer cannot read another customer's ticket by id, reference, or any enumeration.
- [ ] Internal notes are absent from portal API responses at the read-model level.
- [ ] Reference-only lookup is impossible without a second factor.
- [ ] Status text is plain language everywhere; no raw enum reaches the UI.
- [ ] Order-linked ticket creation works from order and return pages.
- [ ] Token refresh preserves an in-progress reply.
- [ ] CSAT link works without login, once, and expires.
- [ ] Urdu locale renders correctly including RTL.
