# 23 — Approval Workflows

[← 22 AI Features](22-ai-features.md) · [Index](00-index.md) · Next: [24 Internal Collaboration](24-internal-collaboration.md)

---

## 23.1 Purpose

Some requests must not be actioned until someone with authority says yes — a refund, a price
change, equipment spend, an access grant. Approvals make that control explicit, timed and
auditable, instead of an informal chat nobody can later evidence.

## 23.2 Where approvals attach

| Attachment | Example |
|---|---|
| **Catalog item** | Every refund request needs finance approval |
| **Workflow transition** | Moving to `refund_issued` requires manager approval |
| **Conditional** | Refunds above PKR 10,000 need a second approver |
| **Ad hoc** | An agent requests approval on a one-off ticket |

## 23.3 Data model

**`TicketApproval`** — `ticket`, `catalog_item`, `trigger` (`catalog|transition|conditional|adhoc`),
`status` (`pending|approved|rejected|cancelled|expired`), `current_step`, `requested_by`,
`requested_at`, `completed_at`, `context` (json snapshot of the values approved against).

**`ApprovalStep`** — `approval`, `sequence`, `mode` (`sequential|parallel|any_of|quorum`),
`approver` (user) | `approver_role` | `approver_rule` (`line_manager`, `desk_manager`,
`branch_manager`, `budget_holder`), `status`, `decided_by`, `decided_at`, `decision`
(`approved|rejected`), `reason`, `timeout_hours`, `on_timeout` (`escalate|auto_reject|remind`),
`delegate_to`, `quorum_required`.

**`context` is a snapshot, deliberately.** An approver approves *a refund of PKR 4,200 on order
SO-4471*. If the ticket is later edited, the approval must still evidence what was actually
approved. Without the snapshot, approval records are unfalsifiable and therefore worthless as a
control.

## 23.4 Modes

| Mode | Behaviour |
|---|---|
| `sequential` | Steps in order; each waits for the previous |
| `parallel` | All approvers in the step notified at once; all must approve |
| `any_of` | Any one approver in the step suffices |
| `quorum` | N of M must approve |

Rejection at any step terminates the approval and transitions the ticket per the workflow —
usually to `cancelled`, or back to `working` for revision, configured per step.

## 23.5 Dynamic approvers

`approver_rule` resolves at request time against live data:

| Rule | Resolves to |
|---|---|
| `line_manager` | The requester's manager from the HR reporting line |
| `desk_manager` | The ticket's desk manager |
| `branch_manager` | The ticket's branch manager |
| `budget_holder` | Owner of the cost centre on the linked entity |
| `role:<key>` | Any holder of that role, as `any_of` |

**If a rule resolves to nobody, the approval does not silently pass.** It escalates to the desk
manager with an explicit "no approver could be resolved" reason. Silent auto-approval on an
unresolvable approver is the classic control failure in approval systems, and it is exactly the
failure an auditor looks for.

## 23.6 Conditional approvals

```json
{
  "condition": { "field": "custom_fields.refund_amount", "op": "gt", "value": 10000 },
  "then_steps": [ { "approver_rule": "desk_manager" }, { "approver_role": "finance_controller" } ],
  "else_steps": [ { "approver_rule": "desk_manager" } ]
}
```

Evaluated by the same condition evaluator as automation and routing — one expression language
across the module.

## 23.7 Lifecycle

```
requested → pending (step 1) → … → approved  → ticket continues
                             ↘ rejected  → ticket cancelled or returned for revision
                             ↘ expired   → per on_timeout
                             ↘ cancelled → requester withdrew or ticket cancelled
```

While an approval is pending, the ticket sits in a stage mapping to canonical `waiting`, so the
resolution clock pauses if the policy says so — approval delay is not the agent's fault and
should not consume their SLA. **First response is unaffected**, because the requester should have
been acknowledged long before.

## 23.8 Delegation and absence

An approver may delegate to a named person for a period (leave, travel). Delegation is recorded
on the decision — "approved by Bilal R. on behalf of Ayesha K." — never hidden. Delegation
cannot be chained more than one hop, and cannot delegate to the requester.

If an approver is on leave with no delegate, the step escalates on timeout rather than sitting
indefinitely.

## 23.9 Separation of duties

- The requester can never approve their own request, even if they hold the role.
- The agent who actions the request should not be its sole approver where the desk sets
  `enforce_segregation`.
- Automation and AI can **never** approve (RULE-15, §22.2). An approval is a human accountability
  record; a machine-made approval defeats the purpose of having one.
- Admins cannot retroactively alter a decision. Corrections are new approvals with a reason.

## 23.10 Notifications

Approver: "awaiting your approval" on assignment, a reminder at half the timeout, and an
escalation notice at timeout. Requester: notified on each decision with the reason on rejection.
Agent: notified when the approval completes so work can resume.

Reminders are rate-limited; the nudge from the employee portal (§17.4) is one per step per day.

## 23.11 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/approvals` | Awaiting me |
| GET | `/api/helpdesk/tickets/:id/approvals` | Approvals on a ticket |
| POST | `/api/helpdesk/approvals/:id/approve` · `/reject` | Decide (reason required on reject) |
| POST | `/api/helpdesk/approvals/:id/delegate` | Delegate |
| POST | `/api/helpdesk/approvals/:id/request-info` | Ask before deciding — pauses the timeout |
| POST | `/api/helpdesk/tickets/:id/request-approval` | Ad hoc |
| GET | `/api/helpdesk/approvals/pending-report` | Bottleneck report (manager+) |

`request-info` matters: without it, an approver who needs a question answered can only approve
blindly or reject, and both corrupt the record.

## 23.12 Permissions

`helpdesk.approval.read` · `helpdesk.approval.decide` (resolved per step, not globally) ·
`helpdesk.approval.delegate` · `helpdesk.approval.request` · `helpdesk.approval.configure`
(admin).

## 23.13 Audit

Every request, decision, delegation, timeout, escalation and cancellation writes an audit row
with the actor, timestamp, reason and the `context` snapshot hash. Approval history is
**append-only and never editable by anyone**, including admins (RULE-12).

## 23.14 KPIs

Approval cycle time by step, approver and item · pending count and age · rejection rate with
reasons · timeout/escalation rate · delegation frequency · % tickets requiring approval ·
approval time as a share of total resolution time.

---

## Acceptance criteria for this section

- [ ] An unresolvable approver escalates; it never auto-approves.
- [ ] The requester cannot approve their own request under any role.
- [ ] Automation and AI cannot approve, proven by negative tests.
- [ ] `context` snapshot is immutable and survives later ticket edits.
- [ ] Timeout behaviours (escalate / auto-reject / remind) each verified.
- [ ] Delegation is visible on the decision and limited to one hop.
- [ ] Approval history cannot be edited or deleted by any role.
- [ ] Pending approval pauses the resolution clock but not first response.
