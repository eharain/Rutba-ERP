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

const populate = {
    featured_image: true,
    background_image: true,
    gallery: true,

    hero_product_groups: {
        populate: {
            cover_image: true,
            offers: true,
            products: {
                populate: {
                    gallery: true,
                    logo: true,
                    brands: true,
                    categories: true,
                    variants: {
                        populate: {
                            terms: { populate: { term_types: true } }
                        }
                    }
                }
            }
        }
    },

    brand_groups: {
        populate: {
            brands: { populate: { logo: true } }
        }
    },

    category_groups: {
        populate: {
            categories: { populate: { logo: true } }
        }
    },

    product_groups: {
        populate: {
            cover_image: true,
            offers: true,
            products: {
                populate: {
                    gallery: true,
                    logo: true,
                    brands: true,
                    categories: true,
                    variants: {
                        populate: {
                            terms: { populate: { term_types: true } }
                        }
                    }
                }
            }
        }
    },

    related_pages: {
        populate: {
            featured_image: true
        }
    },

    footer: {
        populate: {
            pinned_pages: true
        }
    },
};

export const WebCmsPagesEndpoints = {
  list: (pageSize = 50) => ({
    path: '/cms-pages',
    method: 'get',
    params: {
      sort: ['sort_order:asc', 'createdAt:desc'],
      fields: CMS_LIST_FIELDS,
      populate: CMS_LIST_POPULATE,
      pagination: { pageSize },
    },
  }),

  listByType: (pageType, pageSize = 50) => ({
    path: '/cms-pages',
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
    path: '/cms-pages',
    method: 'get',
    params: {
      filters: { slug: { $eq: slug } },
      fields: CMS_DETAIL_FIELDS,
      populate: populate,
    },
  }),

  header: () => ({
    path: '/cms-pages',
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
