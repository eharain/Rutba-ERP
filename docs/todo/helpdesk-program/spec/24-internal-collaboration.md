# 24 — Internal Collaboration

[← 23 Approval Workflows](23-approval-workflows.md) · [Index](00-index.md) · Next: [25 File Management](25-file-management.md)

---

## 24.1 Purpose

Let the people working a ticket talk to each other **inside the ticket**, so the reasoning
behind a resolution is preserved and does not evaporate into a WhatsApp group.

## 24.2 What exists

Rutba already has a **generic work-item collaboration layer**, entity-agnostic and keyed by
`entity_uid` + `target_document_id`:

| Entity | Purpose |
|---|---|
| `work-item-comment` | Discussion thread — `body`, `author`, `author_label` |
| `work-item-watch` | One row per user per item |
| `work-item-activity` | Audit trail via `logActivity()`, kinds: `created`, `transition`, `assigned`, `unassigned`, `watch`, `unwatch`, `comment`, `note` |

Descriptors exist for all three, scoped to the `manufacturing` and `order-management` domains.

**How Helpdesk uses it:**

| Concern | Decision |
|---|---|
| Ticket thread (public + internal) | **Dedicated `helpdesk_ticket_messages` table** — see [07 §7.4](07-data-model.md#74-ticketmessage). Not the generic comment store |
| Watchers | **Reuse `work-item-watch`** unchanged |
| Audit trail | **Reuse `work-item-activity`** + `logActivity()`, extended per [30](30-audit-logging.md) |

The split is deliberate. Watching and audit are low-risk, genuinely generic concerns. The
thread carries the highest confidentiality stakes in the module (RULE-10) and materially
different requirements — channels, delivery state, redaction, inbound idempotency — so it gets
its own table and its own single authorization gate rather than widening a store already
exposed to two other domains.

## 24.3 Internal notes

The primary collaboration mechanism: a message with `visibility: internal` on the ticket thread,
inline with the conversation so the reasoning sits next to what it is about.

**Rules.** Agents only. Never visible to requesters through any surface (RULE-10). Included in
agent search. **Excluded from** requester-facing exports, email templates, webhooks and AI
answers shown to requesters. Visually unmistakable in the UI (§18.4).

## 24.4 Mentions

`@name` in an internal note notifies the mentioned user, adds them as a watcher, and grants read
access **only if they could already be granted it**. Mentioning someone who has no entitlement
to the desk shows an inline warning and does not notify — otherwise mention becomes a
permission-bypass vector, and a chatty agent quietly leaks a restricted desk.

`@team` mentions notify a team, subject to the same check.

## 24.5 Watchers

Reuses `work-item-watch`. Auto-watch on: assignment, replying, being mentioned, requesting
approval. Manual watch/unwatch. Per-watcher `notify_on` preferences, with digesting available
(§15.6) so watching a busy ticket does not become a reason to stop watching anything.

## 24.6 Internal tasks

Lightweight checklist items on a ticket: `title`, `assignee`, `due_at`, `status`, `sequence`.
Not a project-management system — no dependencies, no sub-tasks, no Gantt. A ticket that needs
more than a checklist needs child tickets.

Tasks are internal-only. Their completion can gate a workflow transition where configured
("cannot resolve with open tasks").

## 24.7 Shared drafts

An agent composes a reply and asks a colleague to review before it is sent. The draft is
visible to the ticket's agents, comment-able, and only the owner or a manager can send it.
Valuable for junior agents, sensitive replies and anything legally consequential.

## 24.8 Handover

An explicit action rather than a bare reassignment: the outgoing agent writes a handover note
(what's been done, what's next, what to watch), which is recorded as an internal note and
notified to the incoming agent. Used at shift end, before leave, and on escalation.

Reassignment without a handover note is permitted but flagged in the audit — the note is a norm
enforced by visibility, not by a blocking validation that would just get worked around.

## 24.9 Child tickets

For work that genuinely splits across teams (onboarding: IT + HR + facilities). A child ticket
has its own desk, assignee and SLA; the parent stays in `waiting` until all children reach a
terminal status. Progress is visible on the parent.

Chosen over parallel workflow stages because a state machine with real concurrency becomes
unreadable and untestable ([09 §9.5](09-ticket-workflows.md)).

## 24.10 Activity timeline

Every collaboration event lands on the ticket's `work-item-activity` timeline: created,
assigned, transitioned, commented, noted, watched, mentioned, task added/completed, approval
requested/decided, macro applied, escalated, merged, SLA breached, AI action, automation action.

Filterable (all / messages only / status changes only / system only). This timeline is the
answer to "how did this ticket end up here?", and it is the first thing anyone looks at when a
ticket has gone wrong.

## 24.11 API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/helpdesk/tickets/:id/messages` (`visibility: internal`) | Internal note |
| GET/POST/DELETE | `/api/helpdesk/tickets/:id/watchers` | Watching |
| GET/POST/PATCH | `/api/helpdesk/tickets/:id/tasks` | Checklist |
| GET/POST | `/api/helpdesk/tickets/:id/drafts` · POST `/drafts/:id/send` | Shared drafts |
| POST | `/api/helpdesk/tickets/:id/handover` | Handover |
| POST | `/api/helpdesk/tickets/:id/children` | Child ticket |
| GET | `/api/helpdesk/tickets/:id/activity` | Timeline |

## 24.12 Permissions

`helpdesk.ticket.note.internal` · `helpdesk.ticket.watch` · `helpdesk.ticket.mention` ·
`helpdesk.ticket.task.manage` · `helpdesk.ticket.draft.send` · `helpdesk.ticket.handover` ·
`helpdesk.ticket.child.create`.

## 24.13 KPIs

Internal notes per ticket (a proxy for complexity) · mention response time · tickets with a
handover note at reassignment · child-ticket usage · shared-draft usage by tenure (should fall
as agents gain confidence) · watcher count distribution.

---

## Acceptance criteria for this section

- [ ] Internal notes never reach a requester through API, portal, email, export, webhook or AI.
- [ ] Mentioning a user without desk entitlement neither notifies nor grants access.
- [ ] Watchers reuse `work-item-watch` with no schema fork.
- [ ] Audit reuses `work-item-activity` with no schema fork.
- [ ] Parent stays `waiting` until all children are terminal.
- [ ] Shared drafts can only be sent by the owner or a manager.
- [ ] Timeline shows every event kind, filterable.
