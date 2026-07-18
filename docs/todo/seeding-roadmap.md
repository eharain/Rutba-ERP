# Seeding Roadmap

Backlog for the unified seeding system (registry + engine + `rutba-seed` control
app). Captures everything discussed but deliberately deferred, so it can be
picked up later. See `pos-strapi/src/seed/` and the memory note
`project_seeding_control_system` for the built system.

## Status — built (2026-07)

- **Decoupled engine**: `src/seed/registry.js` + `engine.js` (sequential,
  single-flight + stale-run reap, audit rows). Server bootstrap seeds nothing.
- **Surfaces**: CLI `npm run seed`, guarded HTTP `/seed/*`, deploy one-shot
  (`strapi-seed` compose service), `rutba-seed` control app (:4018).
- **Categories & content** (~36 registry entries):
  - `system` — UP roles/email/site-setting, slug indexes, api-pro, up-permissions
  - `reference` — accounting COA, return policy, cost-change template, per-file
    JSON (delivery methods, notification templates, CMS pages, site-setting)
  - `regional` — tax profiles (PK/UK/US-states/EU-27/MENA/APAC/Canada, 111 rates),
    shipping (PK couriers + international carrier lanes, M2M-linked)
  - `industry` — 8 onboarding packs (apparel, pharmacy, grocery, restaurant,
    electronics, jewellery, autoparts, wholesale): category tree + variant attributes
  - `workflow` — default workflows (work order / sale order / return request)
  - `backfill` — seo-meta, product-slug, inventory-foundation
  - `demo` — tailoring-unit demo dataset

---

## Deferred backlog

### A. Foundational reference (Layer 0 remainder)
- [ ] **Units of measure** — no UoM content-type exists (units are enums today).
      Decide: seed an enum set vs introduce a `unit`/`uom` content-type with
      conversions (kg↔g, L↔ml, dozen↔piece). Grocery/hardware/fabric need it.
- [ ] **Payment methods** — no entity (enums today). Same decide-or-model call;
      regionalize (JazzCash/Easypaisa for PK; cards/wallets elsewhere).
- [ ] **Localization pack** — Urdu (and other-locale) notification templates,
      RTL-aware CMS defaults, locale date/number/currency formatting seeds.
- [ ] **Currency defaults per region** — seed `currency` rows + base-currency
      hint alongside each regional tax profile.
- [ ] **Bank list** — per-country bank reference (for supplier/payout config).

### B. Industry pack depth (needs new content-types / logic — NOT just seed data)
- [ ] **Pharmacy** — prescription entity + FEFO dispensing, controlled-substance
      register, batch/expiry already present (reuse). Schedule flags → workflow.
- [ ] **Electronics/Mobile** — serial/IMEI tracking, warranty terms + RMA
      workflow, per-unit identifiers on stock-items.
- [ ] **Auto parts / Workshop** — job-card entity, vehicle-compatibility model,
      service catalog + labour lines.
- [ ] **Grocery** — weight-embedded barcodes (price/weight EAN), scale integration.
- [ ] **Jewellery** — live metal-rate-driven pricing rule (gold rate × weight +
      making charges), hallmark fields.
- [ ] **Restaurant** — KOT/table surface, recipe→ingredient depletion (reuse mfg
      BOM), modifiers as first-class order lines.
- [ ] **Wholesale/B2B** — price tiers, credit-limit enforcement, route/van sales.

### C. Per-industry workflows & notifications
- [ ] Seed industry-specific **workflows** (e.g. pharmacy dispensing, workshop
      job-card lifecycle, restaurant order→kitchen→served) on the workflow engine.
- [ ] Seed industry-specific **notification templates** (appointment reminders,
      expiry alerts, warranty-expiry, low-stock by vertical).

### D. More industry verticals (seed-data packs, same pattern as built 8)
- [ ] Salon / Beauty & Services (appointments, service catalog, staff commission)
- [ ] Hardware / Building materials (variable units, supplier-heavy)
- [ ] Furniture / Made-to-order (BOM, deposits, custom orders)
- [ ] Bookstore / Stationery
- [ ] Optics, Sports goods, Toys, Home décor (light catalog packs)

### E. Tax / compliance maintenance
- [ ] **Rate freshness** — rates change; add a dated/versioned refresh mechanism
      and a "review needed" flag rather than silent staleness.
- [ ] **US local rates** — county/city add-ons on top of state base (destination
      tax); currently state floor only.
- [ ] **EU reduced/zero rates** — per-country reduced categories; reverse-charge
      (B2B intra-EU), OSS/IOSS handling.
- [ ] **PK FBR specifics** — withholding matrix, invoice numbering/format, digital
      invoicing integration (ties to market-strategy P1).
- [ ] Tax ↔ account mapping — link seeded rates to accounting `sales_account` /
      `purchase_account` (relations exist on acc-tax-rate, currently unset).

### F. Shipping depth
- [ ] **Carrier rate tables** — weight/zone matrices instead of flat base+per-kg.
- [ ] **Postcode-level zones** — populate `postal_code_patterns`.
- [ ] **Live carrier rates** — EasyPost is already a dependency; wire real quotes
      for the international lanes instead of static defaults.
- [ ] More domestic courier lanes per country (currently PK-only domestic).

### G. Onboarding wizard & bundles
- [ ] **Seed profiles / bundles** — one-click "region + industry + demo" combos
      (e.g. "PK Pharmacy") that run the right set of entries together.
- [ ] **Onboarding wizard** — a guided flow in `rutba-seed` (or auth/admin) that
      picks country → industry → runs the matching packs on a fresh tenant.
- [ ] **Empty-tenant guard** — packs should detect a non-empty catalog and warn
      before adding (avoid polluting an established tenant).

### H. Multi-tenancy & lifecycle (ties to market-strategy P3)
- [ ] **Per-tenant seed scoping** — when multi-tenancy lands, scope runs + audit
      rows per tenant; industry pack chosen at tenant creation.
- [ ] **Seed state export/import** — snapshot a tenant's reference/catalog config
      and re-apply to another (template cloning).
- [ ] **Full-mode force wiring** — `api-provider` entry currently `supportsFull:false`;
      wire `force` through the api-pro seeder to bypass its fingerprint on demand.

---

## Notes
- Everything above stays within the existing framework: a new item is one
  idempotent seeder registered in `registry.js` under the right category — no
  engine changes needed for data packs. Items in **B** and parts of **A** need
  schema/content-type work first (flagged), so they are product features with a
  seed component, not pure seeds.
- Rates/prices in the shipped regional packs are labelled defaults-to-confirm,
  not authoritative — a tenant verifies before go-live.
