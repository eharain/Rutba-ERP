# 18 — Agent Workspace

[← 17 Employee Portal](17-employee-portal.md) · [Index](00-index.md) · Next: [19 Manager Workspace](19-manager-workspace.md)

---

## 18.1 Purpose

The screen agents live in all day. Its design goal is **time-to-resolution**, and everything
else is subordinate to that.

**Host:** `rutba-helpdesk` (:4023).

## 18.2 The one design principle

> Everything needed to answer this ticket is on this screen, or one keystroke away.

An agent who opens another app to answer a question has been failed by the workspace. That is
the entire argument for an ERP-native helpdesk: the order, the payment, the stock, the device
and the employee record are all in the same system already.

## 18.3 Ticket detail layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│ HD-2026-000123  Damaged item in order SO-4471          [status] [priority] │
│ Customer Support · Ayesha K. · SLA 3h 12m ▓▓▓▓▓░░  · WhatsApp · Lahore      │
├──────────────────────────────────────────────┬─────────────────────────────┤
│ CONVERSATION                                 │ CONTEXT                     │
│                                              │                             │
│ ● Requester · 6 Aug 09:12 · WhatsApp         │ ▸ Requester                 │
│   The blue shirt arrived torn…               │   Sana M. · +92 3xx…        │
│   📎 photo.jpg                                │   12 orders · 3 tickets     │
│                                              │   CSAT 4.6                  │
│ ◐ INTERNAL — not visible to requester        │                             │
│   Bilal · 6 Aug 09:40                        │ ▸ Order SO-4471             │
│   Checked stock — replacement available      │   Delivered 4 Aug · PKR 4,200│
│                                              │   Blue shirt ×1 · COD paid   │
│ ● Ayesha K. · 6 Aug 09:55 · Email            │   [Open in Orders]           │
│   So sorry — we're sending a replacement…    │                             │
│   ✓ Delivered                                │ ▸ Suggested articles        │
│                                              │   Damaged-goods policy      │
├──────────────────────────────────────────────┤   Replacement process       │
│ [ Public reply ▾ ] [ Internal note ]         │                             │
│ ┌──────────────────────────────────────────┐ │ ▸ Attachments (1)           │
│ │                                          │ │ ▸ Watchers (2)              │
│ └──────────────────────────────────────────┘ │ ▸ Time logged: 12m          │
│ 📎  ⚡Macro  📄KB      [Send]  [Send+Resolve] │ ▸ Activity (14)             │
└──────────────────────────────────────────────┴─────────────────────────────┘
```

## 18.4 The public/internal distinction

The module's highest-consequence UI error is sending an internal note publicly. Defences, all of
them, not a choice among them:

1. The composer's mode is a **persistent two-state control**, always visible — never a subtle
   icon or a hidden default.
2. Internal mode changes the composer's **background colour and border**, not just a label.
3. The send button reads **"Send to requester"** or **"Save internal note"** — the action names
   its audience.
4. Internal messages in the thread carry a distinct background, a left border, and an explicit
   "Internal — not visible to the requester" label on **every** entry, not just the first.
5. Switching from internal to public with text already typed prompts for confirmation.
6. Server-side, `visibility` is required and validated against the author's role — the UI is
   never the only gate.

## 18.5 Context panel

Rendered from the ticket's `subject_entity_uid`, with a registered projection per entity type:

| Subject | Panel shows |
|---|---|
| Sale order | Items, totals, payment state, delivery state, rider, timeline · deep link |
| Return / RMA | Items, reason, state, refund state |
| Product | SKU, stock on hand, branch stock, recent tickets about it |
| Stock item | Serial, batch, expiry, location, movement history |
| Purchase order | Supplier, expected date, receipt state |
| Work order | Recipe, stage, blockers |
| Employee | Department, manager, assets assigned, open requests |
| Asset / device | Tag, serial, assignment, warranty, online state |
| Invoice / payment | Amount, status, method, settlement |

**Authorization rule:** the panel renders only fields the *viewer* is already permitted to see.
Ticket access is never a back door to the subject record — an agent without accounts access sees
an order's fulfilment state but not its margin.

Unknown or unregistered types render a generic link rather than an error.

## 18.6 Composer capabilities

Rich text (bounded set: bold, italic, lists, links, code) · attachments by drag-drop or paste ·
**macros** (§03 F11) · **KB insert** (search and insert a summary + link) · **AI draft**
(§22 — always a draft the agent edits and sends, never auto-sent) · templates with variable
preview · draft autosave per ticket per user · send-and-transition combinations.

## 18.7 Queue behaviours

Covered in [06 §6.3](06-navigation-and-menus.md); the agent-specific parts:

- **Saved views** private by default, shareable by a manager to a team.
- **Claim** from the unassigned queue, atomic (§14.6).
- **Peek** — open a ticket in a side panel without leaving the queue.
- **Next ticket** — a single action that claims and opens the highest-priority eligible ticket,
  for agents working a pure queue discipline.
- **Bulk** operations from the queue with per-ticket authorisation and audit.

## 18.8 Keyboard shortcuts

| Key | Action |
|---|---|
| `j` / `k` | Next / previous in queue |
| `Enter` | Open |
| `Esc` | Close panel / cancel |
| `r` | Reply (public) |
| `n` | Internal note |
| `a` | Assign |
| `c` | Claim |
| `e` | Resolve |
| `p` | Priority |
| `m` | Apply macro |
| `/` | Search |
| `g` then `q`/`d`/`k` | Go to queue / dashboard / knowledge |
| `?` | Shortcut help |
| `Ctrl/Cmd+Enter` | Send |

Discoverable via `?`; never the only route to an action.

## 18.9 Agent dashboard

My open by status · assigned today · breaching soon (the first thing an agent should see) ·
awaiting my reply · my resolved this week · my CSAT · time logged today · unread mentions.

## 18.10 Collaboration

Internal notes with `@mentions` (notifies and adds as watcher) · watch/unwatch · request
reassignment · escalate to manager · shared drafts for a colleague to review before sending.
See [24 Internal Collaboration](24-internal-collaboration.md).

## 18.11 Performance requirements

| Interaction | Target |
|---|---|
| Queue first paint | < 800ms p95 |
| Ticket detail full render | < 1s p95 |
| Context panel | < 1.5s p95, loaded **async** — never blocking the thread |
| Send reply → visible | < 500ms optimistic |
| Search-as-you-type | < 300ms |

The thread renders before the context panel resolves. An agent should never wait on an order
lookup to read what the customer said.

## 18.12 Resilience

Optimistic send with rollback and draft preservation on failure · stale-data-wins on refresh
failure (show cached with a warning, not an error card) · bounded timeouts at every call site ·
concurrent-edit detection with a 409 and a refresh prompt · offline draft retention in local
storage.

---

## Acceptance criteria for this section

- [ ] Public/internal mode is unmistakable; all six defences implemented.
- [ ] Context panel loads async and never blocks the thread.
- [ ] Context panel respects the viewer's own entitlements on the subject record.
- [ ] All shortcuts work and are discoverable via `?`.
- [ ] Drafts survive navigation, refresh and failed sends.
- [ ] Performance targets met with 100k tickets in the desk.
- [ ] "Next ticket" claims atomically.
