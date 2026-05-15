# Contact-entity unification

## Problem

The Strapi schema has at least **nine** entities that each store a contact
shape (some subset of `name + email + phone + address`). They were grown
independently — each domain (sale, CRM, HR, delivery, accounts, anonymous
checkout) added its own fields when it needed them. Now:

- The same human appears as multiple disconnected rows. A walk-in customer who
  later opens a CRM ticket is a `customer` + `crm-contact` + maybe a UP `user`
  + a `contact-ticket.user` — none linked.
- Field naming drifts (`phone` vs `phone_number`; `name` vs `full_name` vs
  `contact_person`; `address` as `string` vs `text`).
- Storefront order capture writes contact data into a **component** embedded
  on `sale-order` (`order.order-contact`), so it never becomes a row anyone
  can look up.
- Two employee tables (`employee` legacy + `hr-employee` current) coexist;
  `sale.employee` still points at the legacy one.
- `crm-lead` duplicates name/email/phone/company on the lead itself instead of
  reusing the linked `crm-contact`.

The result is no single answer to "who is this person?" and downstream pain
on deduplication, notifications, RBAC ownership, and reporting.

## Inventory

### Standalone collection types that carry contact fields

| UID | Fields stored | Notes |
| --- | --- | --- |
| `api::customer.customer` | `name`, `phone`, `email`, `address`, `picture`, → sales | Used by POS & invoices. No relation to UP user. |
| `api::crm-contact.crm-contact` | `name`, `email`, `phone`, `company`, `address`, `notes`, → leads/activities, `owners` | Used by CRM. No relation to `customer` or UP user. |
| `api::supplier.supplier` | `name`, `contact_person`, `phone`, `email`, `address`, logo/gallery, → purchases/products | Stores a single contact inline. |
| `api::hr-employee.hr-employee` | `name`, `email`, `phone`, `address`, → user (1-1), department, teams, attendances, leave_requests | Modern. UP-user-linked. |
| `api::employee.employee` (**legacy**) | `name`, `role`, `phone`, `email`, `picture` | Only `api::sale.sale.employee` still references it. Otherwise dead. |
| `api::rider.rider` | `full_name`, `phone`, → user (1-1), zones, deliveries | UP-user-linked. Different name field (`full_name`). |
| `api::customer-address.customer-address` | `label`, `name`, `email`, `phone_number`, `address`, `city`, `state`, `country`, `zip_code`, `is_default`, → user | One row per saved address; multi-row per user. Naming: `phone_number` ✗ vs `phone` ✓. |
| `api::contact-ticket.contact-ticket` | `subject`, `message`, `status`, → user, → assigned_to | No name/phone/email of its own — relies on the UP user link. |
| `api::crm-lead.crm-lead` | `name`, `email`, `phone`, `company`, → contact, → customer, `owners` | **Contact fields duplicated even though `contact` and `customer` relations exist.** |

### Embedded contact data (no row exists for the person)

| Where | Component / fields |
| --- | --- |
| `api::sale-order.sale-order.customer_contact` | `order.order-contact` component — `name`, `phone_number`, `email`, `address`, `state`, `city`, `zip_code`, `country`. Storefront checkout writes here, no `customer` row is created. |

### Branch / venue-level contact (organization, not person)

`api::branch.branch` carries `companyName`, `name`, `email`, `phone`,
`watsapp`, `address`, `town`, `city`, plus `youtube/tiktok/instagram/twitter`,
and `api::cms-footer.cms-footer` carries another `phone/email/address` for the
public site. **Leave these out of unification** — they describe the
*business's* contact details, not a person's, and have different lifecycle and
ownership rules. They get one comment in this plan and nothing more.

## Goal

One canonical "person" record per real human. Every domain that has a
business relationship with that person attaches a *role row* pointing at it —
not a copy of name/phone/email.

```
person                         ← single row per human (the contact identity)
├── customer_profile           ← retail buyer (sales, invoices)
├── crm_contact_profile        ← CRM target (leads, activities)
├── supplier_contact_profile   ← named contact on a supplier
├── employee_profile           ← HR record (rename hr-employee)
├── rider_profile              ← delivery operative
├── ticket_thread              ← contact-ticket conversation
└── addresses[]                ← multi-row, replaces customer-address
```

Field convention everywhere:

- `display_name` (single canonical field — no `full_name`/`name`/
  `contact_person` divergence)
- `email`
- `phone` (single field — drop `phone_number`)
- One optional FK `user` to UP user (for anyone with a login)
- Address goes in a related `address` row, never inline

## Proposed schema

### New: `api::person.person`

```jsonc
{
  "kind": "collectionType",
  "collectionName": "persons",
  "info": { "singularName": "person", "pluralName": "persons", "displayName": "Person" },
  "options": { "draftAndPublish": false },
  "attributes": {
    "display_name": { "type": "string", "required": true },
    "email":        { "type": "string" },
    "phone":        { "type": "string" },
    "picture":      { "type": "media" },
    "notes":        { "type": "text" },
    "merged_into":  { "type": "relation", "relation": "manyToOne", "target": "api::person.person" },
    "user":         { "type": "relation", "relation": "oneToOne", "target": "plugin::users-permissions.user" },
    "addresses":    { "type": "relation", "relation": "oneToMany", "target": "api::address.address", "mappedBy": "person" },
    "owners":       { "type": "relation", "relation": "manyToMany", "target": "plugin::users-permissions.user" }
  }
}
```

`merged_into` carries soft-delete-on-merge — duplicates point at their
survivor; queries follow the chain.

### New: `api::address.address` (replaces `customer-address`)

```jsonc
{
  "attributes": {
    "label":     { "type": "string" },             // "Home", "Office"
    "line1":     { "type": "string", "required": true },
    "line2":     { "type": "string" },
    "city":      { "type": "string" },
    "state":     { "type": "string" },
    "country":   { "type": "string" },
    "zip_code":  { "type": "string" },
    "is_default":{ "type": "boolean", "default": false },
    "archived_at":{ "type": "datetime" },
    "person":    { "type": "relation", "relation": "manyToOne", "target": "api::person.person", "inversedBy": "addresses" }
  }
}
```

Note `name`/`email`/`phone` are **dropped from address** — they belong on
`person`. If a delivery needs a different recipient for one address, that
becomes a separate `person` row with `merged_into = null` and an own address
(rare case).

### Domain profiles — thin role rows pointing at a `person`

Each existing per-domain content type loses its contact fields and gains a
`person` relation. The rest of the fields (status, totals, relations to other
entities) stay.

| Existing UID | After |
| --- | --- |
| `api::customer.customer` | drop `name/phone/email/address`; add `person` (manyToOne). Retain `sales`, `picture` if domain-specific. |
| `api::crm-contact.crm-contact` | drop `name/email/phone/address`; add `person`. Keep `company`, `notes`, `leads`, `activities`, `owners`. |
| `api::hr-employee.hr-employee` | drop `name/email/phone/address`; add `person`. Keep `designation`, `date_of_joining`, `status`, `department`, `teams`, `attendances`, `leave_requests`, `salary_structure`. Rename collection to `employees` (after legacy purge below). |
| `api::rider.rider` | drop `full_name/phone`; add `person`. Keep `vehicle_type`, `license_number`, `profile_picture`, `status`, `max_concurrent_deliveries`, `rating`, `assigned_zones`, `delivery_offers`. |
| `api::supplier.supplier` | drop `contact_person/phone/email/address`; keep `name` as **company name**. Add `primary_contact` (manyToOne → person) plus `contacts` (manyToMany → person) for additional reps. |
| `api::contact-ticket.contact-ticket` | already only has relations — add `person` alongside `user` (for tickets opened by non-users). |
| `api::crm-lead.crm-lead` | drop `name/email/phone/company`; keep `source`, `status`, `value`, `assigned_to`, `notes`. Drive name display through the linked `contact.person`. |
| `api::sale-order.sale-order.customer_contact` (component) | remove component. Replace with `customer_person` (manyToOne → person) + `delivery_address` (manyToOne → address). |

### Delete

- `api::employee.employee` — already orphaned except for `sale.employee`.
  Migration step below.
- `components.order.order-contact` — replaced by relations on `sale-order`.

## Migration plan

Two-phase rollout so we never break the live API:

### Phase 1 — add the new structures, mirror writes

1. Create `api::person.person` and `api::address.address` content-types and
   migrations (FK indexes on `email`, `phone`, `user_id` for dedup queries).
2. Add the new relation fields (`person`, `primary_contact`, etc.) **alongside**
   the existing scalar fields on every affected content-type. Both shapes
   coexist.
3. Backfill script: walk every existing row, upsert a `person` (dedup on
   `email`/`phone`/`user_id`), and set the FK. Run idempotently — re-running
   only fills nulls. Track conflicts in a `person_dedup_audit` table for
   manual review.
4. Update controllers / services that *write* contact data (storefront
   checkout, CRM lead create, customer create, supplier create, HR onboarding,
   contact-ticket submission) to write the `person` first and link, in
   addition to the legacy scalar fields. This is the "dual-write" window.
5. Update the api-provider descriptors to expose `person`-shaped includes
   while still emitting the legacy shape for backwards compatibility.
6. Frontend reads stay on the legacy shape — no UI changes yet.

### Phase 2 — cut over and remove the duplication

1. Migrate read paths app-by-app to consume `person` (`sale-orders` →
   `customer_person`, `crm-leads` → `contact.person`, etc.). Verify each app
   against the test plan in [../pre-deployment-test-plan.md](../pre-deployment-test-plan.md)
   Tier 2.
2. Remove the duplicated scalar fields from each schema. One PR per
   content-type. Each PR ships its own column-drop migration plus the
   matching frontend changes.
3. Remove `components.order.order-contact`, drop the joining columns from
   `orders`.
4. Delete `api::employee.employee` entirely after porting `api::sale.sale.employee`
   to `api::hr-employee.hr-employee`.
5. Replace `api::customer-address.customer-address` with `api::address.address`
   and migrate rows (1-1; field rename `phone_number → phone` happens earlier
   when the row is folded into `person`).

### Phase 3 — dedup tooling (optional, do this after deploy)

- Admin page: "Merge persons" UI. Pick two rows, choose which fields survive,
  set `merged_into` on the loser, rewire FKs.
- Background job: nightly scan for likely duplicates by email or phone hash,
  write candidates to `person_dedup_audit` for human review.
- Read-side guard: every `person` lookup follows `merged_into` so stale FKs
  still resolve to the survivor.

## Naming + field hygiene checklist (one-time cleanups bundled into Phase 1)

- [ ] `phone_number` → `phone` everywhere (customer-address, order-contact
      component).
- [ ] `full_name` → `display_name` (rider).
- [ ] `contact_person` (supplier) → relation `primary_contact`.
- [ ] `name` on contact-bearing types → `display_name`.
- [ ] Address always relational, never inline.
- [ ] `address` type unified to `text` (some are `string`).

## Out of scope

- `api::branch.branch` and `api::cms-footer.cms-footer` contact fields. These
  describe the **business**, not a person; they belong with site/tenant
  settings (see [site-settings-multi-tenant.md](./site-settings-multi-tenant.md)).
- UP `user` is not collapsed into `person`. UP is the auth identity (email +
  password + role); `person` is the contact identity. They link 1-1 when the
  human has both.

## Risks

- **Backfill collisions.** Two `customer` rows with the same phone may be the
  same human or different humans — picking the wrong key splits or merges
  incorrectly. Mitigate: write candidates to `person_dedup_audit` and require
  manual confirmation for any merge that changes a row's owner or balance.
- **Performance.** Lookups on `customer.name` / `supplier.name` are common —
  every list page now needs `populate: { person: true }`. Confirm Strapi 5
  populate cost on the high-traffic list endpoints before rollout (Tier 5
  perf sanity in the test plan).
- **api-pro descriptors.** Each `meta.uid` in api-provider whose shape changes
  needs a co-released descriptor update; missing one will silently 404 a
  storefront call. Track in the api-provider PR.
- **Storefront anonymous checkout.** The component path is currently the only
  way an anonymous shopper gets recorded. The dual-write window must create a
  `person` row even when no `customer` is created — otherwise we lose
  anonymous order history altogether.

## Acceptance

Phase complete when:

- A single SQL query `SELECT id, display_name, email, phone FROM persons
  WHERE id = ?` answers "who is this" for any FK across the system.
- No content-type other than `person` and `address` stores `name`/`email`/
  `phone`/`address` directly.
- A merge in the admin UI rewires every FK and old IDs continue to resolve.
- Tier 2 smoke flows (pos-sale, rutba-cms, rutba-crm, rutba-hr,
  rutba-order-management, rutba-rider, rutba-web checkout) all pass against
  the migrated schema.
