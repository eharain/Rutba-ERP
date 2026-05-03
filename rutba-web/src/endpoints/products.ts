/**
 * WebProductsEndpoints
 * Storefront-facing endpoint path + params for the /products resource.
 * Paths have no leading slash — they are appended directly to BASE_URL.
 */

const PRODUCT_POPULATE = {
  gallery: true,
  logo: true,
  brands: true,
  categories: true,
  variants: {
    populate: {
      terms: { populate: { term_types: true } },
    },
  },
};

export const WebProductsEndpoints = {
  /**
   * Paginated product list with optional sort/filter.
   * @param filter - optional FilterProductInterface shape
   * @param page   - page number (string, default "1")
   */
  list: (filter?: { sort?: string; collection?: string; brand?: string; category?: string; minPrice?: string; maxPrice?: string }, page: string = "1") => {
    const sort = (() => {
      if (filter?.sort === "price-low-high") return ["selling_price:ASC", "name:ASC"];
      if (filter?.sort === "price-high-low") return ["selling_price:DESC", "name:ASC"];
      return ["createdAt:DESC"];
    })();
    return {
      path: "products",
      params: {
        pagination: { pageSize: 24, page },
        populate: PRODUCT_POPULATE,
        sort,
        filters: {
          $and: [
            { collections: { slug: { $eq: filter?.collection ?? undefined } } },
            { selling_price: { $gte: filter?.minPrice ?? undefined, $lte: filter?.maxPrice ?? undefined } },
            { brands: { slug: { $eq: filter?.brand ?? undefined } } },
            { categories: { slug: { $eq: filter?.category ?? undefined } } },
          ],
        },
      },
    };
  },

  /**
   * Full product detail by slug or documentId.
   * @param slug - the product slug / documentId used in the URL
   */
  detail: (slug: string) => ({
    path: `products/${slug}`,
    params: {
      fields: [
        "name", "sku", "barcode", "selling_price", "cost_price", "offer_price",
        "stock_quantity", "summary", "description", "is_variant", "is_active", "keywords",
      ],
      populate: {
        gallery: true,
        logo: true,
        brands: true,
        categories: true,
        terms: { populate: { term_types: true } },
        variants: {
          fields: ["name", "sku", "barcode", "selling_price", "cost_price", "offer_price", "stock_quantity", "summary", "description", "is_variant"],
          populate: {
            gallery: true,
            logo: true,
            terms: { populate: { term_types: true } },
          },
        },
      },
    },
  }),

  /**
   * Featured product groups (first group's products).
   */
  featured: () => ({
    path: "product-groups",
    params: {
      populate: {
        products: { populate: PRODUCT_POPULATE },
      },
    },
  }),

  /**
   * Search products by name substring.
   * @param search - search string
   * @param pageSize - max results (default 5)
   */
  search: (search: string, pageSize = 5) => ({
    path: "products",
    params: {
      populate: PRODUCT_POPULATE,
      pagination: { limit: pageSize },
      filters: { name: { $contains: search } },
    },
  }),

  /**
   * Fetch products by an array of numeric IDs.
   * @param idProducts - array of numeric product ids
   */
  byIds: (idProducts: number[]) => ({
    path: "products",
    params: {
      populate: {
        gallery: true,
        logo: true,
        brands: true,
        categories: true,
        variants: {
          populate: {
            gallery: true,
            logo: true,
            terms: { populate: { term_types: true } },
          },
        },
      },
      filters: { id: { $in: idProducts } },
    },
  }),

  /**
   * Fetch the single highest-priced product.
   */
  highestPrice: () => ({
    path: "products",
    params: {
      pagination: { limit: 1 },
      sort: ["selling_price:DESC", "id:ASC"],
      populate: ["gallery", "variants", "brands", "categories", "logo"],
    },
  }),
};
