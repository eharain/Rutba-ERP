# 15 — Notifications

[← 14 Assignment & Routing](14-assignment-and-routing.md) · [Index](00-index.md) · Next: [16 Customer Portal](16-customer-portal.md)

---

## 15.1 Purpose

Tell the right person the right thing at the right time, on the channel they use — without
becoming noise that gets filtered into oblivion.

## 15.2 What exists

The `notification-engine` service (`api::notification.notification-engine#processEvent`) with
`notification-template`, `notification-event`, `notification-log` and
`notification-preference`. The contact flow already fires `contact.submitted`,
`contact.reply.added` and `contact.sla.breach` through it, and templates for those are routed in
the dev database.

> **Standing trap:** two notification engines share one table. Engine-owned rows **must** use
> `trigger_event='none'`, or they fire on real orders. Every Helpdesk template row must honour
> this.

**Required work (P3):** a Core-native `NotificationService` facade so Helpdesk domain services
never reach into a services/strapi service directly. The facade owns channel selection, preference
resolution, quiet hours, digesting and delivery logging; the existing engine remains the
transport until it is ported.

## 15.3 Channels

| Channel | Status | Use |
|---|---|---|
| **In-app** | Build | Agent-facing default; badge + notification centre |
| **Email** | Available via Rutba-MTA | Requester-facing default; threaded replies |
| **WhatsApp** | Roadmap H1 | Requester-facing in PK — where customers actually are |
| **SMS** | Adapter | Urgent only; expensive, so gated by priority |
| **Push** | Later | Mobile app ([39](39-mobile-requirements.md)) |
| **Webhook** | Build | Integrations |

Channel selection: user preference → desk default → tenant default → in-app fallback.
**In-app is always written**, regardless of other channels, so the record exists even when
external delivery fails.

## 15.4 Notification catalogue

### To the requester

| Event | Channel | Content |
|---|---|---|
| Ticket created | Email/WhatsApp | Reference, subject, expected turnaround in plain language, portal link |
| Agent replied | Email/WhatsApp | The public reply, ticket link, reply-by-email instructions |
| Status changed to a stage with a `requester_label` | Email | Plain-language status, no jargon |
| Approval needed from them | Email | What's needed, deep link |
| Resolved | Email | Resolution, reopen window, CSAT link |
| Auto-close pending | Email | "Closing in 2 days unless you reply" |
| Closed | Email | Summary; how to reopen |
| Nudge in `waiting_customer` | Email/WhatsApp | What we're waiting for |

### To the agent

Assigned to you · requester replied on your ticket · mentioned in an internal note ·
SLA at risk / breached on your ticket · ticket escalated to you · approval decided on your
ticket · watched ticket changed · handover received.

### To the manager

Unassigned backlog above threshold · SLA breach on your desk · escalation reached you ·
agent over capacity · automation circuit-breaker tripped · routing failure · negative CSAT
(≤2) on your desk.

### To the admin

Automation rule disabled by breaker · inbound channel failure · notification delivery failure
rate above threshold · elevation used.

## 15.5 Templates

Per event × channel × locale: `subject`, `body`, `variables`, `locale`, `is_active`.
Variables are a declared allow-list resolved server-side (`{{ticket.ticket_no}}`,
`{{ticket.subject}}`, `{{agent.display_name}}`, `{{portal_url}}`, `{{resolution}}`).

**Template rendering is the single highest-risk leakage path in the module.** A careless
template variable can put an internal note into a customer email. Therefore:

- The requester-facing variable set is a **separate, restricted namespace** that cannot resolve
  internal notes, agent emails, other tickets, SLA internals or automation reasoning.
- Template save validates every variable against the namespace for its audience and refuses
  unknown or cross-namespace variables.
- Rendering escapes by output context.
- A template preview shows exactly what a requester would receive.

## 15.6 Preferences and noise control

Per user, per event type, per channel, with an "everything on my tickets" master toggle.
Requesters get a minimal, sensible default and an unsubscribe that cannot suppress
legally/operationally necessary messages (e.g. an approval they must act on).

**Noise control:**
- **Digest** — watched-ticket activity and low-priority agent notifications can digest hourly or
  daily rather than firing per event.
- **Quiet hours** — per user; non-urgent notifications hold until the next working hour.
  Urgent/breach notifications ignore quiet hours by design.
- **Collapse** — five replies in two minutes produce one notification, not five.
- **Self-suppression** — never notify someone about their own action.

A desk whose notifications get muted is a desk that stops working, so these are requirements,
not polish.

## 15.7 Inbound email (threading)

Outbound requester emails carry a stable reference in the subject (`[HD-2026-000123]`) **and**
`Message-ID`/`In-Reply-To` headers. Inbound replies are matched by header first, subject token
second, and appended as a `public` message from the requester.

**Rules.** Unmatched inbound creates a *new* ticket rather than being discarded. Auto-replies and
bounces are detected and never create tickets or reopen loops. Inbound is idempotent on
`external_id` (`Message-ID`). Signature and quoted-history stripping is best-effort and never
destroys content — the raw body is retained.

**Dependency:** Rutba-MTA inbound (RSMTPREST ingress) is listed as partial in the RightApp gap
analysis. Confirm before committing email as a launch channel.

## 15.8 Delivery, retry, logging

Every attempt writes a log row: recipient, channel, template, status, provider id, error.
Retries use exponential backoff (3 attempts) for transient failures; permanent failures (invalid
address) mark the recipient and alert. Delivery state is visible on the ticket so an agent can
see the customer never received the reply — which is otherwise an invisible and infuriating
failure mode.

## 15.9 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/notifications` | My in-app notifications |
| POST | `/api/helpdesk/notifications/:id/read` · `/read-all` | Mark read |
| GET/PATCH | `/api/helpdesk/notifications/preferences` | My preferences |
| GET/POST/PATCH | `/api/helpdesk/notifications/templates` | Templates (admin) |
| POST | `/api/helpdesk/notifications/templates/:id/preview` | Render preview |
| GET | `/api/helpdesk/notifications/log` | Delivery log (admin) |

## 15.10 Events

`helpdesk.notification.sent` · `.failed` · `.suppressed` (with reason) · `.digested`.

## 15.11 KPIs

Delivery success rate by channel · median delivery latency · read rate for in-app ·
unsubscribe rate · suppression count · notifications per ticket (a rising number means noise) ·
inbound match rate (header vs subject vs unmatched).

---

## Acceptance criteria for this section

- [ ] Requester templates cannot resolve internal-note or agent-private variables — enforced at
      template save **and** at render.
- [ ] Template preview shows exactly what the recipient receives.
- [ ] Engine-owned template rows use `trigger_event='none'`.
- [ ] Quiet hours, digest, collapse and self-suppression each verified.
- [ ] Inbound email threads correctly by header and by subject token; unmatched creates a new
      ticket; auto-replies never loop.
- [ ] Delivery failures are visible on the ticket, not only in a log.
- [ ] In-app notification is always written even when external channels fail.
