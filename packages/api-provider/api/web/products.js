// `featured` queries /product-groups (different content type) so the
// PRODUCT_POPULATE block is kept here for that one call. Every /products
// endpoint is served by a server-side controller under /products/public/*
// and no longer ships populate URLs.
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

function buildListQuery(filter = {}, page = '1') {
  const params = { page };
  if (filter?.collection) params.collection = filter.collection;
  if (filter?.brand) params.brand = filter.brand;
  if (filter?.category) params.category = filter.category;
  if (filter?.minPrice != null && filter.minPrice !== '') params.minPrice = filter.minPrice;
  if (filter?.maxPrice != null && filter.maxPrice !== '') params.maxPrice = filter.maxPrice;
  if (filter?.sort) params.sort = filter.sort;
  return params;
}

export const WebProductsEndpoints = {
  list: (filter = {}, page = '1') => ({
    path: '/products/public/list',
    method: 'get',
    params: buildListQuery(filter, page),
  }),

  // `slug` here is the documentId — the storefront builds product links from
  // documentId, not a separate slug field on the product schema.
  //
  // Optional `groupId` (the source group the user clicked from) is forwarded
  // to the controller so the server can resolve the right group-level offer
  // and return its effective price under `meta.offerContext`.
  detail: (slug, groupId) => ({
    path: `/products/public/by-id/${encodeURIComponent(slug)}`,
    method: 'get',
    params: groupId ? { groupId } : {},
  }),

  // /product-groups is a different content type; keep its existing shape.
  featured: () => ({
    path: '/product-groups',
    method: 'get',
    params: {
      populate: {
        products: { populate: PRODUCT_POPULATE },
      },
    },
  }),

  search: (search, pageSize = 5) => ({
    path: '/products/public/search',
    method: 'get',
    params: { q: search, pageSize },
  }),

  byIds: (idProducts = []) => ({
    path: '/products/public/by-ids',
    method: 'get',
    params: { ids: (idProducts ?? []).join(',') },
  }),

  highestPrice: () => ({
    path: '/products/public/highest-price',
    method: 'get',
    params: {},
  }),
};
