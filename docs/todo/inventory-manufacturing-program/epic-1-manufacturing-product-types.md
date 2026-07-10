# Epic 1 — Manufacturing: Product-Types, Recipes, Multi-Output & Auto-Consume

> Elevate manufacturing from per-product BOMs into a reusable **product-type / recipe**
> layer that defines inputs and output products, produces **multiple outputs** (co-products
> & by-products), **auto-consumes** BOM inputs on completion, and lands every output in
> inventory automatically — finally activating `track_mode` so bulk vs serialized outputs
> route to the right ledger.

Owning app: `rutba-manufacturing` (port 4014) + `pos-strapi/mfg-*`. Depends on: Foundation
F2/F3/F5 (stock-level, batch, track_mode) for output receipt & input consumption — can
start in parallel with Epic 2's UI once Foundation lands. Converges with Epic 5 on the
batch/lot concept.

See [00-overview-and-roadmap.md](00-overview-and-roadmap.md) and
`[[project-manufacturing-module-phase1]]`.

---

## Current state (verified)

- `mfg-bom` = per-product recipe: **single** output (`mfg-bom.product` + `output_quantity`),
  inputs as `material_lines[]` (`mfg.bom-line.material_product`), routing as
  `routing_steps[]`. Versioned (Draft/Active/Archived, `is_default`).
- `product.kind` (raw_material/consumable/semi_finished/finished_good/service) is the only
  classifier and is **unenforced** — nothing constrains inputs to raw/consumable or outputs
  to finished/semi.
- `product.track_mode` (serialized|bulk) is **inert** — no code reads it. Two ledgers exist
  by convention only: serialized→stock-item, bulk→mfg-material-lot.
- WO-Completed **creates finished serialized stock-items** and lifts `product.stock_quantity`
  (works today). But **inputs are NOT auto-consumed** — material depletion is manual via
  `mfg-material-issue` rows. **No multi-output. No reusable template above the BOM.**

---

## Goals

1. **Product-type / recipe template** — a reusable definition of "this kind of product is
   made from these input types via these operations, yielding these outputs" that can be
   instantiated into product-specific BOMs.
2. **Multi-output BOMs** — a production run yields a primary product + co-products +
   by-products (e.g. offcuts, scrap that has value), each landing in stock.
3. **Auto-consume inputs on completion** — WO completion issues the BOM's `material_lines`
   from stock automatically (with wastage), decrementing the right ledger.
4. **Enforce input/output typing** — validate `kind` on BOM inputs/outputs.
5. **Activate `track_mode`** — outputs and consumed inputs route to serialized (stock-item)
   or bulk (stock-level/stock-batch) ledgers based on the product's `track_mode`.

---

## Data model

### Multi-output on BOM

Today `mfg-bom.product` (single) + `output_quantity`. Add a repeatable **outputs**
component so a BOM can declare several products:

**`mfg.bom-output`** component:
| field | type | notes |
|-------|------|-------|
| `product` | relation oneToOne → product | an output product |
| `output_quantity` | decimal | yield per run |
| `output_type` | enum | `primary` \| `co_product` \| `by_product` \| `scrap` |
| `cost_share_pct` | decimal | how much of run cost this output absorbs (co-products split cost) |
| `track_mode_override` | enum | optional; else inherit product.track_mode |

Keep `mfg-bom.product` as the **primary** output for backward-compat (derive it from the
`primary` row, or keep both and treat `outputs` as the source of truth when present). WO
completion iterates outputs; **cost allocation** across outputs uses `cost_share_pct`
(by-products/scrap can absorb little or zero, raising primary unit cost realistically).

### Product-type / recipe template (the "define product types" ask)

**`mfg-production-template`** (deferred in P1, build now) — a recipe **above** the
product-specific BOM, keyed to product **types/categories** rather than specific products:

| field | type | notes |
|-------|------|-------|
| `name` / `code` | string/uid | |
| `output_category` | relation → category | the *type* of product this makes |
| `input_lines` | repeatable component `mfg.template-input` | input **category/kind** + qty + wastage (type-level, not a specific product) |
| `output_lines` | repeatable component `mfg.template-output` | output category/kind + relative yield + output_type |
| `routing_steps` | repeatable `mfg.routing-step` | reuse the existing component |
| `default_track_mode` | enum | |
| `is_active` | boolean | |

**Instantiation:** an action `instantiateBom(templateId, { outputProduct, inputProductMap })`
resolves the template's category/kind slots to concrete products and emits a versioned
`mfg-bom`. This gives "define product types, their inputs and output products" as a reusable
abstraction while BOMs stay the concrete, versioned, per-product recipe the WO consumes.

> **Scope guard:** the template is a *convenience/consistency* layer. The WO still runs off a
> concrete `mfg-bom`. Don't route production directly off templates — always instantiate a
> BOM first (keeps costing/versioning intact).

### Typing enforcement

- Validate (BOM lifecycle): `material_lines[].material_product.kind ∈ {raw_material,
  consumable, semi_finished}`; `outputs[].product.kind ∈ {finished_good, semi_finished}` (or
  `scrap`/`by_product` allowed any). Warn, don't hard-block, if you want migration slack —
  but recommend hard validation on Active BOMs.

---

## Behaviour changes (WO state machine — executeTransition chokepoint)

Extend `mfg-work-order-state-machine.js` `Completed` handler:

1. **Auto-consume inputs** (new). For each BOM `material_lines` row, compute required qty =
   `line.quantity × (1 + wastage_pct) × (finishedCount / bom.output_quantity)` and issue it:
   - input `track_mode=bulk` (raw fabric etc.) → create `mfg-material-issue`
     (`issue_type=Issue`) against the appropriate `mfg-material-lot` / `stock-batch`
     (FEFO-order by expiry per Epic 5), which decrements `quantity_remaining`.
   - input `track_mode=serialized` → flip N InStock stock-items of that input product to a
     consumed status (`Reduced`/new `Consumed`), decrementing its stock-level/cache.
   - **Fail-safe:** if insufficient input stock, block completion (or allow negative with a
     flag) — decision below. This is the "consumption-first, no hard reservation" model from
     P1 made real at the completion chokepoint.
2. **Multi-output receipt** (extend existing single-output logic). For each `outputs[]` row,
   create output stock per its `track_mode`:
   - serialized → N `stock-item` rows (InStock) as today, now targeting a **warehouse+bin**
     (Foundation F1) and a **batch** (Epic 5, WO becomes the batch's source), `cost_price` =
     allocated unit cost (via `cost_share_pct`).
   - bulk → increment stock-level / create a `stock-batch` quantity row (activates
     `bulk_quantity_on_hand`).
   Idempotency preserved (skip if the WO already produced outputs).
3. **Costing** — roll material (now including auto-consumed issues) + labor + overhead, then
   **allocate** total cost across outputs by `cost_share_pct` → each output's unit cost.

Existing domain events (WO_COMPLETED etc.) still fire; the accounting bridge (WIP → COGS)
from `[[project-accounting-payroll-modules-state]]` plugs in here (Dr WIP on issue, relieve
to finished-goods inventory on receipt).

---

## Backend surface

- `mfg-bom` schema: add `outputs` component (+ keep `product` for primary).
- New `mfg-production-template` CT + `mfg.template-input`/`mfg.template-output` components +
  `instantiateBom` action. Descriptor `packages/api-provider/api/mfg-production-templates.js`
  (`meta.domains=['manufacturing']`), `export` in index.
- WO state-machine extension (auto-consume + multi-output + cost allocation).
- BOM lifecycle typing validation.
- Reuse Foundation F1/F3/F5 for output placement, batch, and track_mode routing.

## Frontend surface (`rutba-manufacturing`)

- **Recipe/Template builder** — define product-types with input/output category slots +
  routing; "Instantiate to BOM" action.
- **BOM editor** — add the multi-output table (primary/co/by/scrap + cost share) to the
  existing BOM screen.
- **WO completion** — show the auto-consume preview (what will be issued) + multi-output
  receipt (what will be produced, to which warehouse/bin/batch) before confirming.

---

## Convergence with Epic 5 (batch/lot) — settle before coding

`mfg-material-lot` and Epic 5's `stock-batch` both model "lot + expiry + quantity ledger".
**Do not fork.** Recommended: make `stock-batch` the generic lot concept; raw-material lots
become `stock-batch` rows with `product.kind='raw_material'` (keeping any WIP-specific fields
in a component), so mfg auto-consume and finished-goods batching use one model. Alternative:
keep `mfg-material-lot` for raw and make `stock-batch` its finished-goods analogue sharing a
`stock.lot-common` component. Decide with Epic 5's owner.

## Phasing

1. **Multi-output BOM** (component + WO receipt loop + cost allocation) — highest-value,
   self-contained.
2. **Auto-consume inputs** on completion (needs F5 track_mode + F3 batch for FEFO issue).
3. **Typing enforcement** (BOM lifecycle validation).
4. **Production templates** (the reusable product-type layer + instantiateBom) + builder UI.

## Open decisions

- **Block completion on insufficient input stock?** Recommend: block on Active/strict BOMs,
  allow-with-warning otherwise (configurable per production line or BOM).
- **Cost allocation method** — explicit `cost_share_pct` (chosen) vs by relative sales value
  vs by physical quantity. Start explicit; add auto-by-value later.
- **Template granularity** — category-slot templates (recommended) vs kind-only slots.
- **Batch convergence** (above) — the one cross-epic blocker.

## Verification checklist

- A multi-output BOM completes → primary + co-product + by-product all land in stock with
  cost split per `cost_share_pct`; Σ output cost == run cost.
- Auto-consume issues the right input qty (incl. wastage), decrements the input's ledger, and
  blocks (or warns) when short.
- track_mode routing: a bulk output raises `bulk_quantity_on_hand`; a serialized output mints
  units — each to the WO's warehouse/bin and batch.
- Template instantiation emits a valid versioned BOM that a WO can run unchanged.
- Existing single-output BOMs keep working (backward-compat).
