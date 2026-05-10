const CMS_LIST_FIELDS = [
  'title', 'slug', 'excerpt', 'page_type', 'sort_order',
  'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt',
];

const CMS_LIST_POPULATE = ['featured_image', 'background_image'];

const CMS_DETAIL_FIELDS = [
  'title', 'slug', 'excerpt', 'content', 'page_type', 'sort_order',
  'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt',
  'excerpt_priority', 'featured_image_priority', 'content_priority',
  'gallery_priority', 'related_pages_priority',
];

const CMS_DETAIL_POPULATE = [
  'featured_image',
  'background_image',
  'gallery',
  'hero_product_groups.products.gallery',
  'hero_product_groups.products.logo',
  'hero_product_groups.products.brands',
  'hero_product_groups.products.categories',
  'hero_product_groups.products.variants',
  'hero_product_groups.products.variants.terms',
  'hero_product_groups.products.variants.terms.term_types',
  'hero_product_groups.cover_image',
  'hero_product_groups.offers',
  'brand_groups.brands.logo',
  'category_groups.categories.logo',
  'product_groups.products.gallery',
  'product_groups.products.logo',
  'product_groups.products.brands',
  'product_groups.products.categories',
  'product_groups.products.variants',
  'product_groups.products.variants.terms',
  'product_groups.products.variants.terms.term_types',
  'product_groups.cover_image',
  'product_groups.offers',
  'related_pages.featured_image',
  'footer.pinned_pages',
];

export const WebCmsPagesEndpoints = {
  list: (pageSize = 50) => ({
    path: 'cms-pages',
    method: 'get',
    params: {
      sort: ['sort_order:asc', 'createdAt:desc'],
      fields: CMS_LIST_FIELDS,
      populate: CMS_LIST_POPULATE,
      pagination: { pageSize },
    },
  }),

  listByType: (pageType, pageSize = 50) => ({
    path: 'cms-pages',
    method: 'get',
    params: {
      filters: { page_type: { $eq: pageType } },
      sort: ['sort_order:asc', 'createdAt:desc'],
      fields: CMS_LIST_FIELDS,
      populate: CMS_LIST_POPULATE,
      pagination: { pageSize },
    },
  }),

  bySlug: (slug) => ({
    path: 'cms-pages',
    method: 'get',
    params: {
      filters: { slug: { $eq: slug } },
      fields: CMS_DETAIL_FIELDS,
      populate: CMS_DETAIL_POPULATE,
    },
  }),

  header: () => ({
    path: 'cms-pages',
    method: 'get',
    params: {
      filters: { slug: { $eq: 'index' } },
      fields: [
        'title', 'slug', 'excerpt', 'content', 'page_type', 'sort_order',
        'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt',
      ],
      populate: [
        'brand_groups.brands.logo',
        'category_groups.categories',
        'footer.pinned_pages',
      ],
    },
  }),
};
