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
  list: (filter = {}, page = '1') => {
    const sort = (() => {
      if (filter?.sort === 'price-low-high') return ['selling_price:ASC', 'name:ASC'];
      if (filter?.sort === 'price-high-low') return ['selling_price:DESC', 'name:ASC'];
      return ['createdAt:DESC'];
    })();

    return {
      path: 'products',
      method: 'get',
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

  detail: (slug) => ({
    path: `products/${slug}`,
    method: 'get',
    params: {
      fields: [
        'name', 'sku', 'barcode', 'selling_price', 'cost_price', 'offer_price',
        'stock_quantity', 'summary', 'description', 'is_variant', 'is_active', 'keywords',
      ],
      populate: {
        gallery: true,
        logo: true,
        brands: true,
        categories: true,
        terms: { populate: { term_types: true } },
        variants: {
          fields: ['name', 'sku', 'barcode', 'selling_price', 'cost_price', 'offer_price', 'stock_quantity', 'summary', 'description', 'is_variant'],
          populate: {
            gallery: true,
            logo: true,
            terms: { populate: { term_types: true } },
          },
        },
      },
    },
  }),

  featured: () => ({
    path: 'product-groups',
    method: 'get',
    params: {
      populate: {
        products: { populate: PRODUCT_POPULATE },
      },
    },
  }),

  search: (search, pageSize = 5) => ({
    path: 'products',
    method: 'get',
    params: {
      populate: PRODUCT_POPULATE,
      pagination: { limit: pageSize },
      filters: { name: { $contains: search } },
    },
  }),

  byIds: (idProducts = []) => ({
    path: 'products',
    method: 'get',
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

  highestPrice: () => ({
    path: 'products',
    method: 'get',
    params: {
      pagination: { limit: 1 },
      sort: ['selling_price:DESC', 'id:ASC'],
      populate: ['gallery', 'variants', 'brands', 'categories', 'logo'],
    },
  }),
};
