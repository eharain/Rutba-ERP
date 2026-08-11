# 02 — Business Requirements

[← 01 Vision](01-vision-and-objectives.md) · [Index](00-index.md) · Next: [03 Functional Requirements](03-functional-requirements.md)

---

## 2.1 Purpose

What the business expects the Helpdesk to do, expressed as testable requirements. Each carries
an ID used throughout the spec set for traceability. `BR-*` business, `NFR-*` non-functional,
`RULE-*` invariant.

---

## 2.2 Functional business requirements

### Customer support

| ID | Requirement | Priority |
|---|---|---|
| BR-C1 | A customer can raise a ticket from the storefront, the customer portal, or by email, without an account for the storefront form | Must |
| BR-C2 | Every customer ticket returns a human-quotable reference number immediately | Must |
| BR-C3 | A customer can see the full conversation history of their own tickets and reply to it | Must |
| BR-C4 | A customer can raise a ticket *about a specific order* from their order history, with the order pre-linked | Must |
| BR-C5 | A customer never sees internal notes, agent identities beyond a display name, or other customers' data | Must |
| BR-C6 | A customer can reopen a resolved ticket within a configurable window | Should |
| BR-C7 | A customer is asked for a satisfaction rating when a ticket resolves | Should |
| BR-C8 | Marketplace-origin customers (Daraz etc.) raise tickets that carry their channel identity | Could |

### Employee support

| ID | Requirement | Priority |
|---|---|---|
| BR-E1 | An employee can raise an IT, HR, facilities, payroll or maintenance request from ESS | Must |
| BR-E2 | An employee sees their own request history and status without seeing colleagues' requests | Must |
| BR-E3 | A line manager sees requests raised by their direct reports where the desk grants it | Must |
| BR-E4 | An employee request can require approval before work starts | Must |
| BR-E5 | An employee can attach evidence (photo of a broken device, a document) | Must |
| BR-E6 | Existing ESS/HR ticket pages keep working through the transition with no data loss | Must |

### Internal requests / service catalog

| ID | Requirement | Priority |
|---|---|---|
| BR-I1 | The business can define request types with their own form, approver and SLA, without a code release | Must |
| BR-I2 | A catalog request captures structured field values, not just free text | Must |
| BR-I3 | A catalog request can route to a different desk than the requester's own | Should |
| BR-I4 | Catalog items can be restricted to specific roles, branches or departments | Should |

### IT support

| ID | Requirement | Priority |
|---|---|---|
| BR-T1 | An IT ticket can link to the device/asset it concerns | Must |
| BR-T2 | An agent can see the requester's assigned devices when triaging | Should |
| BR-T3 | An agent can initiate a consented remote session from the ticket | Could (see remote-support epic) |

### Store / branch support

| ID | Requirement | Priority |
|---|---|---|
| BR-S1 | Branch staff can raise tickets scoped to their branch | Must |
| BR-S2 | Tickets can be queued and reported per branch | Must |
| BR-S3 | A branch manager sees their branch's tickets and no other branch's | Must |

### Supplier support

| ID | Requirement | Priority |
|---|---|---|
| BR-P1 | A ticket can name a supplier as the requester or the subject | Should |
| BR-P2 | A ticket can link to a purchase order or GRN | Should |
| BR-P3 | Supplier-facing communication is separable from internal discussion | Must |

### System-generated

| ID | Requirement | Priority |
|---|---|---|
| BR-Y1 | A Core domain event can create a ticket without human action | Must |
| BR-Y2 | Event-raised tickets deduplicate — one open ticket per (rule, subject), not one per event | Must |
| BR-Y3 | Event-raised tickets carry the originating event and payload for diagnosis | Must |
| BR-Y4 | An event can also *update* or *resolve* an existing ticket (the condition cleared) | Should |

### Cross-cutting

| ID | Requirement | Priority |
|---|---|---|
| BR-X1 | Every ticket belongs to exactly one desk and has exactly one current owner (or is explicitly unassigned) | Must |
| BR-X2 | Every ticket has a measurable first-response and resolution target | Must |
| BR-X3 | Every state change, assignment, reply and field edit is audited with actor and timestamp | Must |
| BR-X4 | The desk works in a business calendar — SLA clocks do not run outside working hours or on holidays | Must |
| BR-X5 | A ticket can be linked to any ERP entity as its subject | Must |
| BR-X6 | Tickets can be merged (duplicates) and split (a request that is really three) | Should |
| BR-X7 | The system supports at least Urdu and English in requester-facing text | Should |

---

## 2.3 Non-functional requirements

| ID | Requirement | Target | Detail |
|---|---|---|---|
| NFR-1 | **Scalability** | 500k tickets/tenant; 200 concurrent agents | [35 Performance](35-performance-requirements.md) |
| NFR-2 | **Availability** | 99.5% for agent surfaces; intake must degrade gracefully — a failed desk must still accept a ticket | |
| NFR-3 | **Performance** | Queue list p95 < 800ms; ticket detail p95 < 1s; search p95 < 1.5s | |
| NFR-4 | **Security** | Least privilege, encrypted transport, no cross-tenant or cross-requester leakage | [36 Security](36-security-requirements.md) |
| NFR-5 | **Auditability** | Every mutation attributable to an actor; audit rows immutable | [30 Audit](30-audit-logging.md) |
| NFR-6 | **Extensibility** | A new desk, status, priority, catalog item, SLA policy or automation rule requires configuration only | [32 Configuration](32-configuration.md) |
| NFR-7 | **Data retention** | Configurable per tenant; deletion must be defensible and logged | |
| NFR-8 | **Observability** | Queue depth, SLA breach rate, event-bus lag and automation failures exposed as metrics | |
| NFR-9 | **Localisation** | All requester-facing strings translatable; dates and numbers locale-aware; RTL-safe layout for Urdu | [38 UI/UX](38-ui-ux-specifications.md) |
| NFR-10 | **Backward compatibility** | Existing `contact-ticket` routes keep their contract for at least two releases after the new API ships | |

---

## 2.4 Business rules (invariants)

These hold everywhere — service layer, API, automation, AI and import. Violating one is a bug,
not a configuration choice.

| ID | Rule | Enforced where |
|---|---|---|
| RULE-1 | A ticket belongs to exactly one desk at any time | `TicketService`, DB not-null |
| RULE-2 | A ticket has at most one assignee; reassignment is a recorded transfer, not an edit | `TicketService.assign` + audit |
| RULE-3 | A ticket's status is always one of the canonical statuses; a workflow stage must map to one | Workflow engine `maps_to_status` |
| RULE-4 | Every status change is a *transition* validated by the workflow, never a field write | `TicketService.transition` only |
| RULE-5 | Closed tickets are immutable except: reopen, add internal note, attach audit | `TicketService` guard |
| RULE-6 | Resolution requires a resolution note when the desk demands one | Desk config + validation |
| RULE-7 | Every SLA target is measurable — a desk cannot be saved without first-response and resolution targets | Desk validation |
| RULE-8 | SLA clocks run only in the applicable business calendar | `SLAService` |
| RULE-9 | The SLA sweep flags; it never auto-transitions, auto-resolves or auto-approves | Sweep implementation |
| RULE-10 | Internal notes are never visible to requesters, in any surface, including search, email and export | Thread read model |
| RULE-11 | A requester can only ever read tickets they raised or are explicitly a participant in | `PortalService` authorisation |
| RULE-12 | Every mutation writes an audit row; audit rows are append-only and never editable or deletable by any role | Audit service |
| RULE-13 | Deleting a ticket is not supported — only cancel and archive | No delete endpoint |
| RULE-14 | Merging preserves both conversations and both references; the merged-away ticket becomes a redirect, not a deletion | `TicketService.merge` |
| RULE-15 | Automation cannot escalate its own privileges — a rule executes with a defined system identity, subject to permission checks and audited as automation | `AutomationService` |
| RULE-16 | An event-raised ticket must be idempotent on (rule key, subject) while an open ticket exists | Event handler dedupe key |
| RULE-17 | A ticket cannot be its own parent, and merge/link graphs cannot cycle | Validation |
| RULE-18 | Reopening a resolved ticket restarts the resolution clock but preserves the original first-response measurement | `SLAService` |

---

## 2.5 Assumptions

1. Rutba Core is the runtime; pos-strapi continues to serve unported legacy routes during the
   strangler migration and remains the JWT issuer until Phase 7 of the Core program.
2. Users, roles, claims and app access remain owned by api-pro; Helpdesk defines no identities.
3. The `person` contact-unification graph is the canonical "who is this human" resolver.
4. Business calendars and holidays exist as HR reference data and are reusable by SLA.
5. Email sending is available via Rutba-MTA; inbound email ingestion is *not* yet proven and
   is treated as a dependency, not an assumption.

## 2.6 Dependencies

| Dependency | Owner | Risk if unmet |
|---|---|---|
| Core event bus (P1) | Core platform | No cross-module ticket creation; §13 and §28 degrade to polling |
| Workflow service promotion (P2) | Core platform | Lifecycle stays pos-strapi-coupled |
| Core-owned migrations (P7) | Core platform | New tables must go through pos-strapi `schema.json` |
| Business calendar data | HR | SLA cannot honour working hours (RULE-8) |
| Rutba-MTA inbound | Infra | Email channel drops from launch scope |
| WhatsApp Business API | Roadmap H1 | WhatsApp channel slips |
| `rutba-helpdesk` app registration (:4023) | This program | No agent surface |

---

## Acceptance criteria for this section

- [ ] Every `Must` requirement has at least one acceptance test in its owning section.
- [ ] Every `RULE-*` has a named enforcement point in code, not just in this document.
- [ ] Dependency owners confirmed and P1/P7 scheduled before W1 starts.
- [ ] Retention and localisation targets confirmed with the business.
