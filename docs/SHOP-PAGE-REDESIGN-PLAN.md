# Shop Page Redesign — Product Groups with Layouts & Priority

## Overview

Replace the current shop page rendering (which uses brands, categories, and flat product groups) with a **layout-driven, priority-ordered product group system**. Each product group gets a `layout` (how it displays) and a `priority` (integer, lower = higher on page). The shop page becomes a single page that renders multiple product groups in priority order, each using its assigned layout.

**No more brand groups or category groups on shop pages.** Everything flows through product groups.

**Remove the `swiper` dependency.** All sliders/carousels will be built with a custom, lightweight component using CSS `scroll-snap` + minimal React state. No external carousel libraries. The result is simpler, faster, and visually consistent across all layouts.

**Richtext fields respected.** Product group `excerpt` (markdown) is rendered as parsed HTML in `GroupHeader` and `BannerSingleLayout`. Product group `content` (markdown) is rendered below the products in every layout via `ProductGroupRenderer`. Both fields use the `marked` parser with prose styling.

---

## Design System & Visual Cohesion

All layouts share a unified visual language so the page feels like one designed surface, not a patchwork:

- **Consistent section spacing**: Every product group section uses the same vertical rhythm (`py-12` / `py-16` on desktop) with optional alternating subtle background tones (white / slate-50) for visual separation.
- **Unified group header**: Every group renders with a shared `<GroupHeader>` component — group name as heading, optional excerpt as subtitle, consistent typography and spacing.
- **Unified group controls**: Every group can render a consistent toolbar (right side of the header) with a **Sort dropdown** and **View mode toggle** (Summary / Detailed) so the UI feels coherent across layouts.
- **Shared product card**: All layouts (grid, carousel, list) reuse the same `ProductCard` or a variant of it. No layout renders products with completely different card styles.
- **Custom slider component**: A single `<ScrollSlider>` primitive replaces all Swiper usage. It uses CSS `overflow-x: auto` + `scroll-snap-type: x mandatory` + optional prev/next buttons. Clean, native-feeling, no JS-heavy carousel logic.
- **Smooth transitions**: Hover states, card shadows, and interactive elements use consistent `transition-all duration-200` across all layouts.
- **Responsive breakpoints**: All layouts follow the same breakpoint strategy (mobile-first: 1 col → sm: 2 col → md: 3 col → lg: varies by layout).

---

## User Controls (Dropdown + Summary/Detailed)

Every product-group section should support the same interaction pattern:

- **Sort dropdown** (right side of the group header):
  - Options: `Default`, `Newest`, `Price: Low → High`, `Price: High → Low`.
  - Sorting is applied **within that group only** (client-side).
- **View mode toggle**:
  - `Summary` = compact card view (grid / carousel)
  - `Detailed` = list view (larger rows with more text)
  - Default view is the group’s `layout`, but users can toggle per group.
  - The view toggle should be hidden for layouts that don’t make sense (e.g., `hero-slider`, `banner-single`).

Implementation note: keep it lightweight—local React state per group is fine. Optionally sync to URL query later if you want shareable states.

---

## Layout Types

Define these layouts for rendering a product group on the shop page:

| Layout Key | Description |
|---|---|
| `hero-slider` | Full-width custom slider of product hero images. Uses `<ScrollSlider>` with auto-play and dot indicators. No external library. |
| `grid-4` | 4-column product grid (2 on mobile, 4 on desktop). Standard product cards. |
| `grid-6` | 6-column product grid (2 on mobile, 3 on tablet, 6 on desktop). Compact cards. |
| `carousel` | Horizontal `<ScrollSlider>` of product cards. CSS scroll-snap, prev/next arrows, drag-to-scroll. |
| `banner-single` | Single large product banner (first product in group). Full-width image + overlay text + CTA button. |
| `list` | Vertical list of products with image on left, details on right. Clean rows with dividers. |

---

## Execution Steps (Sequential)

### Phase 1: Strapi Schema Changes (pos-strapi)

**Step 1 — Add `layout` and `priority` fields to product-group schema**
- File: `pos-strapi/src/api/product-group/content-types/product-group/schema.json`
- Add `layout` field: enumeration with values `hero-slider`, `grid-4`, `grid-6`, `carousel`, `banner-single`, `list`. Default: `grid-4`.
- Add `priority` field: integer, default `0`.
- (Optional, recommended) Add editor defaults for the new group toolbar:
  - `default_sort`: enumeration `default | newest | price_asc | price_desc` (default: `default`)
  - `enable_sort_dropdown`: boolean (default: `true`)
  - `enable_view_toggle`: boolean (default: `true`)
- After editing, restart Strapi so the DB migration runs.

### Phase 2: CMS Changes (rutba-cms)

**Step 2 — Update product-group edit form to include layout and priority fields**
- File: `rutba-cms/pages/[documentId]/product-group.js`
- Add a `<select>` dropdown for `layout` with all 6 layout options.
- Add a number `<input>` for `priority`.
- (If Step 1 optional fields are added) Add fields for `default_sort`, `enable_sort_dropdown`, and `enable_view_toggle`.
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
- (If Step 1 optional fields are added) add:
  ```ts
  default_sort?: 'default' | 'newest' | 'price_asc' | 'price_desc';
  enable_sort_dropdown?: boolean;
  enable_view_toggle?: boolean;
  ```

**Step 6 — Build the custom `<ScrollSlider>` primitive component**
- File: `rutba-web/src/components/ui/scroll-slider.tsx` (new)
- A reusable, zero-dependency slider/carousel built with:
  - `overflow-x: auto` + `scroll-snap-type: x mandatory` on the container.
  - `scroll-snap-align: start` on each child.
  - Optional prev/next arrow buttons (absolute positioned, appear on hover).
  - Optional dot indicators (computed from scroll position / child count).
  - Optional `autoPlay` prop (uses `setInterval` to scroll to next child).
  - `scrollBehavior: 'smooth'` for transitions.
  - Props: `children`, `showArrows?: boolean`, `showDots?: boolean`, `autoPlay?: number` (ms interval, 0 = off), `className?: string`.
- Tailwind only, no external CSS files needed.
- This single component replaces ALL Swiper usage across the shop page.

**Step 7 — Build the shared `<GroupHeader>` + controls (sort dropdown + view toggle)**
- File: `rutba-web/src/components/cms/layouts/GroupHeader.tsx` (new)
- Renders the product group heading + optional subtitle/excerpt consistently across all layouts.
- Also renders an optional right-side toolbar:
  - Sort dropdown
  - View toggle (Summary / Detailed)
- Props (suggested):
  - `name: string`, `excerpt?: string`
  - `sort?: string`, `onSortChange?: (v) => void`
  - `viewMode?: 'summary' | 'detailed'`, `onViewModeChange?: (v) => void`
  - `showSort?: boolean`, `showViewToggle?: boolean`
- Keeps typography and spacing identical for every section.

**Step 8 — Create individual layout components for each product group layout type**
- File: `rutba-web/src/components/cms/layouts/` (new directory)
- Create one component per layout:
  - `HeroSliderLayout.tsx` — full-width `<ScrollSlider autoPlay={5000} showDots>` with large product images. Each slide is a Link to the product. No Swiper.
  - `Grid4Layout.tsx` — 4-col grid (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`) of ProductCards.
  - `Grid6Layout.tsx` — 6-col grid (`grid-cols-2 md:grid-cols-3 lg:grid-cols-6`) of ProductCards.
  - `CarouselLayout.tsx` — `<ScrollSlider showArrows>` with ProductCards as children. Horizontal scroll-snap row.
  - `BannerSingleLayout.tsx` — first product rendered as a full-width banner with background image, overlay gradient, product name, price, and "Shop Now" CTA link.
  - `ListLayout.tsx` — vertical stack of product rows: image left (fixed width), name + price + description right, clean divider between rows.
- Each component receives `{ group: CmsProductGroupInterface }` as props.
- Each component uses `<GroupHeader>` at the top.
- Each component should apply the per-group **sort** (dropdown) before rendering products.
- Layouts that support both modes should also support **Summary vs Detailed**:
  - Summary: use the layout’s natural representation (grid / carousel)
  - Detailed: reuse the `ListLayout` rendering (or share a small list-render helper)
- All use consistent `container-fluid` width and section padding.

**Step 9 — Create a layout resolver/renderer component**
- File: `rutba-web/src/components/cms/ProductGroupRenderer.tsx` (new)
- Takes a `CmsProductGroupInterface` and renders the correct layout component based on `group.layout`.
- Default fallback to `grid-4`.
- Wraps each layout in a consistent section container with alternating background if desired.
- Holds the per-group UI state for:
  - selected sort
  - selected view mode (summary/detailed)
  - and passes state into `<GroupHeader>` and the selected layout.

**Step 10 — Refactor `cms-page-content.tsx` to use the new layout system**
- File: `rutba-web/src/components/cms/cms-page-content.tsx`
- Replace the current separate hero / brandGroups / categoryGroups / productGroups rendering with:
  1. Combine `hero_product_groups` and `product_groups` into one array.
  2. Sort by `priority` (ascending).
  3. Map each group through `<ProductGroupRenderer group={group} />`.
- **Remove** `BrandSwiper` and `CategorySwiper` internal components entirely.
- **Remove** all `swiper` and `swiper/css` imports from this file.
- The page structure becomes: Background → Excerpt → [Sorted Product Groups] → Content → Gallery → Related Pages.

**Step 11 — Remove Swiper from other shop-related components**
- File: `rutba-web/src/components/home/hero-slider.tsx` — Refactor to use `<ScrollSlider>` instead of Swiper (if this component is used on shop pages). If it's only used on the homepage and not part of this redesign, leave it for a separate cleanup.
- File: `rutba-web/src/components/brands/index.tsx` — If BrandSwiper is used on shop pages, refactor. Otherwise mark for future cleanup.
- Goal: No Swiper imports remain in any shop-page-related code path.

**Step 12 — Update the shop index page (`/shop`)**
- File: `rutba-web/src/pages/shop/index.tsx`
- Currently this lists CMS pages as cards. Decide:
  - **Option A**: Keep as-is (shop index lists sub-pages, each sub-page renders groups). No change needed.
  - **Option B**: Make `/shop` itself render product groups from a single "main shop" CMS page. Requires fetching a designated CMS page.
- Recommend **Option A** for now (no change to index). The layout changes only affect `[slug].tsx` detail pages.

**Step 13 — Update the CMS pages service to populate layout and priority on product groups**
- File: `rutba-web/src/services/cms-pages.ts`
- Ensure the API call to fetch CMS page detail populates `product_groups.layout`, `product_groups.priority` (and same for `hero_product_groups`).
- Check the `populate` parameter in the Strapi query.

**Step 14 — (Optional) Remove `swiper` package from rutba-web**
- If after steps 10-11 no remaining code imports from `swiper`, run `npm uninstall swiper` in the `rutba-web` workspace.
- Keep `@radix-ui/react-slider` — that's a UI slider (range input), not a carousel.

### Phase 4: CMS Authoring UX — Easier Product Group Creation & Bulk Add

**Step 15 — Add bulk "Add All" buttons to ProductPickerTabs for categories, brands, suppliers**
- File: `rutba-cms/components/ProductPickerTabs.js`
- In the "All Products" tab, next to each filter dropdown (Brand, Category, Supplier), add an **"Add All"** button that:
  1. Fetches **all** product `documentId`s matching the current filter (not just the current page) using a dedicated unpaginated or high-limit API call.
  2. Calls `onToggle` for each product not already in `selectedProductIds`, effectively bulk-adding the entire filtered set.
  3. Shows a brief loading spinner while fetching, then a toast/badge confirming how many were added.
- Also add a **"Remove All"** button on the "Connected" tab header to clear the selection quickly.
- Add a summary line at the top of the Connected tab: "X products selected" with a small "Clear All" link.

**Step 16 — Add a "Quick Add" tab/section for browsing by Category and Brand trees**
- File: `rutba-cms/components/ProductPickerTabs.js` (extend) or new `rutba-cms/components/BulkProductPicker.js`
- Add a third tab: **"Quick Add"** that shows:
  - A list of all **categories** as collapsible sections. Each category row shows the category name, product count, and an **"Add All from [Category]"** button.
  - Below categories, a list of all **brands** with the same pattern: brand name, count, **"Add All from [Brand]"** button.
- Clicking "Add All from [X]" fetches all product documentIds for that category/brand and toggles them on.
- This allows creating a product group like "All Perfumes" or "All Nike Products" in one click instead of manually selecting hundreds of products.

**Step 17 — Streamline product-group creation flow in CMS**
- File: `rutba-cms/pages/[documentId]/product-group.js`
- Reorder the form so the most important fields come first: **Name → Layout → Priority** at the top in a compact row.
- Move Display Settings (default_sort, enable_sort_dropdown, enable_view_toggle) into a collapsible "Advanced Settings" section so they don't clutter the initial creation experience.
- Add placeholder/helper text to fields: e.g., Layout dropdown shows "Choose how products display", Priority input shows "Lower = appears first on page".
- Ensure the product picker (`ProductPickerTabs`) appears prominently right after the basic fields, so the flow is: name the group → pick a layout → bulk-add products → save.

### Phase 5: Product Group Paging & Detail Page

**Step 18 — Add Strapi custom endpoint for paginated product-group detail by slug**
- File: `pos-strapi/src/api/product-group/controllers/product-group.js`
- File: `pos-strapi/src/api/product-group/routes/01-custom-product-group.js`
- Add `GET /product-groups/by-slug/:slug` route that returns product group metadata + paginated products.
- Accepts query params: `page` (default 1), `pageSize` (default 24, max 100), `sort`.
- Uses knex to query the products link table for counting and pagination.

**Step 19 — Create web service for fetching product-group with pagination**
- File: `rutba-web/src/services/product-groups.ts` (new)
- `getProductGroupBySlug(slug, page, pageSize)` → returns `{ data, meta: { pagination } }`.

**Step 20 — Create dedicated product-group detail page**
- File: `rutba-web/src/pages/product-groups/[slug].tsx` (new)
- Full page at `/product-groups/[slug]` with SSR.
- Shows cover image hero, group name, excerpt, content.
- Product grid with pagination controls (page numbers, prev/next).
- Page size selector (12, 24, 48, 96).
- Sort dropdown (default, newest, price asc, price desc).
- URL-synced page/pageSize via shallow routing.

**Step 21 — Add "View All" link to inline product group sections**
- File: `rutba-web/src/components/cms/layouts/GroupHeader.tsx`
- Add `viewAllHref` and `totalProducts` optional props.
- Render a "View All (N) →" link next to the group heading.
- File: `rutba-web/src/components/cms/ProductGroupRenderer.tsx`
- Add `maxInlineProducts` prop (default 12).
- If group has more products than the limit, slice to limit and pass `viewAllHref` to `GroupHeader`.
- Links to `/product-groups/{slug}`.

### Phase 6: Refinements & UX Polish

**Step 22 — Add `max_inline_products` field to product-group schema**
- File: `pos-strapi/src/api/product-group/content-types/product-group/schema.json`
- Add `max_inline_products` field: integer, default `12`.
- Controls how many products are shown inline on a CMS page before showing a "View All" link.
- File: `rutba-cms/pages/[documentId]/product-group.js` — add input in Advanced Settings.
- File: `rutba-web/src/types/api/cms-page.ts` — add `max_inline_products?: number` to `CmsProductGroupInterface`.
- File: `rutba-web/src/components/cms/ProductGroupRenderer.tsx` — use `group.max_inline_products` (fallback 12) to limit displayed products inline.

**Step 23 — Hero slider: show multiple product images per slide**
- File: `rutba-web/src/components/cms/layouts/HeroSliderLayout.tsx`
- Each slide should display multiple images from the product's gallery/logo (not just one image per slide), matching the previous Swiper-based hero behavior.
- Use image panels within each slide to show product gallery images side-by-side.

**Step 24 — Add CMS page section priority fields**
- File: `pos-strapi/src/api/cms-page/content-types/cms-page/schema.json`
- Add integer fields: `excerpt_priority` (default 2), `featured_image_priority` (default 0), `content_priority` (default 98), `gallery_priority` (default 100), `related_pages_priority` (default 102).
- These control where page-owned sections (excerpt, featured image, content, gallery, related pages) appear relative to product groups in the priority-sorted rendering order.
- File: `rutba-cms/pages/[documentId]/cms-page.js` — add priority inputs to Settings sidebar.
- File: `rutba-web/src/types/api/cms-page.ts` — add priority fields to `CmsPageDetailInterface`.

**Step 25 — Unified priority-ordered page rendering**
- File: `rutba-web/src/components/cms/cms-page-content.tsx`
- Build a unified `sections` array that includes both product groups and page-owned sections (featured image, excerpt, content, gallery, related pages), each with their priority.
- Sort all sections by priority ascending and render in that order.
- This replaces the old fixed-order rendering (hero → excerpt → groups → content → gallery → related pages).

**Step 26 — Remove dedicated hero slider section from CMS pages**
- The old `hero_product_groups` relation is no longer used as a separate section. Any product group with `layout: 'hero-slider'` automatically renders as a slider in priority order alongside other groups.
- File: `rutba-cms/pages/[documentId]/cms-page.js` — remove the Hero Slider card/picker.
- File: `rutba-web/src/components/cms/cms-page-content.tsx` — merge `hero_product_groups` into `product_groups` (backward compat), with `product_groups` taking precedence for deduplication.

**Step 27 — Conditional slider rendering on public pages**
- File: `rutba-web/src/components/cms/cms-page-content.tsx`
- The slider/hero section should only render when a CMS page actually contains a product group whose `layout` is `hero-slider`. No group with that layout = no slider on the page.
- This is enforced naturally by the unified priority-ordered rendering: only groups present on the page are rendered, and each renders per its own layout field.

**Step 28 — Upgrade CMS page editor: Product Groups & Related Pages pickers**
- File: `rutba-cms/components/GroupPickerTabs.js` (**New**)
- File: `rutba-cms/components/PagePickerTabs.js` (**New**)
- File: `rutba-cms/pages/[documentId]/cms-page.js`
- Replace the simple chip-button sections for Product Groups and Related Pages with tabbed picker components that match the `ProductPickerTabs` UX:
  - **Connected** tab: shows selected items with count badge, "Clear All" button.
  - **All** tab: searchable list of all available items with toggle buttons.
  - Each item shows metadata badges (layout/priority for groups, page_type for pages) and a link to open the item's editor.

**Step 29 — Make Quick Add searchable in ProductPickerTabs**
- File: `rutba-cms/components/ProductPickerTabs.js`
- Add search inputs to the Quick Add tab so categories and brands are filterable/searchable.
- Show product counts per category/brand.

### Phase 7: Verification

**Step 30 — Test end-to-end**
- Create a product group in CMS with `hero-slider` layout, priority `1`.
- Create another with `grid-4` layout, priority `2`.
- Create another with `carousel` layout, priority `3`.
- Assign all three to a shop CMS page.
- Verify they render in priority order on the web frontend.
- Verify the hero-slider uses the custom ScrollSlider with auto-play and dots.
- Verify the carousel uses the custom ScrollSlider with arrows and scroll-snap.
- Verify no Swiper CSS or JS is loaded on shop pages.
- Verify all sections have consistent spacing, headers, and card styles.

---

## Files Summary

| File | Action |
|---|---|
| `pos-strapi/src/api/product-group/content-types/product-group/schema.json` | Add `layout` enum + `priority` integer |
| `rutba-cms/pages/[documentId]/product-group.js` | Add layout dropdown + priority input |
| `rutba-cms/pages/product-groups.js` | Show layout/priority in list |
| `rutba-cms/pages/[documentId]/cms-page.js` (or similar) | Remove brand/category group pickers for shop |
| `rutba-web/src/types/api/cms-page.ts` | Add layout/priority to interface |
| `rutba-web/src/components/ui/scroll-slider.tsx` | **New** — custom CSS scroll-snap slider primitive |
| `rutba-web/src/components/cms/layouts/GroupHeader.tsx` | **New** — shared group heading component |
| `rutba-web/src/components/cms/layouts/HeroSliderLayout.tsx` | **New** — hero slider layout |
| `rutba-web/src/components/cms/layouts/Grid4Layout.tsx` | **New** — 4-col grid layout |
| `rutba-web/src/components/cms/layouts/Grid6Layout.tsx` | **New** — 6-col grid layout |
| `rutba-web/src/components/cms/layouts/CarouselLayout.tsx` | **New** — horizontal carousel layout |
| `rutba-web/src/components/cms/layouts/BannerSingleLayout.tsx` | **New** — single product banner layout |
| `rutba-web/src/components/cms/layouts/ListLayout.tsx` | **New** — vertical product list layout |
| `rutba-web/src/components/cms/ProductGroupRenderer.tsx` | **New** — layout resolver |
| `rutba-web/src/components/cms/cms-page-content.tsx` | Refactor to use layout system, remove Swiper |
| `rutba-web/src/services/cms-pages.ts` | Ensure populate includes new fields |
| `rutba-cms/components/ProductPickerTabs.js` | Add bulk "Add All" buttons, "Quick Add" tab, "Remove All" |
| `rutba-cms/pages/[documentId]/product-group.js` | Streamline creation form layout and field ordering |
| `pos-strapi/src/api/product-group/controllers/product-group.js` | Add `findBySlug` paginated action |
| `pos-strapi/src/api/product-group/routes/01-custom-product-group.js` | Add `by-slug/:slug` route |
| `rutba-web/src/services/product-groups.ts` | **New** — product group detail service with pagination |
| `rutba-web/src/pages/product-groups/[slug].tsx` | **New** — dedicated product group page with pagination |
| `rutba-web/src/components/cms/layouts/GroupHeader.tsx` | Add `viewAllHref` + `totalProducts` props |
| `rutba-web/src/components/cms/ProductGroupRenderer.tsx` | Add `maxInlineProducts` prop, limit inline, pass View All link |
| `pos-strapi/src/api/cms-page/content-types/cms-page/schema.json` | Add section priority integer fields |
| `rutba-cms/components/GroupPickerTabs.js` | **New** — tabbed product group picker for CMS page editor |
| `rutba-cms/components/PagePickerTabs.js` | **New** — tabbed related pages picker for CMS page editor |

---

## Notes

- Priority is an integer. Lower number = appears first on the page. Groups with same priority render in the order returned by Strapi.
- The `hero-slider` layout replaces the old `hero_product_groups` concept. Eventually you can deprecate that relation and just use `product_groups` with `layout: 'hero-slider'`.
- Brand and category groups are NOT removed from the Strapi schema (backward compatible). They are just no longer rendered on shop pages.
- Each layout component should be self-contained and reusable.
- **No Swiper dependency** on shop pages. The custom `<ScrollSlider>` uses native CSS scroll-snap which is supported in all modern browsers, is lighter, and gives full control over styling.
- The `<ScrollSlider>` component lives in `components/ui/` following the shadcn/ui pattern — it's a low-level primitive that can be reused anywhere in the app (homepage, other pages) whenever a carousel is needed.
- Visual cohesion is enforced through shared `<GroupHeader>`, consistent section wrappers in `<ProductGroupRenderer>`, and the same `ProductCard` across all layouts.
- **Unified page rendering**: All page content (product groups + page-owned sections like excerpt, content, gallery, related pages) is rendered in a single priority-sorted sequence. Each section type has its own priority field.
- **Conditional slider**: The hero/slider area only appears when a product group with `layout: 'hero-slider'` is assigned to the page. No fallback or always-on slider.
- **CMS editor consistency**: Product Groups and Related Pages pickers on the CMS page editor use the same tabbed/searchable pattern as the product picker on the product-group editor (`ProductPickerTabs`), via `GroupPickerTabs` and `PagePickerTabs`.
- **`max_inline_products`**: Each product group defines how many products to show inline on a CMS page. Excess products are accessible via a "View All" link to the dedicated product-group detail page.
