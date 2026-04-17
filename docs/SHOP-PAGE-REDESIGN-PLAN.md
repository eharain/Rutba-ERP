# Shop Page Redesign — Product Groups with Layouts & Priority

## Overview

Replace the current shop page rendering (which uses brands, categories, and flat product groups) with a **layout-driven, priority-ordered product group system**. Each product group gets a `layout` (how it displays) and a `priority` (integer, lower = higher on page). The shop page becomes a single page that renders multiple product groups in priority order, each using its assigned layout.

**No more brand groups or category groups on shop pages.** Everything flows through product groups.

---

## Layout Types

Define these layouts for rendering a product group on the shop page:

| Layout Key | Description |
|---|---|
| `hero-slider` | Full-width swiper/carousel of products (like current hero). Good for featured/banner products. |
| `grid-4` | 4-column product grid (2 on mobile, 4 on desktop). Standard product cards. |
| `grid-6` | 6-column product grid (2 on mobile, 3 on tablet, 6 on desktop). Compact cards. |
| `carousel` | Horizontal swiper of product cards. Scrollable row. |
| `banner-single` | Single large product banner (first product in group). Full-width image + CTA. |
| `list` | Vertical list of products with image on left, details on right. |

---

## Execution Steps (Sequential)

### Phase 1: Strapi Schema Changes (pos-strapi)

**Step 1 — Add `layout` and `priority` fields to product-group schema**
- File: `pos-strapi/src/api/product-group/content-types/product-group/schema.json`
- Add `layout` field: enumeration with values `hero-slider`, `grid-4`, `grid-6`, `carousel`, `banner-single`, `list`. Default: `grid-4`.
- Add `priority` field: integer, default `0`.
- After editing, restart Strapi so the DB migration runs.

### Phase 2: CMS Changes (rutba-cms)

**Step 2 — Update product-group edit form to include layout and priority fields**
- File: `rutba-cms/pages/[documentId]/product-group.js`
- Add a `<select>` dropdown for `layout` with all 6 layout options.
- Add a number `<input>` for `priority`.
- Include both in the save payload.
- Load both from the fetched group data.

**Step 3 — Update product-groups list page to show layout and priority columns**
- File: `rutba-cms/pages/product-groups.js`
- Add "Layout" and "Priority" columns to the table/list.
- Sort groups by priority by default.

**Step 4 — Update CMS page edit form: remove brand_groups and category_groups pickers for shop pages**
- File: Locate the CMS page editor (likely `rutba-cms/pages/[documentId]/cms-page.js` or similar)
- For `page_type === 'shop'`, hide/remove the brand groups and category groups relation pickers.
- Keep product_groups and hero_product_groups pickers.
- (Optional: merge hero_product_groups into product_groups — a group with `hero-slider` layout replaces the hero concept.)

### Phase 3: Web Frontend Changes (rutba-web)

**Step 5 — Update TypeScript types for product groups**
- File: `rutba-web/src/types/api/cms-page.ts`
- Add `layout` and `priority` fields to `CmsProductGroupInterface`.
  ```ts
  layout?: 'hero-slider' | 'grid-4' | 'grid-6' | 'carousel' | 'banner-single' | 'list';
  priority?: number;
  ```

**Step 6 — Create individual layout components for each product group layout type**
- File: `rutba-web/src/components/cms/layouts/` (new directory)
- Create one component per layout:
  - `HeroSliderLayout.tsx` — full-width swiper (extract from current hero logic in cms-page-content.tsx)
  - `Grid4Layout.tsx` — 4-col grid of ProductCards
  - `Grid6Layout.tsx` — 6-col grid of ProductCards (like current ProductGrid)
  - `CarouselLayout.tsx` — horizontal swiper of ProductCards
  - `BannerSingleLayout.tsx` — single product banner
  - `ListLayout.tsx` — vertical product list
- Each component receives `{ group: CmsProductGroupInterface }` as props.

**Step 7 — Create a layout resolver/renderer component**
- File: `rutba-web/src/components/cms/ProductGroupRenderer.tsx` (new)
- Takes a `CmsProductGroupInterface` and renders the correct layout component based on `group.layout`.
- Default fallback to `grid-4`.

**Step 8 — Refactor `cms-page-content.tsx` to use the new layout system**
- File: `rutba-web/src/components/cms/cms-page-content.tsx`
- Replace the current separate hero / brandGroups / categoryGroups / productGroups rendering with:
  1. Combine `hero_product_groups` and `product_groups` into one array.
  2. Sort by `priority` (ascending).
  3. Map each group through `<ProductGroupRenderer group={group} />`.
- Remove `BrandSwiper` and `CategorySwiper` components (or keep them unused for now).
- The page structure becomes: Background → Excerpt → [Sorted Product Groups] → Content → Gallery → Related Pages.

**Step 9 — Update the shop index page (`/shop`)**
- File: `rutba-web/src/pages/shop/index.tsx`
- Currently this lists CMS pages as cards. Decide:
  - **Option A**: Keep as-is (shop index lists sub-pages, each sub-page renders groups). No change needed.
  - **Option B**: Make `/shop` itself render product groups from a single "main shop" CMS page. Requires fetching a designated CMS page.
- Recommend **Option A** for now (no change to index). The layout changes only affect `[slug].tsx` detail pages.

**Step 10 — Update the CMS pages service to populate layout and priority on product groups**
- File: `rutba-web/src/services/cms-pages.ts`
- Ensure the API call to fetch CMS page detail populates `product_groups.layout`, `product_groups.priority` (and same for `hero_product_groups`).
- Check the `populate` parameter in the Strapi query.

### Phase 4: Verification

**Step 11 — Test end-to-end**
- Create a product group in CMS with `hero-slider` layout, priority `1`.
- Create another with `grid-4` layout, priority `2`.
- Assign both to a shop CMS page.
- Verify they render in order on the web frontend.
- Verify the hero-slider group shows a full-width carousel.
- Verify the grid-4 group shows a 4-column product grid.

---

## Files Summary

| File | Action |
|---|---|
| `pos-strapi/src/api/product-group/content-types/product-group/schema.json` | Add `layout` enum + `priority` integer |
| `rutba-cms/pages/[documentId]/product-group.js` | Add layout dropdown + priority input |
| `rutba-cms/pages/product-groups.js` | Show layout/priority in list |
| `rutba-cms/pages/[documentId]/cms-page.js` (or similar) | Remove brand/category group pickers for shop |
| `rutba-web/src/types/api/cms-page.ts` | Add layout/priority to interface |
| `rutba-web/src/components/cms/layouts/*.tsx` | New layout components (6 files) |
| `rutba-web/src/components/cms/ProductGroupRenderer.tsx` | New layout resolver |
| `rutba-web/src/components/cms/cms-page-content.tsx` | Refactor to use layout system |
| `rutba-web/src/services/cms-pages.ts` | Ensure populate includes new fields |

---

## Notes

- Priority is an integer. Lower number = appears first on the page. Groups with same priority render in the order returned by Strapi.
- The `hero-slider` layout replaces the old `hero_product_groups` concept. Eventually you can deprecate that relation and just use `product_groups` with `layout: 'hero-slider'`.
- Brand and category groups are NOT removed from the Strapi schema (backward compatible). They are just no longer rendered on shop pages.
- Each layout component should be self-contained and reusable.
