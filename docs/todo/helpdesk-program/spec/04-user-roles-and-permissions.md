# 04 — User Roles & Permissions

[← 03 Functional Requirements](03-functional-requirements.md) · [Index](00-index.md) · Next: [05 Information Architecture](05-information-architecture.md)

---

## 4.1 Purpose

Who can do what. This section defines the **roles**; the exhaustive role × action grid is
[29 Permission Matrix](29-permission-matrix.md).

## 4.2 How this fits the existing authorization model

Helpdesk defines **no new identity system**. It plugs into the layered model already in place:

```
role  +  claim  +  situation  +  ownership  +  relations  +  context  +  elevation
```

- **Roles** are api-pro app-roles under a new `helpdesk` domain in
  `packages/api-provider/config/domains.json`.
- **Claims** come from the user's `app_roles`, cached in `strapi.apiPro.cache`.
- **Ownership** is row-level via the `owners` relation (plural manyToMany — the standing
  convention).
- **Relations** carry the two scoping rules unique to this module: **desk membership** and
  **branch scope**.
- **Context** is the calling app, asserted by the `X-Rutba-App` header and the descriptor's
  `apps` list.
- **Elevation** covers break-glass access (§4.8).

Authorization is enforced **at the service layer**, not only at the route. Every
`TicketService` method takes an actor and checks entitlement, so an event handler, cron or AI
action cannot bypass a check simply by not being an HTTP request.

## 4.3 The roles

### Helpdesk Admin — `helpdesk_admin`

Configures the desk. Not a super-user over ticket *content*.

**Can:** configure desks, statuses, priorities, workflows, SLA policies, business calendars,
routing rules, automation rules, service-catalog items, macros, notification templates,
settings and branding · manage teams and desk membership · view all tickets across all desks
and branches · export · redact a message (audited) · configure retention · enable remote-support
policy.

**Cannot:** delete or edit audit-log entries (RULE-12) · delete tickets (RULE-13 — cancel and
archive only) · read another tenant's data under any circumstance · silently impersonate a user
(impersonation, if enabled, is explicit, time-boxed and audited).

### Helpdesk Manager — `helpdesk_manager`

Runs a desk day to day.

**Can:** view all tickets on desks they manage · assign, reassign, unassign · escalate ·
change priority and desk · merge and split · bulk-operate · approve within their authority ·
view team dashboards, workload and reports · configure their desk's membership, queues and
saved views · apply and author macros for their desks.

**Cannot:** change global settings, tenant-wide SLA policy or workflows · see desks they do not
manage · delete tickets · alter audit records.

### Helpdesk Agent — `helpdesk_staff` *(displayed as "Agent")*

Does the work.

**Can:** view tickets on their desks (subject to desk visibility settings) · claim unassigned
tickets · reply publicly · add internal notes · attach files · apply macros · change priority
within a configurable band · transition tickets per the workflow's role gates · link a subject
entity · log time · add watchers · search the knowledge base · create a KB draft.

**Cannot:** delete tickets · merge/split (unless granted) · reassign to another agent (may
*request* reassignment, or return to queue if the desk allows) · view desks they are not a
member of · edit or delete another user's message · publish KB articles without review.

> **Role key naming.** The api-pro convention is `<domain>_admin|manager|staff`, and
> `requireAppRole` `domains` are **role-key prefixes**. So the keys are `helpdesk_admin`,
> `helpdesk_manager`, `helpdesk_staff`. "Agent" is a display label over `helpdesk_staff` — do
> not invent `helpdesk_agent` as a separate key, or prefix matching and the seeder will
> disagree with the UI.

### Approver — `helpdesk_approver` *(capability role, additive)*

Grants approval authority on catalog items and workflow approval steps. Held *in addition* to
another role, or by users outside the desk entirely (a finance controller approving refunds).
Scope is defined per approval step, not globally. See [23 Approval Workflows](23-approval-workflows.md).

### Employee — via `ess_employee` / `ess_manager`

Existing ESS roles gain helpdesk capability; no new role.

**Can:** submit requests from the service catalog · view and reply to their **own** requests ·
attach files · reopen their own within the window · rate on resolution · read published KB
articles marked `internal`.

**Cannot:** see other employees' requests (except an `ess_manager` over their direct reports,
where the desk grants it) · see internal notes · assign, transition beyond
`reopen`/`cancel-own`, or view queues.

### Customer — via `storefront_user`

**Can:** create tickets · view and reply to their own · attach files · reopen within the window ·
rate · read `public` KB articles.

**Cannot:** see internal notes (RULE-10) · see agent identities beyond display name · see any
other requester's data (RULE-11) · see queues, dashboards, SLA internals or other tickets on the
same order raised by someone else.

### System / Automation — `helpdesk_system`

The identity automation, event handlers and crons act as.

**Can:** create, update, transition, assign and notify — exactly the operations its rules
declare.

**Cannot:** exceed the permissions declared on the rule (RULE-15) · act without writing an
audit row naming the rule · approve an approval step · read internal notes into a
requester-visible surface.

### Anonymous / Guest

**Can:** submit via the public storefront form on desks with `allow_anonymous` · read `public`
KB articles.

**Cannot:** read any ticket. A guest who later registers has their tickets linked through the
`person` graph, not through a guessable reference.

> **Security note.** A ticket reference number must never be sufficient to read a ticket. Any
> "check status with your reference" feature requires a second factor (the email or phone on
> the ticket) and is rate-limited — otherwise sequential references leak every ticket in the
> tenant.

## 4.4 Scoping dimensions

A role answers *what kind of thing* you may do. Three scopes answer *which rows*.

| Scope | Mechanism | Example |
|---|---|---|
| **Desk** | Desk membership rows | An IT agent does not see HR tickets |
| **Branch** | Ticket `branch` vs the user's branch entitlement | Lahore manager sees Lahore only |
| **Ownership** | `owners` relation / `requester` identity | A customer sees their own tickets |

Effective visibility = `role capability` ∩ `desk scope` ∩ `branch scope` ∩ `ownership rule`.
All four are ANDed. A manager of two desks in one branch sees exactly those tickets.

**Desk visibility modes** (per desk, configured):

| Mode | Meaning |
|---|---|
| `member_only` | Only desk members see the desk's tickets — the default |
| `org_visible` | Any authenticated agent may read; only members may act |
| `restricted` | Members see only tickets assigned to them or unassigned in their queue — for sensitive desks (HR grievances, payroll) |

## 4.5 The HR line-manager rule

Today `teamTickets` scopes by the reporting line via `managedReportDocIds`. That behaviour is
**preserved as an additional grant on HR-flavoured desks**, not as the general model:

> Desk membership is the primary scope. A desk may additionally set
> `grant_line_manager_access = true`, which lets a requester's line manager read and act on
> their tickets for that desk only.

This keeps the existing ESS/HR behaviour working (BR-E3, BR-E6) without imposing an
org-chart-shaped permission model on customer support.

## 4.6 Requester-side authorization

Requesters are authorised by **identity, never by role**:

1. Resolve the caller to a `person` (contact-unification graph).
2. A ticket is readable if that person is the requester, or an explicit participant.
3. The thread read model strips `internal` messages before serialization — filtering happens in
   the read model, not in the UI, so no API, export or webhook path can bypass it.

## 4.7 Permission naming

`helpdesk.<resource>.<action>[.<qualifier>]` — for example `helpdesk.ticket.assign`,
`helpdesk.ticket.reply.own`, `helpdesk.desk.configure`, `helpdesk.kb.publish`. The `.own`
qualifier denotes ownership-scoped variants. Full list: [29 Permission Matrix](29-permission-matrix.md).

## 4.8 Elevation (break-glass)

Some incidents genuinely require access outside normal scope — a director investigating a
complaint on a restricted desk.

**Rules.** Elevation is explicit (never implicit from seniority), time-boxed (default 1 hour),
requires a stated reason, is audited as `elevation` with the reason, notifies the desk's
manager and the tenant admin at the moment it is used, and appears in a standing elevation
report. It grants **read** by default; write elevation is a separate, rarer grant.

## 4.9 Registration checklist

- [ ] `helpdesk` domain in `packages/api-provider/config/domains.json` with
      `helpdesk_admin`, `helpdesk_manager`, `helpdesk_staff` (+ `helpdesk_approver`,
      `helpdesk_system`).
- [ ] `packages/shared/lib/roles.js` — `APP_URLS.helpdesk`, `VALID_APP_KEYS`, `APP_META`
      (category `sales`).
- [ ] Descriptors declare `domains`, `apps` and per-method `scope`.
- [ ] `RoleSwitcher` wired; `X-Rutba-App-Role` drives the claim.
- [ ] Re-seed: `npm run seed -- --only=api-provider,up-permissions`.
- [ ] Verify: an agent on desk A gets 403 on a desk B ticket, at the **service** layer, proven
      by a test that calls the service directly rather than through HTTP.

---

## Acceptance criteria for this section

- [ ] Every role's "Cannot" list has a passing negative test.
- [ ] Cross-desk, cross-branch and cross-requester denial each proven at the service layer.
- [ ] RULE-10 verified for every role that can read a ticket.
- [ ] Elevation produces an audit row, a notification and a report entry.
- [ ] Legacy ESS/HR line-manager access still works via `grant_line_manager_access`.
