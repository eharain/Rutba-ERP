# Contact-entity unification

> **Status (May 2026):** Phase 1A landed before rutba-web's first launch.
> `api::person.person`, `api::address.address`, and the `sale-order` rewire
> (`customer_person` / `delivery_address` / `delivery_snapshot`, no more
> `customer_contact` component) are live. Web checkout writes the new shape.
> See project_contact_unification_phase1a memory
> for the deviations from this plan that the PR made (kept `name` instead of
> `display_name`, kept `delivery_snapshot` forever, etc.). Phase 1B onward
> below is still future work.

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

- A single SQL query `SELECT id, name, email, phone FROM persons
  WHERE id = ?` answers "who is this" for any FK across the system.
- No content-type other than `person` and `address` stores `name`/`email`/
  `phone`/`address` directly.
- A merge in the admin UI rewires every FK and old IDs continue to resolve.
- Tier 2 smoke flows (pos-sale, rutba-cms, rutba-crm, rutba-hr,
  rutba-order-management, rutba-rider, rutba-web checkout) all pass against
  the migrated schema.

---

# Follow-up roadmap (post-Phase 1A)

Phase 1A shipped `person`, `address`, and the `sale-order` rewire only — the
six other contact-bearing entities still carry inline contact fields. This
section is the authoritative todo for the remaining work, replacing the
original Phase 1/2/3 sections above (which were written before Phase 1A and
encode some decisions that were revised — see project_contact_unification_phase1a memory).

Each phase below is one PR. Order matters — Phase 1B (customer) first because
it has actual production data; Phase 1C entities can land in any order; Phase
2 only when 1B + the relevant 1C entity are stable; Phase 3 is optional and
unblocking.

## Dedup audit table — prerequisite

**✓ Landed.** Content type `api::person-dedup-audit.person-dedup-audit` exists with the schema below. No callers yet; Phase 1B/1C seeds will write to it.

**New content type `api::person-dedup-audit.person-dedup-audit`:**

| field | type | notes |
| --- | --- | --- |
| `source_uid` | string | e.g. `api::customer.customer` |
| `source_document_id` | string | the row that triggered the audit |
| `match_kind` | enum: `multi_match`, `user_collision`, `name_only`, `manual_hold` | why human review is needed |
| `candidate_person_ids` | json (array of int) | persons that matched |
| `proposed_action` | enum: `link`, `create_new`, `skip` | what the migration was about to do |
| `resolved_at` | datetime | null = unresolved |
| `resolution` | enum: `linked`, `new`, `merged`, `dismissed` | what the human chose |
| `notes` | text | reviewer comments |

Files:
- `pos-strapi/src/api/person-dedup-audit/content-types/person-dedup-audit/schema.json`
- `pos-strapi/src/api/person-dedup-audit/controllers/person-dedup-audit.js` — core controller, admin-only
- `pos-strapi/src/api/person-dedup-audit/routes/person-dedup-audit.js` — standard CRUD

Effort: 1 hour.

## Phase 1B — Customer (POS data)

**Why first:** the only entity in this list with real production data today.
Everything else (crm-contact, hr-employee, rider, supplier) either has trivial
row counts or is in-house data we can recreate.

### Schema change

Add to `pos-strapi/src/api/customer/content-types/customer/schema.json`:

```json
"person": {
  "type": "relation",
  "relation": "manyToOne",
  "target": "api::person.person"
}
```

Keep `name`, `phone`, `email`, `address`, `picture` for now — they get dropped in Phase 2 once readers have cut over.

### Backfill seed

New file: `pos-strapi/src/seed/person-backfill-customer-seed.js`

Algorithm (idempotent; safe to re-run):
1. Find customers where `person` FK is null. Paginate, batch size 50.
2. For each customer:
   - Build match candidates:
     ```js
     const candidates = await strapi.documents('api::person.person').findMany({
       filters: { $or: [
         customer.email ? { email: { $eq: customer.email.trim().toLowerCase() } } : null,
         customer.phone ? { phone: { $eq: customer.phone.trim() } } : null,
       ].filter(Boolean) },
     });
     ```
   - **0 candidates** → create person `{ name: customer.name, email, phone }`,
     link `customer.person`.
   - **1 candidate** → require BOTH email and phone to match for auto-link.
     If only one matches → write `match_kind: name_only` to the audit table,
     skip the link.
     If both match → link, and backfill any null fields on the person from
     the customer.
   - **2+ candidates** → write `match_kind: multi_match` to audit table, skip.
   - If both top candidates have non-null `user` FKs → write
     `match_kind: user_collision` regardless of email/phone overlap.
3. Log a summary at the end: `linked: N, created: N, audited: N`.

Run wiring: register in `src/index.js` bootstrap alongside `seedApiProvider`.
Gate behind a `RUTBA_RUN_PERSON_BACKFILL=1` env var so it doesn't run on every
dev restart; flip on once per environment.

Fingerprint checkpoint: write `{ last_customer_max_id, last_customer_count, last_run_at }`
to `strapi.store({ type: 'plugin', name: 'rutba', key: 'person-backfill-customer' })`.
Skip the seed if no customer rows have been added since `last_customer_max_id`
and the count matches.

### Controller dual-write

`pos-strapi/src/api/customer/controllers/customer.js` — wrap `create` and
`update` so writes mirror to person:

- On `create`: if email or phone is set, do the same find-or-create dance as
  the seed (with audit fallback). Link `data.person = { id: personRow.id }`
  before passing to the core controller.
- On `update`: if email or phone changed, **don't** re-merge — log a warning
  if the new email/phone matches a different person. Manual merge via Phase 3
  UI handles that case.

### Dry-run mode

Add a `--dry-run` flag (`RUTBA_PERSON_BACKFILL_DRY_RUN=1`) that:
- Builds the full match plan.
- Writes a `_person_backfill_dryrun_YYYY-MM-DD.json` file with `[{ customer_id, action, person_id?, audit_reason? }]`.
- Doesn't touch the DB.

Run this against a prod-data snapshot before flipping the real env var on.

### Acceptance
- Every customer with a populated email or phone has a non-null `person` FK
  OR an entry in the audit table.
- Re-running the seed on a fully-linked dataset is a no-op (fingerprint hit).
- New POS sales create + link a person via the customer controller dual-write.
- Audit table never gets auto-resolved — humans only.
- No customer row was lost or had its name/email/phone modified.

### Risks
- **Two customers with the same email/phone** = the seed creates the first
  customer's person, then auto-links the second to it. If they're the same
  human (most common case), great. If they're different (shared phone, e.g.
  family), they get merged silently. Mitigation: spot-check the audit table
  after the first run; build a "suspected merges" report.
- **Customer email casing drift** — `Ali@x.com` vs `ali@x.com` create two
  persons. Normalize to lowercase on both the seed match query and the
  controller dual-write.

### Effort
1 day code + 0.5 day dry-run validation against a customer dump.

## Phase 1C — Other contact-bearing entities

Each entity below follows the same recipe as Phase 1B, simpler because the
row counts are small and the dedup risk is lower. Each one is its own PR.

### 1C.1 — crm-contact

- Add `person` FK on `api::crm-contact.crm-contact`.
- Backfill seed: dedup against persons by email/phone like customer.
  CRM contacts are the entity most likely to overlap with customers
  (same human bought retail AND is a CRM lead), so this seed will surface
  the most cross-domain matches.
- Controller dual-write on create/update.
- Keep `company`, `notes`, `address` for now (only contact fields fold into
  person; `company` is a CRM-specific attribute that stays).
- Effort: 0.5 day.

### 1C.2 — hr-employee

- Add `person` FK on `api::hr-employee.hr-employee`.
- The existing `user` 1-1 FK on hr-employee is the cleanest dedup key
  available — every employee has a UP login. Backfill: for each employee,
  `ensureForUser(employee.user)` to get the person and link.
- No audit table writes expected (1-1 via user is unambiguous).
- Controller dual-write on hr-employee create.
- Effort: 0.25 day.

### 1C.3 — rider

- Add `person` FK on `api::rider.rider`.
- Rider has both `user` 1-1 AND inline `full_name`/`phone`. Backfill via the
  `user` FK same as hr-employee.
- Rename: on read, prefer `person.name`. The legacy `full_name` field gets
  dropped in Phase 2.
- Update notification-service template var `rider_name` to source from
  `rider.person.name` first.
- Effort: 0.25 day.

### 1C.4 — supplier

- Supplier has `name` (company name — stays as-is, NOT a person), plus
  `contact_person`/`phone`/`email`/`address` (these go to a person).
- Add `primary_contact` (manyToOne → person) AND `contacts` (manyToMany →
  person) on `api::supplier.supplier`.
- Backfill: for each supplier with `contact_person` set, create a person
  `{ name: contact_person, phone, email }` and link as `primary_contact`.
  Suppliers without `contact_person` get no person link (company-only).
- Don't dedup against existing persons — supplier contacts are unlikely to be
  the same human as a customer, and false-positive merges in this direction
  would be embarrassing (a supplier rep getting linked to a retail customer).
- Effort: 0.5 day.

### 1C.5 — contact-ticket  ✓ Landed

- Added `person` (manyToOne → `api::person.person`) on the schema alongside
  the existing `user` FK.
- `submit` controller now resolves the person via `ensureForUser` and links
  it on the new ticket.
- Anonymous ticket submission (no UP login) still goes via `ensureUser` — if
  you later want public contact forms, change the route's `auth: false` and
  swap `ensureUser` for `createProvisional({ name, email, phone })`.

### 1C.6 — crm-lead

- `crm-lead` currently duplicates `name/email/phone/company` even though it
  links to a `crm-contact`. The fix is: stop writing those fields on the lead;
  read them via `lead.contact.person`.
- Backfill: for leads with a `contact` FK already set, no person work needed.
  For leads where the duplicate fields differ from the linked contact's,
  prefer the contact and log to audit table for human review.
- Controller change: `crm-lead.create` resolves person via the inbound contact
  fields, links via `contact.person`. The lead never carries person directly.
- Drop `name/email/phone` from the lead schema in Phase 2.
- Effort: 0.5 day.

## Phase 2 — Cutover and field drops

Only after every Phase 1C entity has been stable for ≥1 release cycle.

### 2.1 — Frontend read migration

App-by-app, switch list/detail pages to consume `person`-shaped data instead
of inline fields. Order by traffic — start with the hottest:

- `rutba-web` profile/orders — already done in Phase 1A.
- `rutba-cms` admin order list — switch from `customer_contact.name` to
  `customer_person.name`.
- `pos-sale` — customer search dropdown switches to populating `customer.person`.
- `rutba-crm` — list pages.
- `rutba-hr` — employee directory.
- `rutba-rider` mobile — driver app.
- `rutba-order-management` — dispatch console.

Each app gets a smoke test from `docs/pre-deployment-test-plan.md` Tier 2.

### 2.2 — Drop legacy contact fields

One PR per entity, after that entity's frontend has cut over:

- Drop `customer.name`, `customer.phone`, `customer.email`, `customer.address`.
  Keep `customer.picture` (domain-specific, not a person concept).
- Drop `crm-contact.name`, `crm-contact.email`, `crm-contact.phone`,
  `crm-contact.address`. Keep `company`, `notes`.
- Drop `hr-employee.name`, `email`, `phone`, `address`.
- Drop `rider.full_name`, `rider.phone`.
- Drop `supplier.contact_person`, `supplier.phone`, `supplier.email`,
  `supplier.address`.
- Drop `crm-lead.name`, `email`, `phone`, `company` (move company to lead
  metadata if still needed).

Each schema change ships a knex migration in `database/migrations/` that drops
the column. Test path: clean DB restore + re-seed + run the schema sync.

### 2.3 — Legacy `employee` purge (independent of contact unification)

- Update `api::sale.sale.employee` to target `api::hr-employee.hr-employee`.
- Write a migration that maps legacy `employee` rows to `hr-employee` rows
  (by name + email match). Sales pointing at the legacy row get re-pointed.
- Delete the `api::employee.employee` content type and its DB table.
- Was originally bundled into the unification plan; pulled out as its own PR
  during Phase 1A critical review — it has nothing to do with `person` and
  bundles risk.

### Acceptance
- No content type other than `person` and `address` stores `name`/`email`/
  `phone`/`address`.
- Every Tier 2 smoke flow passes.
- Database column count is N% smaller (track it — useful PR description).

## Phase 3 — Dedup tooling (optional)

Land when audit table starts piling up.

### 3.1 — Merge UI (rutba-crm, not Strapi admin)

The merge UI lives in **rutba-crm**, not as a Strapi admin plugin. CRM is
where humans already triage "who is this person" — sales reps, account
managers, support — and a CRM-side UI can show order history / lead
pipeline / ticket threads next to the merge decision in a way Strapi admin
can't. See project_crm_consolidates_contact_ui memory.

**Split of responsibility:**

- **rutba-crm builds:**
  - Person browse + search (name / email / phone, with `provisional_at`
    and "has audit conflict" filters).
  - Person detail page with populated role profiles (customer rows, CRM
    contacts, addresses, recent orders).
  - Merge dialog: pick two persons, diff every field, per-field "survivor"
    radio, per-FK "rewire" preview showing every row that points at the
    loser.
  - Dedup-audit inbox: list view of unresolved rows, click-to-merge.

- **Strapi exposes (api-provider descriptors under `api/crm/persons.js`):**
  - `GET /crm/persons` — paginated search/filter.
  - `GET /crm/persons/:id` — detail with deep populate.
  - `POST /crm/persons/merge` — body `{ winnerId, loserId, fieldOverrides }`.
    Controller runs the rewire **in one transaction**:
    1. Apply `fieldOverrides` to the winner row.
    2. Walk every FK pointing at the loser (customer, crm-contact,
       hr-employee, rider, supplier, sale-order.customer_person,
       contact-ticket, address.person) and rewire to the winner.
    3. Set `merged_into = winner` on the loser; this is **audit-only** —
       readers never traverse the chain (rewire is what makes old IDs
       resolve).
    4. Resolve any matching `person-dedup-audit` row with
       `resolution: 'merged'`.
  - `GET /crm/person-dedup-audits` — paginated audit pile.
  - `POST /crm/person-dedup-audits/:id/resolve` — body
    `{ resolution, winnerId? }`. If `resolution === 'merged'`, delegates
    to the merge endpoint above.

The Strapi merge controller is the only piece that has to be carefully
transactional. CRM is a thin caller — it never rewires FKs from the
client.

**Effort:**
- Strapi side (descriptor + controller + transactional rewire): 1 day.
- rutba-crm side (person browse, detail, merge dialog, audit inbox): 2–3 days.

### 3.2 — Nightly dedup scan

Cron job (Strapi cron or external):
- Scan persons for likely duplicates: same email (case-folded), same phone
  (digits-only), Levenshtein name similarity ≥ 0.85 on shared email/phone
  matches.
- Write candidates to `person-dedup-audit` with `match_kind: name_only` or
  `multi_match`.
- Don't auto-merge.

### 3.3 — Provisional promotion on UP signup  ✓ Landed

- `person.service.ensureForUser(user)` now does an orphan-by-email lookup
  before creating a new row: if there's an existing provisional with the
  same email (case-insensitive) and no `user` FK, it claims the row by
  setting `user` and clearing `provisional_at`. Phone overlap is
  deliberately NOT used — shared family phones would silently link
  strangers; that's a Phase 3.1/3.2 audit-pile case.
- The UP `register` and `callback` controllers now both call
  `ensureForUser` after success, so promotion fires at signup time and on
  every subsequent login (idempotent — short-circuits when already linked).
- Effective net: a guest checkout creates a provisional person; that person
  is auto-claimed the next time the same email logs in or signs up. No
  manual merge needed for the common path.

### Effort
2-3 days total for all three pieces. Not blocking; ship when the audit pile
demands it.

## Quick reference: "what touches what"

| Phase | Entity | Files touched | Has prod data? |
| --- | --- | --- | --- |
| 1A ✓ | sale-order, customer-address, order-contact component | pos-strapi/api/sale-order/*, pos-strapi/api/address/* (new), api-provider/api/addresses.js, rutba-web checkout + profile | No (pre-launch) |
| pre-1B ✓ | person-dedup-audit | pos-strapi/api/person-dedup-audit/* (new) | n/a |
| 1B | customer | pos-strapi/api/customer/*, pos-strapi/src/seed/person-backfill-customer-seed.js | **Yes (POS)** |
| 1C.1 | crm-contact | pos-strapi/api/crm-contact/*, seed | No (in-house only) |
| 1C.2 | hr-employee | pos-strapi/api/hr-employee/*, seed | Maybe (HR dogfood) |
| 1C.3 | rider | pos-strapi/api/rider/*, seed, notification-service | No (in-house only) |
| 1C.4 | supplier | pos-strapi/api/supplier/*, seed | Maybe (POS supplier list) |
| 1C.5 ✓ | contact-ticket | pos-strapi/api/contact-ticket/* | No |
| 3.3 ✓ | provisional-promotion on UP signup | pos-strapi/api/person/services/person.js, pos-strapi/src/extensions/users-permissions/strapi-server.js | n/a |
| 1C.6 | crm-lead | pos-strapi/api/crm-lead/* | No |
| 2.1 | (read-path cutover, all apps) | rutba-cms, pos-sale, rutba-crm, rutba-hr, rutba-rider, rutba-order-management | n/a |
| 2.2 | (column drops, all entities) | schema.json files + knex migrations | n/a |
| 2.3 | sale.employee, legacy employee | pos-strapi/api/sale, delete pos-strapi/api/employee | **Yes (POS)** |
| 3 | person-dedup-audit, merge UI, cron, UP register hook | mostly new files | n/a |
