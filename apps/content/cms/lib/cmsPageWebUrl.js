import { APP_URLS } from "@rutba/pos-shared/lib/roles";

function webBase() {
    return (APP_URLS.web || "").replace(/\/$/, "");
}

function withDraft(url, draft) {
    if (!draft) return url;
    return url.includes("?") ? `${url}&draft=true` : `${url}?draft=true`;
}

// Map a cms-page `page_type` + `slug` to its rutba-web public URL.
// The `index` slug is the storefront home; otherwise the `page_type`
// picks the route (shop/blog/news/info), and unknown types fall back
// to the /page/[slug] compatibility route.
export function buildCmsPageWebUrl(page, { draft = false } = {}) {
    if (!page?.slug) return null;
    const base = webBase();
    const slug = page.slug;
    const type = page.page_type || "shop";

    let path;
    if (slug === "index") {
        path = "/";
    } else {
        const segment =
            type === "blog" ? "blog" :
            type === "news" ? "news" :
            type === "info" ? "info" :
            type === "shop" ? "shop" :
            "page";
        path = `/${segment}/${encodeURIComponent(slug)}`;
    }

    return withDraft(`${base}${path}`, draft);
}

// Product detail. Canonical URL is /product/{slug}; we fall back to
// documentId only when a row hasn't been resaved since the slug rollout —
// the server's findPublicDetail accepts either form so the URL still works.
export function buildProductWebUrl(product, { draft = false } = {}) {
    const key = product?.slug || product?.documentId;
    if (!key) return null;
    return withDraft(`${webBase()}/product/${encodeURIComponent(key)}`, draft);
}

// Product group detail page — /product-groups/[slug] where slug is the
// group's `slug` field.
export function buildProductGroupWebUrl(group, { draft = false } = {}) {
    if (!group?.slug) return null;
    return withDraft(`${webBase()}/product-groups/${encodeURIComponent(group.slug)}`, draft);
}

// CMS page-group detail page — /page-group/[slug] (the flip-card grid).
export function buildPageGroupWebUrl(group, { draft = false } = {}) {
    if (!group?.slug) return null;
    return withDraft(`${webBase()}/page-group/${encodeURIComponent(group.slug)}`, draft);
}

// Brand filter page — the storefront filters /product by brand slug
// (no dedicated /brands/[slug] route).
export function buildBrandWebUrl(brand) {
    if (!brand?.slug) return null;
    return `${webBase()}/product?brand=${encodeURIComponent(brand.slug)}`;
}

// Category filter page — same /product list filtered by category slug.
export function buildCategoryWebUrl(category) {
    if (!category?.slug) return null;
    return `${webBase()}/product?category=${encodeURIComponent(category.slug)}`;
}
