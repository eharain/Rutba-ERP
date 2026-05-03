/**
 * WebCmsPagesEndpoints
 * Storefront-facing endpoint path + params for the /cms-pages resource.
 * All paths are relative (no leading slash) for direct BASE_URL + path concatenation.
 */

const CMS_LIST_FIELDS = [
  "title", "slug", "excerpt", "page_type", "sort_order",
  "enable_contact_form", "createdAt", "updatedAt", "publishedAt",
];

const CMS_LIST_POPULATE = ["featured_image", "background_image"];

const CMS_DETAIL_FIELDS = [
  "title", "slug", "excerpt", "content", "page_type", "sort_order",
  "enable_contact_form", "createdAt", "updatedAt", "publishedAt",
  "excerpt_priority", "featured_image_priority", "content_priority",
  "gallery_priority", "related_pages_priority",
];

const CMS_DETAIL_POPULATE = [
  "featured_image",
  "background_image",
  "gallery",
  "hero_product_groups.products.gallery",
  "hero_product_groups.products.logo",
  "hero_product_groups.products.brands",
  "hero_product_groups.products.categories",
  "hero_product_groups.products.variants",
  "hero_product_groups.products.variants.terms",
  "hero_product_groups.products.variants.terms.term_types",
  "hero_product_groups.cover_image",
  "hero_product_groups.offers",
  "brand_groups.brands.logo",
  "category_groups.categories.logo",
  "product_groups.products.gallery",
  "product_groups.products.logo",
  "product_groups.products.brands",
  "product_groups.products.categories",
  "product_groups.products.variants",
  "product_groups.products.variants.terms",
  "product_groups.products.variants.terms.term_types",
  "product_groups.cover_image",
  "product_groups.offers",
  "related_pages.featured_image",
  "footer.pinned_pages",
];

export const WebCmsPagesEndpoints = {
  /**
   * List all CMS pages (summary fields only).
   * @param pageSize - pagination size (default 50)
   */
  list: (pageSize = 50) => ({
    path: "cms-pages",
    params: {
      sort: ["sort_order:asc", "createdAt:desc"],
      fields: CMS_LIST_FIELDS,
      populate: CMS_LIST_POPULATE,
      pagination: { pageSize },
    },
  }),

  /**
   * List CMS pages filtered by page_type.
   * @param pageType - the page_type enum value to filter on
   * @param pageSize - pagination size (default 50)
   */
  listByType: (pageType: string, pageSize = 50) => ({
    path: "cms-pages",
    params: {
      filters: { page_type: { $eq: pageType } },
      sort: ["sort_order:asc", "createdAt:desc"],
      fields: CMS_LIST_FIELDS,
      populate: CMS_LIST_POPULATE,
      pagination: { pageSize },
    },
  }),

  /**
   * Fetch a single CMS page by slug (full detail populate).
   * @param slug - the page slug
   */
  bySlug: (slug: string) => ({
    path: "cms-pages",
    params: {
      filters: { slug: { $eq: slug } },
      fields: CMS_DETAIL_FIELDS,
      populate: CMS_DETAIL_POPULATE,
    },
  }),

  /**
   * Fetch the index/header-level CMS page data (for nav/footer).
   * Used by the site header — fetches the "index" slug with minimal populate.
   */
  header: () => ({
    path: "cms-pages",
    params: {
      filters: { slug: { $eq: "index" } },
      fields: [
        "title", "slug", "excerpt", "content", "page_type", "sort_order",
        "enable_contact_form", "createdAt", "updatedAt", "publishedAt",
      ],
      populate: [
        "brand_groups.brands.logo",
        "category_groups.categories",
        "footer.pinned_pages",
      ],
    },
  }),
};
