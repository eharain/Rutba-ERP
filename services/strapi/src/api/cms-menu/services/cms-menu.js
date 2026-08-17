'use strict';

/**
 * cms-menu service
 *
 * Resolves the polymorphic cms-menu-item link targets into a flat
 * { label, href } nav tree on the server so the storefront stays free of the
 * populate sprawl.
 */

const { createCoreService } = require('@strapi/strapi').factories;

// Guard against draft nested relations leaking through the published parent.
const PUBLISHED_FILTER = { filters: { publishedAt: { $notNull: true } } };

// Link-target populate, reused for both top-level items and their children.
const LINK_POPULATE = {
  icon_image: { fields: ['url', 'alternativeText'] },
  cms_page: { fields: ['title', 'slug', 'page_type'] },
  page_group: { fields: ['name', 'slug'] },
  product_group: { fields: ['name', 'slug'] },
  mega_category_group: {
    fields: ['name'],
    populate: {
      categories: {
        ...PUBLISHED_FILTER,
        fields: ['name', 'slug', 'summary'],
        populate: { logo: { fields: ['url', 'alternativeText'] } },
      },
    },
  },
  mega_brand_group: {
    fields: ['name'],
    populate: {
      brands: {
        ...PUBLISHED_FILTER,
        fields: ['name', 'slug'],
        populate: { logo: { fields: ['url', 'alternativeText'] } },
      },
    },
  },
};

const ITEM_POPULATE = {
  ...LINK_POPULATE,
  // parent only needs to exist so we can drop child items from the top level;
  // children are reached via this relation (mappedBy parent) so a child item
  // never needs its own `menu` set.
  parent: { fields: ['documentId'] },
  children: {
    ...PUBLISHED_FILTER,
    sort: ['order:asc'],
    populate: LINK_POPULATE,
  },
};

function resolveHref(item) {
  switch (item.link_kind) {
    case 'cms_page':
      return item.cms_page?.slug
        ? `/${item.cms_page.page_type || 'info'}/${item.cms_page.slug}`
        : null;
    case 'page_group':
      return item.page_group?.slug ? `/page-group/${item.page_group.slug}` : null;
    case 'product_group':
      return item.product_group?.slug ? `/product-groups/${item.product_group.slug}` : null;
    case 'collection':
      return item.collection_slug
        ? `/product?collection=${encodeURIComponent(item.collection_slug)}`
        : null;
    case 'url':
      return item.url || null;
    case 'mega':
    default:
      return null;
  }
}

// When an item has no explicit label, fall back to the name/title of the
// entity it points to so authors can leave the label blank and still get a
// sensible nav caption that tracks the target's current name.
function deriveLabel(item) {
  switch (item.link_kind) {
    case 'cms_page':
      return item.cms_page?.title || null;
    case 'page_group':
      return item.page_group?.name || null;
    case 'product_group':
      return item.product_group?.name || null;
    case 'mega':
      return item.mega_category_group?.name || item.mega_brand_group?.name || null;
    case 'collection':
      return item.collection_slug || null;
    case 'url':
      return item.url || null;
    default:
      return null;
  }
}

function resolveItem(item, withChildren = true) {
  const node = {
    label: item.label || deriveLabel(item) || '',
    kind: item.link_kind,
    href: resolveHref(item),
    openInNew: !!item.open_in_new,
    image: item.icon_image?.url || null,
  };

  if (item.link_kind === 'mega') {
    node.brands = (item.mega_brand_group?.brands || []).map((b) => ({
      name: b.name,
      slug: b.slug,
      logo: b.logo?.url || null,
    }));
    node.categories = (item.mega_category_group?.categories || []).map((c) => ({
      name: c.name,
      slug: c.slug,
      short_description: c.summary || null,
    }));
  }

  // One rendered level of nesting; grandchildren are ignored by design.
  if (withChildren && Array.isArray(item.children) && item.children.length) {
    node.children = item.children
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((c) => resolveItem(c, false));
  }

  return node;
}

module.exports = createCoreService('api::cms-menu.cms-menu', ({ strapi }) => ({
  async findPublicTree() {
    const menus = await strapi.documents('api::cms-menu.cms-menu').findMany({
      filters: { enabled: { $eq: true } },
      status: 'published',
      fields: ['name', 'slug', 'title', 'position', 'is_default'],
      populate: {
        items: { ...PUBLISHED_FILTER, populate: ITEM_POPULATE },
        pages: { fields: ['slug'] },
      },
      pagination: { pageSize: 100 },
    });

    return (menus || []).map((menu) => {
      // Top-level items are those without a parent; children arrive nested via
      // each item's `children` relation, so they're skipped here.
      const topLevel = (menu.items || [])
        .filter((it) => !it.parent?.documentId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((it) => resolveItem(it));

      // A menu with no page assignments is the site-wide default for its
      // position; one assigned to pages applies only to those pages.
      const pageSlugs = (menu.pages || []).map((p) => p.slug).filter(Boolean);

      return {
        name: menu.name,
        slug: menu.slug,
        title: menu.title || null,
        position: menu.position,
        // Explicit default occupier for its position (applies to every page
        // that doesn't assign its own menu for the position).
        isDefault: !!menu.is_default,
        // Back-compat: a menu with no page assignments is also treated as a
        // site-wide default for its position.
        global: pageSlugs.length === 0,
        pageSlugs,
        items: topLevel,
      };
    });
  },
}));
