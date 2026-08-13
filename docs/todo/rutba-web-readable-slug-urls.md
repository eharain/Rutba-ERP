# rutba-web: replace documentId-based URLs with readable slugs

> **Status (2026-05-19): ✅ shipped** in commit `4bb1dd7` —
> `feat(pos-strapi,rutba-cms,rutba-web,rutba-social): product slug as canonical URL key`.
> Product, product-group, CMS page, brand, category storefront links now
> use slugs; lifecycle hooks generate unique slugs on create + a backfill
> seeder filled existing rows. Public detail services accept slug-or-documentId
> so any cached/legacy URLs keep resolving. Out-of-scope items (category
> trees, locale prefixes) remain future work — keep this doc as the spec.

## Problem

The storefront currently exposes Strapi `documentId` values directly in user-facing URLs:

- `http://localhost:4000/product/crfeakef62f98cnik186mh7i`
- (and similarly for product-groups, brands, categories, etc.)

This hurts:

- **SEO** — search engines treat opaque IDs as low-value paths; readable slugs rank better and stand a chance of being indexed.
- **Shareability** — humans can't tell what a link points to before clicking it.
- **Stability** — documentIds are stable but tied to a specific Strapi instance; readable slugs survive content migrations.
- **Trust** — `/product/genuine-leather-wallet-brown` reads as a real shop URL; `/product/crfeakef62f98...` reads as a database fixture.

## What to do

1. ✓ **Ensure every public content type has a `slug` field** (string, unique, URL-safe). Done — `product`, `cms-page`, `product-group`, brand, category all carry slugs; lifecycle hooks generate unique slugs on create and a backfill seeder filled existing rows.

2. ✓ **Make `slug` the URL parameter** instead of `documentId`. Done — `rutba-web/src/pages/product/[slug].tsx` resolves via `router.query.slug` → `getProductDetailSSR(slug)`, and storefront `<Link>`s emit `product.slug`. (Recently-viewed and breadcrumbs use `product.slug || product.documentId`.)

3. ✓ **Backend lookups by slug** — done. The web detail services accept slug-or-documentId so legacy/cached URLs keep resolving; `[slug].tsx` and `sitemap.xml.ts` both use `product.slug || product.documentId` as the key.

4. ✓ **Generate sitemap** from slugs — done in `rutba-web/src/pages/sitemap.xml.ts` (products emit `/product/${slug || documentId}`; resolves `site_url` at request time). Canonical `<link rel="canonical">` + product JSON-LD on `[slug].tsx` also key off the slug.

(No redirect for documentId URLs — site hasn't launched, no old links to preserve.)

## Out of scope (for the slug pass)

- URL-friendly category trees (`/shop/mens/wallets/leather/brown-bifold`) — separate concern, do after slugs are clean.
- Locale prefixes (`/en/product/...`, `/ur/product/...`) — only relevant when i18n lands.

## Affected files (initial inventory)

- `rutba-web/src/pages/product/[slug].tsx` — link generation + getServerSideProps lookup
- `rutba-web/src/pages/shop/[slug].tsx` — already slug-based, verify
- `rutba-web/src/pages/product-groups/[slug].tsx` — verify
- All `<Link href="/product/...">` call sites across components (search: `href="/product/`)
- `rutba-web/src/services/products.ts` — `getProductDetailSSR` may need slug-vs-id branching during the migration

## Trigger

After the SSR-conversion pass for public pages lands (done 2026-05-14), this becomes the next obvious storefront-UX improvement.
