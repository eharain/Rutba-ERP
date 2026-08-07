# 01 — Vision & Objectives

[← Index](00-index.md) · Next: [02 Business Requirements](02-business-requirements.md)

---

## 1.1 Business vision

Every Rutba ERP tenant already runs its commerce, inventory, people and money inside Rutba.
What it does **not** have is a single place where *requests for help* land — from customers,
employees, suppliers and the system itself — and get tracked to resolution against a promise.

Rutba Helpdesk is that place: **one configurable service desk that serves every area of the
business**, built on Rutba Core so that a ticket is a first-class business object with the same
workflow, permission, audit and event guarantees as a sale order or a work order.

## 1.2 Mission

> Turn every unstructured request — an email, a form, a WhatsApp message, a phone call, an
> ERP event — into a tracked, owned, measurable ticket that resolves inside an agreed time.

## 1.3 What makes this different from bolting on Zendesk

Three things, and they are the entire justification for building rather than buying:

1. **The ticket knows the business.** A ticket can point at the actual sale order, invoice,
   stock item, work order or employee record it concerns, with live data, because it lives in
   the same system. No integration lag, no partial mirror, no ID mapping.
2. **The ERP raises its own tickets.** `StockBelowMinimum`, `PurchaseDelayed`,
   `PaymentFailed`, `SLABreached` — operational exceptions become tickets automatically
   through Core's event system, so the desk covers *system* problems, not just human ones.
3. **One desk, many areas.** Customer support, IT, HR, facilities, field service, warranty/RMA
   and maintenance are configured desks over one engine, not seven tools with seven logins,
   seven permission models and seven reports.

## 1.4 Scope

### In scope

| Area | What the desk handles |
|---|---|
| **Customer support** | Storefront and marketplace customers: order issues, returns, complaints, product questions |
| **Employee support** | IT, HR, facilities, payroll queries, equipment requests |
| **Internal requests** | Approvals, price changes, product creation, supplier onboarding — via the service catalog |
| **IT support** | Device-linked incidents, escalating to remote support |
| **Store / branch support** | POS terminal faults, cash discrepancies, stock disputes raised by branch staff |
| **Supplier support** | Purchase-order disputes, delivery issues, quality claims |
| **System-generated** | ERP exceptions raised as tickets by Core events |

### Out of scope (explicitly)

- **Field-service dispatch and scheduling** as a full sub-product (route optimisation,
  technician calendars). A field-service *desk* is in scope; dispatch is not.
- **Call-centre telephony** (PBX, IVR, call recording). Phone is a recordable *source*; the
  desk does not become a softphone.
- **Community forums** — see [40 Future Roadmap](40-future-roadmap.md).
- **Replacing `order-message`.** Order-scoped customer conversation, with its two-way peer
  sync, stays where it is; Helpdesk surfaces it, it does not absorb it.
- **ITIL certification-grade change/problem/release management.** Incident and request
  management are in scope; formal CMDB, change advisory boards and release management are not.

## 1.5 Goals

| # | Goal | Measured by |
|---|---|---|
| G1 | Nothing gets lost | 100% of inbound requests across all channels exist as a ticket with an owner |
| G2 | Everything has a promise | 100% of tickets carry a first-response and resolution target derived from desk + priority |
| G3 | The right person gets it, fast | Median time-to-assignment under 5 minutes; ≥70% assigned without human triage |
| G4 | Context is already there | ≥80% of customer tickets auto-link to the order/invoice/product they concern |
| G5 | The system reports its own problems | ERP exception events raise tickets with zero human action |
| G6 | One desk covers every area | ≥5 distinct desks live on one engine with no code branches per desk |
| G7 | Answers get reused | ≥25% of resolved tickets link to a knowledge article; deflection measurable |

## 1.6 Benefits

**For the business** — a measurable service promise; visibility into where operational pain
actually is (which product, which branch, which supplier); evidence for disputes; a
defensible audit trail.

**For customers** — one place to ask, a reference number, visible status, and an answer that
already knows their order history.

**For employees** — requests that do not disappear into a manager's inbox, with a visible
queue position and an SLA.

**For agents** — one screen with the ticket, the customer, their history, the linked business
record, and the knowledge to answer — instead of five browser tabs.

**For Rutba as a product** — a service desk is table stakes for enterprise SME ERP buyers and
a strong differentiator against the point-solution ERPs in the Pakistani SME market. It also
creates the substrate for the AI copilot on the roadmap: tickets are the highest-value
training and grounding corpus a tenant produces.

## 1.7 Business problems solved

| Problem today | How Helpdesk solves it |
|---|---|
| Storefront contact form submits into a void — no thread, only the newest reply is retained | A real threaded conversation with full history |
| Employee IT/HR requests live in two near-duplicate pages with no queue, no SLA, no assignment | One queue, owned, measured |
| `assigned_to` exists but nothing ever sets it | First-class assignment with routing rules and audit |
| SLA is a client-side honour system a caller may simply not invoke | Server-side sweep against configured targets |
| No link between a complaint and the order it is about | Generic subject link to any ERP entity |
| Operational exceptions are noticed by whoever happens to look | Events raise tickets automatically |
| Managers cannot answer "how are we doing?" | Dashboards and reports over real timestamps |

## 1.8 Success metrics

| Metric | Definition | Target (12 months post-launch) |
|---|---|---|
| First Response Time (FRT) | `first_response_at − created_at`, business hours | Median ≤ 2h; ≥90% within SLA |
| Resolution Time | `resolved_at − created_at`, business hours | Median ≤ 24h; ≥85% within SLA |
| SLA compliance | Tickets resolved within target ÷ total | ≥ 90% |
| Auto-assignment rate | Tickets assigned by rules ÷ total | ≥ 70% |
| Reopen rate | Reopened ÷ resolved | ≤ 8% |
| CSAT | Mean rating on resolved tickets | ≥ 4.2 / 5 |
| Self-service deflection | KB views resolving without a ticket | ≥ 20% of portal sessions |
| Agent load balance | Std. deviation of open tickets per agent | Within 25% of mean |
| Channel coverage | Sources producing tickets | ≥ 4 live channels |
| Event-raised tickets | Tickets created by Core events | ≥ 10% of internal volume |

## 1.9 Non-goals

- Not a project-management tool. Tickets are requests with an SLA, not sprints or epics.
- Not a CRM replacement. `rutba-crm` owns leads, contacts and the relationship timeline;
  Helpdesk *feeds* it.
- Not a chat product. Real-time chat may be a future *source*, not the system of record.
- Not a document management system. Attachments only.
- Not a general workflow builder for the whole ERP. It *consumes* the shared workflow engine.
- Not a second identity system. Users, roles and claims stay with api-pro.

## 1.10 Future vision

Beyond the initial build (detailed in [40 Future Roadmap](40-future-roadmap.md)): an AI copilot
that drafts replies grounded in the tenant's own resolved tickets and knowledge base;
predictive SLA warning before breach rather than after; cross-module intelligence that spots
"twelve tickets this week all name the same product batch" and raises a quality investigation;
and remote support so an IT agent resolves a device fault inside the ticket that reported it.

---

## Acceptance criteria for this section

- [ ] Scope table reviewed and each in-scope area has a named business owner.
- [ ] Success metric targets agreed, with the measurement source identified for each.
- [ ] Non-goals confirmed — particularly that `order-message` is not being absorbed.
- [ ] Desk list for launch agreed (which of the seven go live first).
