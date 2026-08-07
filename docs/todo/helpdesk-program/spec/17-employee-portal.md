# 17 — Employee Portal

[← 16 Customer Portal](16-customer-portal.md) · [Index](00-index.md) · Next: [18 Agent Workspace](18-agent-workspace.md)

---

## 17.1 Purpose

One place for employees to ask the business for something — IT, HR, facilities, payroll,
transport, maintenance — and to see where the request has got to and who it is sitting with.

**Host:** `rutba-ess` (:4015), with a link from `rutba-hr` (:4006) for staff who hold a
helpdesk role.

## 17.2 What exists and what changes

Today `rutba-ess/pages/tickets.js` and `rutba-hr/pages/tickets.js` are two near-duplicate
~166-line pages: a submit form with a **hardcoded** `["IT","HR","Facilities"]` array, a "my
tickets" table, and a "team tickets" table with a Resolve button. They call
`ContactTicketsEndpoints.listMine / submitInternal / listTeam / resolve`.

**Changes:**

1. One shared component set in `pos-shared`, consumed by both apps — the duplication ends.
2. Categories come from the **desk API**, never a hardcoded array (standing convention).
3. Submission goes through the **service catalog** so requests are structured, approved and
   routed — not free text into an enum bucket.
4. A real conversation thread replaces the reply-less table.
5. Approval status becomes visible, including **who** the request is waiting on.
6. `listTeam`/`resolve` behaviour is preserved via the desk's `grant_line_manager_access`
   (§04.5) — so nothing an ESS/HR user can do today stops working (BR-E6).

## 17.3 Pages

### `/requests` — My requests
Cards or a compact table: reference, type, plain-language status, current approver (when
pending), last update, unread badge. Filter open/closed. Empty state links to the catalog.

### `/requests/new` — Raise a request
Catalog picker grouped by category (IT, HR, Facilities, Transport, Finance, Maintenance),
filtered to items the employee may see. Selecting an item renders its dynamic form with
suggested internal KB articles above it. Submit → confirmation with reference and expected
turnaround.

Free-form "something else" remains available and routes to a default desk — an employee who
cannot find the right form must never be blocked from asking.

### `/requests/[documentId]` — Request detail
Public thread · reply · attachments · **approval chain visualised** (each step: who, status,
when, and who it is currently with) · linked entity (asset, leave record, payslip) · reopen ·
cancel own · rate.

### `/requests/team` — Team requests
For line managers where the desk grants it. Their reports' requests with status and the actions
they are permitted (comment, resolve on HR-flavoured desks). Preserves today's `teamTickets` +
`resolve` behaviour under the new permission model.

### `/knowledge` — Internal knowledge
Published articles with `visibility: internal` — policies, how-tos, IT self-help. Not
`agent_only` articles.

## 17.4 Approval visibility

The commonest support question about an internal request is *"who is it waiting on?"*. The
detail page answers it without anyone having to ask:

```
Manager approval    ✅ Approved by Ayesha K. · 6 Aug, 10:14
IT manager approval ⏳ Waiting on Bilal R. · since 6 Aug, 10:14 (1 day)
Fulfilment          ⬜ Not started
```

Employees may send a **nudge** to the current approver — rate-limited to one per step per day, so
it stays a reminder rather than a harassment channel.

## 17.5 Employee identity

The employee is resolved through `resolveOrCreateEmployeeForUser`, and their `person` links the
request into the same contact-unification graph as everything else. A request always carries
both `employee` (HR context) and `person` (identity), so an employee who is also a customer has
one identity and two clearly separated surfaces.

**Privacy boundary:** an employee's *support* requests and their *HR case* records are the same
storage but different desks with different visibility. A grievance on a `restricted` HR desk is
never visible to their line manager, regardless of `grant_line_manager_access`, because that
grant is per-desk and restricted desks do not set it.

## 17.6 API

| Method | Path | Auth |
|---|---|---|
| GET | `/api/me/helpdesk/requests` | selfAuth |
| POST | `/api/me/helpdesk/requests` | selfAuth |
| GET | `/api/me/helpdesk/requests/:documentId` | selfAuth + ownership |
| GET/POST | `/api/me/helpdesk/requests/:documentId/messages` | selfAuth + ownership; public only |
| POST | `/api/me/helpdesk/requests/:documentId/cancel` · `/reopen` · `/rate` · `/nudge` | selfAuth + ownership |
| GET | `/api/helpdesk/requests/team` | Line manager, desk-granted |
| GET | `/api/helpdesk/catalog?audience=employee` | selfAuth |

Legacy `/contact-tickets/mine`, `/submit-internal`, `/team`, `/:id/resolve` keep working as
adapters over `TicketService` (F13) until both apps are migrated.

## 17.7 Notifications

In-app within ESS plus email: request received · approval granted/rejected · agent replied ·
information needed · resolved · closed. Approvers get "awaiting your approval" and a reminder
before the step's timeout.

## 17.8 Mobile

Employees are the most mobile audience in the ERP — a warehouse worker reporting a broken
scanner is not at a desk. The ESS request flow must work well on a phone: single-column forms,
camera capture for attachments, large touch targets. See [39 Mobile](39-mobile-requirements.md).

## 17.9 KPIs

Requests per employee per month · catalog usage vs free-form (rising free-form means the catalog
has a gap) · approval cycle time by step and approver · time-to-resolution by desk ·
employee CSAT · nudge count per step (a proxy for approver responsiveness) · top zero-result
knowledge searches.

---

## Acceptance criteria for this section

- [ ] One shared component set serves both ESS and HR; the duplicate pages are gone.
- [ ] No hardcoded category array remains — desks come from the API.
- [ ] Existing `listMine` / `submitInternal` / `listTeam` / `resolve` behaviour preserved.
- [ ] An employee cannot see a colleague's request; a line manager sees reports' requests only
      on desks that grant it, and never on restricted desks.
- [ ] Approval chain shows the current approver by name.
- [ ] Nudge is rate-limited.
- [ ] Whole flow usable one-handed on a phone with camera attachment.
