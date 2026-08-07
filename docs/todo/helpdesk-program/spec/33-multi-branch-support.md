# 33 — Multi-Branch Support

[← 32 Configuration](32-configuration.md) · [Index](00-index.md) · Next: [34 Multi-Tenant Considerations](34-multi-tenant-considerations.md)

---

## 33.1 Purpose

Let one tenant run one desk across many branches without every branch drowning in every other
branch's tickets.

## 33.2 Context

Branch is already the ERP's single stock and operating location — warehouse was merged into
branch, so `branch` is *the* location entity. Helpdesk uses it as-is; it defines no second
location concept.

## 33.3 Branch on a ticket

`ticket.branch` is resolved at creation, in order:

1. Explicit on the request.
2. From the **subject entity** — the order's branch, the asset's branch, the work order's branch.
   This is the most reliable source and should be preferred wherever a subject exists.
3. From the **requester** — the employee's branch, or the customer's default/last-order branch.
4. From the **agent** creating on their behalf.
5. Tenant default.

Branch is mutable by agents (a ticket is often misfiled at intake) and every change is audited.

## 33.4 Three operating models

A tenant picks per desk, because different desks legitimately want different answers:

| Model | Behaviour | Fits |
|---|---|---|
| **Centralised** | One queue for all branches; branch is a reporting dimension only | Small tenants; specialist desks (HR, Finance) |
| **Branch-scoped** | Agents see only their branch's tickets; each branch has its own queue and its own agents | Retail chains; field service |
| **Hybrid** | Branch agents handle their own; a central team sees everything and picks up overflow | The realistic default for a growing tenant |

Configured on the desk as `branch_mode` with the desk's `branches` list.

## 33.5 Scoping rules

Effective visibility already ANDs role ∩ desk ∩ branch ∩ ownership
([04 §4.4](04-user-roles-and-permissions.md)). Branch scope specifically:

- An agent's branch entitlement comes from their user/employee branch assignment, which may be
  multiple.
- On a `branch_scoped` desk, an agent sees only tickets whose branch is in their entitlement.
- A branch manager sees their branch(es) only (US-10).
- Central agents hold a "all branches" entitlement on the desk.
- **Tickets with no branch** are visible to central agents and to the desk manager, never
  invisible to everyone — an unscoped ticket must not fall into a hole. This is the edge case
  that breaks naive branch filtering, where `WHERE branch IN (...)` silently drops NULLs.

## 33.6 Per-branch configuration

| Configurable per branch | Notes |
|---|---|
| Business calendar | Branch hours differ; a Karachi branch's Friday is not Lahore's |
| Holidays | Regional and religious holidays vary |
| Teams and agents | Branch staffing |
| Routing rules | Branch-first routing |
| Queues | Per-branch saved views |
| Email alias | `lahore-support@…` |
| SLA targets | Optional override where service levels genuinely differ |

SLA per branch is offered but discouraged: differing promises across branches are hard to explain
to customers and hard to report on. Where used, every report states which target applied.

## 33.7 Routing

`branch_based` and the composite `load_balanced` strategies filter to agents serving the ticket's
branch ([14 §14.3](14-assignment-and-routing.md)). Fallbacks, in order: branch agents →
central/overflow team → desk queue unassigned + manager notified. Routing never fails a ticket.

## 33.8 Reporting

Every report takes branch as a dimension and a filter ([21](21-reports-and-analytics.md)).
Branch comparison views: volume, SLA compliance, CSAT, resolution time, top resolution codes.

**Comparison caveat, stated in the UI:** branches differ in size, product mix and customer
profile. A raw SLA-compliance league table across branches invites the wrong conclusion. Report
per-branch figures alongside volume and normalise where a fair comparison is possible.

## 33.9 Cross-branch tickets

Some tickets legitimately span branches — a stock transfer dispute, a customer who ordered from
one branch and collected at another. Handling: the primary branch owns the ticket; other branches
are added as **participants** with read access to the public thread; the subject entity carries
its own branch, which the context panel shows. A cross-branch ticket appears in the owning
branch's reports only, to avoid double counting.

## 33.10 Data model

No new entity. On `Ticket`: `branch` (rel). On `Desk`: `branch_mode`, `branches` (m2m).
On `Team`: `branch`. On `SlaPolicy`: optional `branch` override. On `BusinessCalendar`:
`branch`.

Index `(branch, status)` on tickets — branch-scoped queue filtering is a hot path.

## 33.11 API

Branch is a filter on every list endpoint (`?branch=`), a dimension on every report, and a field
on create and update. `GET /api/helpdesk/branches/accessible` returns the caller's branch
entitlements — the frontend must not infer them.

## 33.12 KPIs

Volume, SLA compliance, CSAT and resolution time by branch · cross-branch ticket count ·
unassigned backlog per branch · agent coverage per branch (branches with no active agent are an
operational risk worth alerting on).

---

## Acceptance criteria for this section

- [ ] All three branch modes work as specified.
- [ ] Branch scoping enforced at the service layer, not just the query builder.
- [ ] Tickets with a NULL branch are visible to central agents and the desk manager.
- [ ] Branch resolution prefers the subject entity's branch.
- [ ] Per-branch calendars produce correct SLA calculations across differing hours.
- [ ] Cross-branch tickets count once, in the owning branch.
- [ ] Branches with no active agent raise an alert.
