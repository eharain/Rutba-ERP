# 10 — Service Catalog

[← 09 Ticket Workflows](09-ticket-workflows.md) · [Index](00-index.md) · Next: [11 Knowledge Base](11-knowledge-base.md)

---

## 10.1 Purpose

Turn "email someone and hope" into structured, routed, approved, measurable requests. The
catalog is the difference between a **ticket system** and a **service desk**.

## 10.2 Description

A catalog item is a **request type** that bundles: a form, a target desk, a workflow, an SLA, an
approval chain, and visibility rules. The requester picks *what they want*; the system knows
where it goes, who approves it and how fast it must happen.

Catalog items are configuration (BR-I1) — a new request type never requires a release.

## 10.3 Launch catalog

| Item | Desk | Approval | Default SLA |
|---|---|---|---|
| Password reset | IT | None | 2h |
| New equipment request | IT | Line manager → IT manager | 3 days |
| Software access request | IT | Line manager → system owner | 1 day |
| Device fault | IT | None | 4h |
| Leave request | HR | Line manager | 1 day |
| Salary certificate / letter | HR | HR manager | 2 days |
| Payroll query | HR | None | 1 day |
| Onboarding request | HR | Line manager | 5 days |
| Facilities / maintenance | Facilities | None | 1 day |
| Transport request | Facilities | Line manager | 1 day |
| Refund request | Customer Support | Finance → manager (threshold) | 2 days |
| Order issue / complaint | Customer Support | None | 4h |
| Return / RMA | Warranty/RMA | Manager if out of policy | 2 days |
| Price change request | Customer Support | Manager | 1 day |
| Product creation request | Customer Support | Manager | 2 days |
| Supplier registration | Customer Support | Purchasing manager | 3 days |
| Branch / POS support | Field Service | None | 2h |

> **Leave request is deliberately listed.** HR already has a dedicated leave module with its own
> state machine. The catalog item is a **front door** that creates the HR leave request and links
> it — it does not reimplement leave. Where a domain module already owns a process, the catalog
> routes to it. This rule prevents the catalog from slowly absorbing the ERP.

## 10.4 Data model

See [07 §7.6](07-data-model.md#76-supporting-entities). Two entities:

**`ServiceCatalogItem`** — `key`, `name`, `description`, `icon`, `category`, `desk`, `workflow`
(overrides desk's), `sla_policy` (overrides desk's), `approval_chain` (json),
`visibility_roles`, `visibility_branches`, `requester_kinds`, `is_active`, `sequence`,
`creates_entity` (optional UID for front-door items), `default_priority`, `kb_article`.

**`CatalogField`** — `key`, `label`, `type`, `required`, `options`, `validation`, `sequence`,
`help_text`, `conditional_on`, `maps_to` (optional ticket field it populates).

### Field types

`text` · `textarea` · `number` · `date` · `datetime` · `select` · `multiselect` · `boolean` ·
`user` (person/employee picker) · `entity` (any Core entity picker, sets the subject link) ·
`file` · `currency` · `branch` · `department`.

**Never hardcode option lists in the frontend** — `select` options come from either static
configured options or an `/enums/:name/:field` reference, per the standing convention.

## 10.5 Request flow

1. Requester opens the catalog, filtered to items they may see.
2. Picks an item. Suggested KB articles appear first — **deflection before submission**, which
   is the cheapest ticket the desk will ever handle.
3. Dynamic form renders from `CatalogField` rows, with conditional fields.
4. Submit → validate → create ticket with `catalog_item`, `custom_fields`, desk, workflow, SLA
   and priority resolved from the item.
5. If the item declares an approval chain, the ticket enters `pending_approval` and approvers are
   notified.
6. On full approval, the ticket returns to `working` and routing runs.
7. If `creates_entity` is set, the front-door entity (e.g. an HR leave request) is created and
   linked as the subject.

## 10.6 Validation

- Server-side validation mirrors every client rule — the form is a convenience, not the gate.
- `required` fields enforced at the service layer; the API rejects a partial `custom_fields`
  payload with per-field detail.
- Field-level `validation` supports regex, min/max, and length.
- Unknown keys in `custom_fields` are rejected, not silently stored — otherwise the payload
  becomes an untyped dumping ground within a release or two.
- Changing an item's fields does **not** retroactively invalidate submitted tickets; historical
  `custom_fields` render against the item version they were submitted under.

## 10.7 Versioning

Catalog items are versioned like workflows: a submitted ticket pins `catalog_item_version` so a
form change never rewrites history or breaks the detail view of an old request.

## 10.8 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/catalog` | Items visible to the caller, grouped by category |
| GET | `/api/helpdesk/catalog/:documentId` | Item + its fields (current version) |
| POST | `/api/helpdesk/catalog/:documentId/submit` | Create a ticket from the item |
| GET | `/api/helpdesk/catalog/admin` | All items including inactive (admin) |
| POST/PATCH | `/api/helpdesk/catalog` | Create / update an item (admin) |
| POST | `/api/helpdesk/catalog/:documentId/publish` | Publish a draft version |

## 10.9 Events

`helpdesk.catalog.submitted` · `helpdesk.catalog.item.published` · `helpdesk.catalog.item.deactivated`.

## 10.10 Permissions

`helpdesk.catalog.read` (all authenticated, filtered by visibility) ·
`helpdesk.catalog.submit` · `helpdesk.catalog.configure` (admin) ·
`helpdesk.catalog.publish` (admin).

## 10.11 UI

**Requester view** — card grid grouped by category, search, recently used, and a "popular
requests" row. Each card: icon, name, one-line description, typical turnaround (from the SLA,
expressed as "usually within 2 hours" rather than a raw target).

**Builder (admin)** — item metadata, drag-and-drop field builder with live preview, approval
chain editor, visibility rules, and a **test submit** that runs the full validation and routing
path against a dry-run flag without creating a ticket.

## 10.12 Reports & KPIs

Volume by item; approval cycle time by item and approver; rejection rate; abandonment rate
(form opened, not submitted — a strong signal that a form is too long); deflection rate (KB
article opened from the item, no ticket raised); SLA compliance by item.

---

## Acceptance criteria for this section

- [ ] A new request type ships with zero code changes.
- [ ] Server-side validation rejects everything the client would, proven by direct API tests.
- [ ] Unknown `custom_fields` keys are rejected.
- [ ] Historical tickets render against their pinned item version after the item changes.
- [ ] Front-door items create and link the domain entity rather than duplicating its process.
- [ ] Visibility rules verified: a restricted item is invisible and un-submittable to
      unauthorised requesters (both, not just the first).
