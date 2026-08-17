'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

const BRAND_PUBLIC_FIELDS = ['name', 'slug'];
const BRAND_PUBLIC_POPULATE = { logo: true };

module.exports = createCoreService('api::brand.brand', ({ strapi }) => ({
  // Editorial gate for brands shown on the storefront: only brands that
  // appear in at least one published brand-group are returned. The relation
  // is uni-directional (brand has no inverse brand_groups field), so we walk
  // the groups → brands edges and collect ids.
  async findPublicList() {
    const groups = await strapi.documents('api::brand-group.brand-group').findMany({
      status: 'published',
      fields: ['id', 'sort_order'],
      populate: { brands: { fields: ['id'] } },
      sort: ['sort_order:ASC'],
      pagination: { pageSize: 1000 },
    });
    const ids = new Set();
    for (const g of groups ?? []) {
      for (const b of g.brands ?? []) {
        if (b?.id) ids.add(b.id);
      }
    }
    if (ids.size === 0) return [];
    return strapi.documents('api::brand.brand').findMany({
      status: 'published',
      filters: { id: { $in: Array.from(ids) } },
      fields: BRAND_PUBLIC_FIELDS,
      populate: BRAND_PUBLIC_POPULATE,
      pagination: { pageSize: Math.max(ids.size, 1) },
      sort: ['name:ASC'],
    });
  },
}));
