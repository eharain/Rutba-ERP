# Google Shopping — Marketplace Integration Spec

<!-- verify-docs: planned apps/sales/marketplace/lib/providers/google.js -->

> **Status (2026-08-10): 📋 Planned, nothing built.** Written against the
> marketplace seam as it exists on `dev` (apps/sales/marketplace :4016, adapter
> registry, marketplace-* CTs). Deadline-relevant fact: the legacy **Content
> API for Shopping sunsets 2026-08-18** — this integration MUST be built on
> the **Merchant API v1** (`merchantapi.googleapis.com`) from day one; there
> is no legacy option to fall back to.

## 1. What Google Shopping is (and is not) for us

Google Shopping is **not an order-taking marketplace**. "Buy on Google"
checkout was retired in 2023; today Google surfaces product listings (free
listings in the Shopping tab + paid Shopping/Performance Max ads) and sends
the buyer to **our storefront** to check out. Orders therefore arrive as
ordinary apps/content/storefront storefront orders — there is no order pull, no
fulfillment push-back, no message sync.

What Google *does* consume is a **product feed** kept fresh: title,
description, image, price, availability, canonical product URL. That is
exactly the catalog/inventory half of the marketplace engine, so the
integration is a new adapter with:

```js
capabilities: { oauth: false, orders: false, inventory: true, fulfillment: false, messages: false, catalog: true }
```

The engine already skips orders/fulfillment/messages on capability checks
(engine.js gates every job on `adapter.capabilities`), so a listings-only
platform slots in without engine changes.

Pakistan status (verified 2026-08-10): **PK is a beta country** for both
Shopping ads and free listings. PKR is supported; landing pages must show
PKR prices and match the feed. Beta means stricter review and possibly
fewer surfaces — plan for a slow first approval, not a fast one.

## 2. Why bother (fit with existing programs)

- The user already runs a Google Ads account (the campaigns console they
  work in). Linking Merchant Center to that account unlocks Shopping /
  Performance Max campaigns fed by our own catalog data.
- Free listings cost nothing per click — pure upside once the feed exists.
- The product-content KB rewrite (titles/descriptions) directly feeds
  listing quality; the storefront SEO work (seo-meta, slug URLs) directly
  feeds landing-page quality. This integration is the channel those two
  programs cash out in.
- Multi-tenant: the adapter is per `marketplace-account` (merchant id +
  credentials + site URL per account), so when the ERP is sold as SaaS,
  each tenant connects their own Merchant Center. rutba.pk is tenant #1.

## 3. Google-side model (Merchant API v1)

- **Account**: Merchant Center account, website claimed+verified for
  `rutba.pk`. Business info, shipping, and return policy configured
  account-level (not per-offer).
- **Data source**: Merchant API requires an explicit **API data source**
  (`dataSources.create`, primary product data source, contentLanguage +
  feedLabel) created once per account. Offers are inserted *into* it.
- **Offers**: `productInputs.insert` writes an offer; Google processes it
  into a `Product` with `productStatus` (approval per reporting context +
  `itemLevelIssues`). Offer identity is
  `channel~contentLanguage~feedLabel~offerId` — for us:
  `online~en~PK~<variant sku>`.
- **Price**: `{ amountMicros, currencyCode: 'PKR' }` — micros, not
  decimals. (Not the 3-decimal trap — PKR is fine — but the ×1,000,000 is
  easy to get wrong.)
- **No custombatch**: unlike the old Content API, v1 has no batch
  endpoint. Push with bounded concurrency (e.g. 5-way) against per-minute
  quotas; the engine's per-product `results[]` contract fits per-call
  pushes naturally.
- **Statuses**: read processed products (or the `product_view` report) for
  approval state + issues; map onto `marketplace-listing.status` /
  `push_error` like Daraz push errors.

## 4. Auth decision: service account first, OAuth later

Two workable models; recommend **(a)** now:

a) **Service account (recommended for phase 1).** Create a GCP service
   account, add its email as a **user on the Merchant Center account**,
   store the JSON key in `marketplace-account.extra_config` (private
   field). The adapter mints access tokens locally (JWT → token endpoint,
   scope `https://www.googleapis.com/auth/content`) inside
   `refreshToken`, caching into `access_token`/`token_expires_at` so the
   engine's `ensureFreshToken` seam works unchanged. No consent screen,
   no Google app verification, no 7-day testing-mode refresh-token death.
   Precedent: the `rutba` adapter is already non-OAuth (token in
   `extra_config`), so `capabilities.oauth: false` is a supported shape.

b) **OAuth authorization-code flow** (the Daraz-style
   `getAuthUrl`/`exchangeCode` seam). Needed later for SaaS tenants who
   must click-to-consent rather than share MC user access with us. Parked:
   requires a production OAuth consent screen + Google verification for a
   sensitive scope.

## 5. Feed mapping (Rutba → Google offer)

One offer per **published variant**; standalone products are their own
offer. The engine already assembles parents + published variants + price
rules (`assembleCatalogPayload`) — the adapter maps that payload:

| Google attribute | Source |
| --- | --- |
| `offerId` | variant `sku` (stable, never reuse) |
| `itemGroupId` | parent product `sku` (variants only) |
| `title` | product/variant name (≤150 chars; KB-rewritten copy) |
| `description` | description (≤5000 chars, plain text) |
| `link` | `<site_url>/<product slug path>` — site-settings `site_url`, same resolution the social-posts code uses; never env |
| `imageLink` / `additionalImageLinks` | primary + up to 10 images (images.rutba.pk absolute URLs) |
| `price` | engine-adjusted price (price rules + `price_adjust_pct` already applied) → micros, `PKR` |
| `availability` | `in stock` / `out of stock` from the stock model (InStock count / sellable units) |
| `brand` | brand term; when absent → `identifierExists: false` |
| `gtin` / `mpn` | barcode when present, else `identifierExists: false` (typical for own-label apparel) |
| `condition` | `new` |
| `color`, `size`, `gender`, `ageGroup`, `material`, `pattern` | variant terms via term_type mapping (apparel categories require color+size+gender+ageGroup) |
| `googleProductCategory` | optional category mapping (see §6); Google auto-classifies when absent |
| `productTypes` | internal category path, free-form |

Shipping/returns: account-level in Merchant Center, not per-offer.

## 6. catalogSpec / mapping UI

Reuse the declarative `catalogSpec` the mapping UI renders:

- `category` dimension → **Google product taxonomy**: a static published
  file (`taxonomy-with-ids.en-US.txt`), not an API. `fetchCategoryTree`
  parses a bundled/cached copy — no network dependency at mapping time.
  Mapping is **optional at launch** (auto-classification is decent);
  mapped categories mainly improve ad serving + unlock apparel attribute
  requirements clarity.
- `term_type` dimension → the fixed Google attribute list (`color`,
  `size`, `gender`, `age_group`, `material`, `pattern`): map our
  term-types to those keys; values resolve from variant terms at push
  time. External type `list`, not per-category.
- **No brand dimension** — Google has no brand registry; brand is a
  pass-through string.

## 7. Phases

### Phase 0 — accounts + storefront readiness (ops-heavy, small code)
1. Merchant Center account; verify + claim `rutba.pk`; business info,
   shipping service (PK), return policy. Currency PKR, language `en`,
   feed label `PK`.
2. **Link the existing Google Ads account** (the one the campaigns
   console URL belongs to) from Merchant Center → Settings → Linked
   accounts.
3. GCP project: enable Merchant API, create the service account, add it
   as an MC user (per §4a).
4. Storefront prerequisites (these gate approval — PK beta reviews are
   strict):
   - `Product`/`Offer` **JSON-LD structured data** on product detail
     pages (price, availability, sku, brand, image) — also enables MC
     "automatic item updates", which patches feed/page drift instead of
     disapproving the offer. Rides on the in-flight storefront SEO work.
   - Visible returns/refund policy page, contact page, and PKR prices
     rendered server-side (SSR already the case).

### Phase 1 — adapter + catalog push
1. `apps/sales/marketplace/lib/providers/google.js`: token minting
   (`refreshToken`), `validateConnection` (GET account), one-time data
   source ensure (create-if-missing, id cached in `extra_config`),
   `pushCatalog` (`productInputs.insert` per offer, bounded concurrency,
   engine `results[]` contract), `catalogSpec`, `fetchCategoryTree`
   (taxonomy file).
2. Registry: add to `lib/providers/index.js`; config block
   `providers.google` in `lib/config.js`;
   `MARKETPLACE__GOOGLE_*` entries in `.env.example` (service
   account key stays per-account in `extra_config`, NOT env).
3. `marketplace-account` schema: `platform` enum += `google` (frontends
   read enums dynamically — no UI edits).
4. Bundle the taxonomy file (small, versioned, refresh yearly).
5. Verify: connect account → select a small product set on the listings
   page → catalog sync → offers visible in MC, listings stamped
   `listed` with external ids.

### Phase 2 — statuses + inventory freshness
1. `pushInventory`: price/availability partial update per offer (same
   productInputs path; runs on the existing hourly inventory cron so
   stock-outs leave the feed fast — stale availability is the #1
   disapproval source).
2. Status pull: processed-product / `product_view` read → map approval +
   `itemLevelIssues` onto `marketplace-listing.status`/`push_error`;
   surface issue titles in the listings UI.
3. Delist path: deselect → `productInputs.delete` → `delisted`.

### Phase 3 — measurement + campaigns (manual first)
1. Storefront conversion tracking: Google tag with purchase value/currency
   (consent-aware), so Shopping/PMax campaigns can optimize.
2. First campaign created **manually** in the linked Ads account
   (Performance Max or standard Shopping over the approved feed).
3. Evaluate free-listings impressions vs paid before spending.

### Phase 4 — later / optional
- Google Ads API automation (needs a developer-token approval cycle) —
  if it lands, it belongs in the `cmp-*` campaigns module as a channel,
  not in the marketplace app.
- Promotions API (sale price already works via plain price updates).
- Local inventory ads from branch stock — parked; PK beta almost
  certainly excludes LIA.

## 8. Risks / notes

- **PK beta**: approval can be slow/strict; misrepresentation policy is
  the common account-suspension cause — landing-page parity (price,
  availability, currency), returns policy, and contact info are the
  mitigations, hence Phase 0.4 gates everything.
- **Offer id stability**: `offerId` must never change for the same
  variant (sku renames create duplicate offers; add a guard note in the
  adapter).
- **Quota**: no batch endpoint; catalog pushes for the full ~114-product
  catalog are fine at 5-way concurrency, but keep the publish-set
  selection semantics (only `selected` listings push) rather than
  pushing everything.
- **Token model**: service-account JSON in `extra_config` is private
  (field already `private: true`) but is a real credential — never log
  it; `validate` endpoint must not echo it.
- **Engine watermark quirk**: `syncCatalogForAccount` stamps
  `last_inventory_synced_at` (pre-existing engine behavior) — harmless
  here, just don't read it as inventory truth for Google accounts.

## 9. Open decisions (defaults chosen, flag if wrong)

1. **Auth = service account** (§4a), OAuth deferred to SaaS — default.
2. **Content language `en`**, single PK feed label — default (no `ur`
   feed until Google's PK beta docs ask for it).
3. **Category mapping optional at launch** — default; revisit if apparel
   offers get attribute-related disapprovals.
4. Conversion tracking via direct Google tag vs GTM — decide in Phase 3
   with the storefront owner.
