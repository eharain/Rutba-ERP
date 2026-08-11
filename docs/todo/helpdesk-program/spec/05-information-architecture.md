# 05 — Information Architecture

[← 04 Roles & Permissions](04-user-roles-and-permissions.md) · [Index](00-index.md) · Next: [06 Navigation & Menus](06-navigation-and-menus.md)

---

## 5.1 Purpose

How the module's concepts are organised, and where each lives across the four surfaces:
the **agent app** (`rutba-helpdesk`, :4023), the **customer portal** (`rutba-web-user`), the
**employee portal** (`rutba-ess`), and the **storefront** (`rutba-web`).

## 5.2 Concept hierarchy

```
Tenant
└── Desk                      (Customer Support, IT, HR, Facilities, Field Service, RMA, Maintenance)
    ├── Team                  (agents grouped for routing and reporting)
    ├── Queue                 (a saved, ordered view over the desk's tickets)
    ├── Workflow              (the configurable stage graph — shared engine)
    ├── SLA Policy            (targets per priority, bound to a business calendar)
    ├── Service Catalog Item  (a request type with its own form + approver + SLA)
    ├── Automation Rule       (trigger → condition → action)
    └── Ticket                (the aggregate root)
        ├── Message           (public reply | internal note)
        ├── Attachment
        ├── Watcher / Participant
        ├── Approval          (when the workflow or catalog item requires one)
        ├── Time Entry
        ├── Subject Link      (→ any ERP entity)
        ├── Activity          (audit trail)
        └── Rating            (CSAT, on resolution)

Knowledge Base               (tenant-scoped, desk-taggable, not desk-owned)
└── Category → Article → Version
```

**The one structural rule:** everything configurable hangs off a **Desk**, except the Knowledge
Base, which is tenant-scoped and *tagged* by desk. A single article ("how to reset your
password") often serves the IT desk and the customer portal at once; making it desk-owned would
force duplication.

## 5.3 The aggregate boundary

`Ticket` is the aggregate root. Messages, attachments, approvals, time entries, watchers and
ratings have no independent existence and are only ever reached through their ticket. This is
enforced in the API — there is no top-level `/api/helpdesk/messages/:id` — which is what makes
RULE-10 and RULE-11 tractable: **there is exactly one authorization gate to get right**, and it
sits on the ticket.

Desks, teams, workflows, SLA policies, catalog items, automation rules, macros and KB articles
are separate aggregates with their own lifecycles and their own endpoints.

## 5.4 Agent app (`rutba-helpdesk`, :4023)

```
/                             Dashboard (role-aware: agent | manager | admin)
/tickets                      Queue — the primary working surface
  ?view=<saved>               Saved views (My Open, Unassigned, Breaching, Awaiting Customer…)
/tickets/[documentId]         Ticket detail — thread, context, actions
/tickets/new                  Create on behalf of a requester
/queues                       Queue definitions and their live depth
/customers                    Requester directory (people who have raised tickets)
/customers/[documentId]       Requester profile — tickets, orders, devices, notes
/employees                    Employee requester directory (HR/IT/facilities desks)
/teams                        Teams, membership, workload
/knowledge                    KB browse / author / review
/knowledge/[documentId]       Article view + edit + versions
/catalog                      Service catalog items
/catalog/[documentId]         Catalog item builder (form, approver, SLA, workflow)
/approvals                    Approvals awaiting me
/reports                      Report library
/analytics                    Trends, breakdowns, exports
/automation                   Rules list + builder + run log
/sla                          SLA policies, calendars, holidays, breach log
/devices                      Device inventory (remote-support epic, phase 5a)
/settings                     Desks, statuses, priorities, categories, tags, templates,
                              channels, notifications, branding, retention
```

## 5.5 Customer portal (`rutba-web-user`)

```
/support                      My support home
/support/new                  Raise a request
/support/tickets              My tickets
/support/tickets/[id]         Conversation + status + attachments + rate
/support/knowledge            Public help articles
/support/knowledge/[slug]     Article
```

Plus contextual entry points on existing pages: **"Get help with this order"** on
`/sale-orders/[id]` and `/returns/[id]`, which pre-links the subject entity (BR-C4).

## 5.6 Employee portal (`rutba-ess`)

```
/requests                     My requests (replaces the current /tickets page)
/requests/new                 Service catalog picker → dynamic form
/requests/[id]                Conversation + approval status
/requests/team                My reports' requests (line managers, where the desk grants it)
/knowledge                    Internal knowledge (published, visibility: internal)
```

The existing `rutba-hr/pages/tickets.js` and `rutba-ess/pages/tickets.js` are replaced by one
shared component in `pos-shared`, consumed by both, so the current duplication ends. HR keeps a
link into the agent app for staff who hold a helpdesk role.

## 5.7 Storefront (`rutba-web`)

```
/contact                      Contact form (existing page, rewired to the real desk API)
/help                         Public knowledge base
/help/[slug]                  Article, with "still need help?" → ticket
```

Anonymous submission stays supported on desks with `allow_anonymous`, and the response shows a
reference number plus a prompt to register so the ticket becomes trackable.

## 5.8 Cross-app integration points

| Where | What appears | Why |
|---|---|---|
| `rutba-order-management` → order detail | "Tickets about this order" panel + Raise ticket | Support context where fulfilment work happens |
| `rutba-crm` → contact detail | Ticket history on the relationship timeline | CRM owns the relationship view |
| `rutba-inventory` → product / stock item | Tickets referencing this product | Quality signal |
| `rutba-hr` → employee record | That employee's requests | HR case context |
| `rutba-manufacturing` → work order | Tickets about this job | Shop-floor issues |
| `pos-sale` (POS) | Raise a branch support ticket | Terminal and cash issues at the till |

All of these are **read projections plus a create action** — the ticket data model is never
duplicated into another app.

## 5.9 URL and identifier conventions

- Routes address tickets by `documentId`, matching every other Rutba app.
- `ticket_no` (e.g. `HD-2026-000123`) is the **human** reference: quotable, searchable,
  printable — and never sufficient on its own to authorise a read (§04.3).
- The `/new/<entity>` shim makes `documentId` undefined on first render; effects on
  `/tickets/new` must gate on `router.isReady`.
- Deep links are canonical: `/tickets/{documentId}` opens the thread with the right filter
  context restored from the query string.

## 5.10 Information density stance

The agent queue is a **working surface**, not a report: dense rows, keyboard navigable, minimal
chrome. The customer portal is a **reassurance surface**: large status, plain language, no
jargon, no SLA internals. These are different design targets and should not share a table
component. See [38 UI/UX](38-ui-ux-specifications.md).

---

## Acceptance criteria for this section

- [ ] Every route above exists or is explicitly deferred with its wave number.
- [ ] No endpoint exposes a ticket child resource outside its ticket.
- [ ] Cross-app panels use read projections only — no duplicated ticket storage.
- [ ] ESS/HR ticket pages consolidated into one `pos-shared` component.
