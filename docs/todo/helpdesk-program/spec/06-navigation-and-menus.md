# 06 — Navigation & Menus

[← 05 Information Architecture](05-information-architecture.md) · [Index](00-index.md) · Next: [07 Data Model](07-data-model.md)

---

## 6.1 Purpose

Per-screen navigation contract: what each page is for, who sees it, what it does, and how it
behaves when empty. Screen *visuals* are [38 UI/UX](38-ui-ux-specifications.md); this section is
structure and behaviour.

## 6.2 Navigation model

The agent app follows the established Rutba shell: `Layout` + `Sidebar` + footer app launcher,
`ProtectedRoute`, `PrimeReactProvider` (missing it crashes overlays), and `RoleSwitcher` in the
header driving `X-Rutba-App-Role`.

**Menu items render only when the user holds the permission.** A hidden item is never a
substitute for a server-side check — both apply.

### Sidebar

| Item | Icon | Route | Visible to | Badge |
|---|---|---|---|---|
| Dashboard | gauge | `/` | all | — |
| Tickets | ticket | `/tickets` | all | count of my open |
| — My Open | | `/tickets?view=mine` | agent+ | count |
| — Unassigned | | `/tickets?view=unassigned` | agent+ | count |
| — Breaching | | `/tickets?view=breaching` | agent+ | count, amber/red |
| — Awaiting Customer | | `/tickets?view=waiting` | agent+ | — |
| — All | | `/tickets` | manager+ | — |
| Approvals | check-double | `/approvals` | approver | pending count |
| Customers | users | `/customers` | agent+ | — |
| Employees | id-badge | `/employees` | agent+ on internal desks | — |
| Teams | people-group | `/teams` | manager+ | — |
| Knowledge | book | `/knowledge` | all | drafts awaiting review (author+) |
| Service Catalog | list-check | `/catalog` | manager+ | — |
| Devices | laptop | `/devices` | agent+ with remote-support | — |
| Reports | chart-column | `/reports` | manager+ | — |
| Analytics | chart-line | `/analytics` | manager+ | — |
| Automation | robot | `/automation` | admin | failed runs, red |
| SLA | stopwatch | `/sla` | admin | — |
| Settings | gear | `/settings` | admin | — |

Breadcrumbs: `Helpdesk / Tickets / HD-2026-000123`. The ticket crumb shows `ticket_no`, not the
`documentId`.

---

## 6.3 Screen contracts

### `/tickets` — Queue

**Purpose.** The agent's home. Find the next thing to work on.

**Visible to.** All helpdesk roles; rows scoped per [04 §4.4](04-user-roles-and-permissions.md).

**Toolbar.** New ticket · Saved view selector · Filter · Sort · Columns · Bulk actions (on
selection) · Refresh · Export (manager+).

**Filters.** Desk · Status · Priority · Assignee · Team · Branch · Source · Tags · SLA state
(ok / at-risk / breached) · Created and updated ranges · Requester · Subject entity type ·
Has attachment · Unanswered.

**Columns** (user-configurable, persisted per user): `ticket_no` · Subject · Requester · Desk ·
Status · Priority · Assignee · SLA (countdown chip) · Last activity · Created · Branch · Tags.

**Row actions.** Open · Claim · Assign · Change priority · Quick-resolve (with resolution note).

**Bulk actions.** Assign · Transition · Priority · Desk · Tag · Close. Per-ticket authorisation
and audit (F10).

**Behaviour.** Server-side pagination, filtering and sorting — never client-side over a
truncated page. Default sort: SLA urgency, then priority, then age. Saved views are named
filter+sort+column sets, private by default, shareable to a team by a manager. Polling refresh
every 60s, pausing when the tab is hidden.

**Keyboard.** `j`/`k` move, `Enter` open, `a` assign, `c` claim, `r` reply, `e` resolve,
`/` focus search, `?` shortcut help.

**Empty states.** No tickets at all → onboarding card linking to desk setup. No results for a
filter → "No tickets match" + Clear filters. No permission for any desk → "You're not a member
of any desk yet" + contact-admin hint. *Never* an empty grid with no explanation.

**Permissions.** `helpdesk.ticket.read` scoped; bulk requires the corresponding action
permission.

---

### `/tickets/[documentId]` — Ticket detail

**Purpose.** Everything needed to resolve one ticket, without leaving the page.

**Layout.** Three regions — header (identity + state), centre (conversation), right rail
(context and actions). See [18 Agent Workspace](18-agent-workspace.md) for the full spec.

**Header.** `ticket_no` · subject (inline-editable) · status chip · priority chip · desk ·
assignee · SLA countdown · source · branch.

**Centre.** Chronological thread. Public replies and internal notes are **visually
unmistakable** — different background, a left border, and an explicit "Internal note — not
visible to the requester" label on every internal entry. Composer with public/internal toggle
that is *deliberately* a two-state control with the current mode always visible, never a
subtle icon: sending an internal note publicly is the module's highest-consequence UI error.

**Right rail.** Requester card (person, contact, other tickets, CSAT history) · Subject entity
panel (live projection of the linked order/product/asset) · Attachments · Watchers ·
Approvals · Time · Activity timeline · Linked/merged tickets · Suggested KB articles.

**Actions.** Reply · Internal note · Assign · Transition (workflow-driven buttons, only legal
ones shown) · Priority · Desk · Tag · Link subject · Merge · Split · Watch · Log time · Apply
macro · Print.

**Behaviour.** Optimistic send with rollback on failure and the draft preserved. Autosaved
drafts per ticket per user. Live-updating when someone else replies, with a non-intrusive
"1 new reply" marker rather than a scroll jump. Concurrent-edit detection on inline fields.

**Empty/edge states.** Deleted subject entity → "Linked record no longer available" rather than
a broken panel. Merged ticket → banner with a link to the target and a read-only thread.

---

### `/tickets/new` — Create on behalf

**Purpose.** Agent logs a phone or walk-in request.

**Fields.** Requester search (person graph, with create-new inline) · desk · catalog item
(optional, switches the form) · subject · body · priority · source · branch · subject entity ·
attachments · tags.

**Behaviour.** Gate effects on `router.isReady` — the `/new/<entity>` shim leaves `documentId`
undefined on first render. Duplicate warning when the same requester has an open ticket with a
similar subject.

---

### `/approvals`

Pending approvals for the current user, grouped by age. Actions: Approve · Reject (reason
required) · Delegate · Request info. Empty state: "Nothing awaiting your approval."

### `/customers` and `/customers/[documentId]`

Requester directory backed by the `person` graph. Profile shows tickets, orders, returns,
payments, devices, CSAT and agent-only notes. Merge duplicates is a **CRM** action — link out,
do not reimplement it here.

### `/teams`

Teams, membership, desk assignment, working hours, current load. Manager+ only.

### `/knowledge`

Browse by category, search, filter by visibility (`public` | `internal` | `draft`). Author,
review and publish per [11 Knowledge Base](11-knowledge-base.md).

### `/catalog`

Catalog item list and builder — form fields, approver chain, target desk, SLA, visibility.

### `/automation`

Rules list with enabled state, last run, failure count; the builder; and the **run log** —
which is the screen that gets used when automation misbehaves, so it is a first-class view, not
a debug afterthought.

### `/sla`

Policies, business calendars, holidays, and the breach log with drill-through to the tickets.

### `/reports` and `/analytics`

See [21 Reports & Analytics](21-reports-and-analytics.md).

### `/settings`

Desks · statuses · priorities · categories · tags · ticket-number format · channels · email ·
notification templates · branding · localisation · retention · integrations.

---

## 6.4 Portal navigation (customer)

Top nav: My Requests · New Request · Help Articles · Profile. Deliberately four items.

Ticket card: reference, subject, status in plain language ("We're working on it", not
`in_progress`), last update, unread indicator. Detail: conversation, attachments, reply,
reopen (within window), rate.

**No** SLA countdowns, agent names beyond a display name, internal notes, queue positions or
priority labels are shown to customers. Status vocabulary is mapped to plain language in
[16 Customer Portal](16-customer-portal.md).

## 6.5 Portal navigation (employee)

Sidebar within ESS: My Requests · New Request · Team Requests (line managers, where granted) ·
Knowledge. Approval steps are shown with their current approver so an employee can see *who*
they are waiting on — the single commonest support question about internal requests.

## 6.6 Global behaviours

- **Loading:** skeletons for lists and the detail shell; never a blank page or a full-page
  spinner that discards context.
- **Errors:** inline and actionable. Stale-data-wins — show cached data with a warning banner
  rather than an error card when a refresh fails and data is already present.
- **Timeouts:** every call is bounded at the call site; the web client has no default request
  timeout, so a wedged backend must not hang a page indefinitely.
- **Permissions:** a 403 renders "You don't have access to this desk", not a crash or a redirect
  loop.
- **Deep links:** always restorable; filter state lives in the query string.

---

## Acceptance criteria for this section

- [ ] Every sidebar item hidden without permission **and** blocked server-side.
- [ ] Public vs internal composer state is unmistakable; usability-tested against mis-sends.
- [ ] Every list has a defined empty state; none renders a bare empty grid.
- [ ] Queue filtering, sorting and pagination are server-side.
- [ ] Keyboard shortcuts implemented and discoverable via `?`.
- [ ] Customer surfaces expose no SLA, priority, queue or internal data.
