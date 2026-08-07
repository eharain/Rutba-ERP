# 30 — Audit Logging

[← 29 Permission Matrix](29-permission-matrix.md) · [Index](00-index.md) · Next: [31 Settings](31-settings.md)

---

## 30.1 Purpose

Answer "who did what, when, and why" for every change — defensibly, permanently, and without
the possibility of quiet alteration.

## 30.2 Audit is not the event log

| | Audit log | Event log ([28](28-event-system.md)) |
|---|---|---|
| Answers | Who did what to which record | What happened, so others can react |
| Audience | Humans, auditors, disputes | Subscribers, integrations |
| Contents | Actor, before/after, reason, IP | Envelope + references |
| Mutability | **Append-only, forever** | Retained then pruned |
| Completeness | Every mutation, no exceptions | Only events worth publishing |

They are correlated by `correlation_id` but are not the same store, and neither substitutes for
the other.

## 30.3 Foundation

Rutba already has a generic audit primitive: **`work-item-activity`** with
`utils/work-item-activity.js#logActivity()`, keyed by `entity_uid` + `target_document_id`, with
kinds `created | transition | assigned | unassigned | watch | unwatch | comment | note` — already
the helpdesk vocabulary. It is best-effort and never throws, so an audit-insert failure cannot
unwind a transition.

**Helpdesk reuses it** (P4), with these extensions:

| # | Extension | Why |
|---|---|---|
| A1 | `ip`, `user_agent` | Attribution beyond the user id |
| A2 | `reason` | Mandatory on sensitive actions |
| A3 | `source` (`ui\|api\|automation\|ai\|import\|system\|cron`) | Distinguishes human from machine |
| A4 | `correlation_id` | Ties to the request and the event cascade |
| A5 | More kinds | `priority_changed`, `desk_changed`, `merged`, `split`, `sla_extended`, `escalated`, `macro_applied`, `elevation`, `export`, `redaction`, `approval_decided`, `remote_session` |
| A6 | **Immutability enforcement** | See §30.5 — the one genuinely new requirement |
| A7 | Retention independent of the ticket | Audit outlives what it describes |

> **Trade-off to decide.** `logActivity` is best-effort by design: it swallows failures so a
> business operation is never unwound by a logging error. That is right for a work-order note
> and wrong for RULE-12 ("every mutation writes an audit row"). **Recommendation:** keep
> best-effort for low-risk kinds, and make audit writes **transactional and mandatory** for a
> defined sensitive set (permission changes, elevation, redaction, export, approval decisions,
> SLA extension, remote sessions). If those cannot be recorded, the action does not happen.

## 30.4 What is audited

**Everything that mutates state.** Specifically: ticket created/updated/transitioned/assigned/
merged/split/archived · every message added, redacted · every attachment added, deleted,
downloaded (on restricted desks) · watchers and participants · tasks · time entries ·
approvals requested/decided/delegated/expired · SLA extended, escalated · macro applied ·
automation and AI actions · every configuration change (desk, workflow, SLA policy, catalog,
automation rule, routing rule, template, setting) · permission and role changes · elevation
used · exports run · retention purges · remote sessions.

**Reads are audited selectively** — only on `restricted` desks, for exports, and for elevation.
Auditing every read produces volume nobody will ever search and costs more than it protects.

## 30.5 Immutability

RULE-12 says audit rows are append-only and never editable or deletable by any role. That is a
claim the system must actually be able to make.

| Control | Implementation |
|---|---|
| No API | There is no update or delete endpoint for audit rows |
| No service method | The audit service exposes `append()` and `query()` only |
| DB permissions | The application DB user holds `INSERT`/`SELECT` on the audit table, not `UPDATE`/`DELETE` |
| Hash chain | Each row stores `prev_hash` and `row_hash` over its own content, forming a chain per tenant |
| Verification | A scheduled job re-walks the chain and alerts on any break |
| Backups | Audit tables included in every backup and verified in restore drills |

The hash chain is what turns "we don't allow edits" into "an edit is detectable". Direct database
access can always modify a row; the chain makes doing so evident. This is the difference between
an audit log an auditor trusts and one they don't.

## 30.6 Record shape

```jsonc
{
  "id": 993211,
  "entity_uid": "api::contact-ticket.contact-ticket",
  "target_document_id": "tk_…",
  "kind": "transition",
  "summary": "Resolved — replacement dispatched",
  "from_value": "working",
  "to_value": "resolved",
  "data": { "resolution_code": "replacement_sent", "workflow": "wf_…", "version": 3 },
  "actor": 42, "actor_label": "Ayesha K.",
  "source": "ui",
  "reason": null,
  "ip": "203.0.113.9", "user_agent": "Mozilla/5.0 …",
  "correlation_id": "req_01J…",
  "created_at": "2026-08-08T09:55:12.004Z",
  "prev_hash": "9f2c…", "row_hash": "1ab4…"
}
```

**Never stored in audit:** passwords, tokens, full message bodies (reference the message id),
payment card data, or the content of an internal note. An audit log that copies message bodies
becomes a second, unfiltered store of exactly the content RULE-10 protects.

## 30.7 Mandatory reasons

These actions cannot proceed without a reason recorded: SLA extension · ticket cancellation ·
merge across different requesters · message redaction · elevation · manual priority downgrade on
a breaching ticket · retention purge · disabling an audit-relevant setting · reassigning away
from an agent mid-work.

The list is short on purpose. A system that demands a reason for everything gets "asdf" typed
into every box.

## 30.8 Access and presentation

- **Ticket timeline** — the human-readable view agents and managers use ([24 §24.10](24-internal-collaboration.md)).
- **Audit search** — admin/manager surface: filter by actor, entity, kind, date, source, reason.
- **Entity history** — every change to one record.
- **Actor history** — everything one user did, which is what an investigation actually needs.
- **Config change log** — separated out, because "who changed the SLA policy last Tuesday" is
  asked far more often than any ticket-level question.

Scoped per [29](29-permission-matrix.md): admins see all, managers see their desks, agents see
their own tickets, requesters see nothing.

## 30.9 Retention and export

Default retention: **7 years** for audit (longer than tickets), configurable per tenant against
local requirements. Audit survives ticket archival and ticket purge — a purge is itself audited,
recording what was removed without retaining its content.

Export to CSV/JSON for auditors, permission-gated, itself audited, with the hash chain included
so the export can be independently verified.

## 30.10 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/tickets/:id/activity` | Ticket timeline |
| GET | `/api/helpdesk/audit` | Search (admin/manager) |
| GET | `/api/helpdesk/audit/entity/:uid/:documentId` | Entity history |
| GET | `/api/helpdesk/audit/actor/:userId` | Actor history (admin) |
| GET | `/api/helpdesk/audit/config` | Configuration change log |
| POST | `/api/helpdesk/audit/export` | Export (admin, audited) |
| GET | `/api/helpdesk/audit/verify` | Hash-chain verification status (admin) |

No `POST`, `PATCH` or `DELETE` on audit rows exists at any path.

## 30.11 Performance

Audit writes are the highest-volume writes in the module. They must not slow the operations they
record: append-only inserts with no indexes beyond what queries need
(`(entity_uid, target_document_id, created_at)`, `(actor, created_at)`, `(kind, created_at)`);
partitioned by month at scale; queried from a read replica when one exists; non-sensitive kinds
may batch-flush asynchronously, sensitive kinds write inside the transaction (§30.3).

---

## Acceptance criteria for this section

- [ ] Every mutation in [03](03-functional-requirements.md) produces an audit row — enumerated
      and tested one by one.
- [ ] No code path updates or deletes an audit row; DB grants enforce it independently.
- [ ] Hash chain verifies; a deliberately tampered row is detected.
- [ ] Sensitive actions fail closed when the audit write fails.
- [ ] Mandatory reasons enforced server-side.
- [ ] No secrets or message bodies in audit records.
- [ ] Audit survives ticket purge; the purge itself is audited.
- [ ] Audit writes add < 10ms p95 to the operations they record.
