'use strict';

/**
 * qr service — turns a scanned QR token into storefront destination(s).
 *
 * Printed material (product labels, packaging, flyers, shop signage) encodes
 * `<storefront>/qr/<code>`. `code` is deliberately un-typed: it may be the
 * slug of a CMS page, a CMS page-group, a product-group or a product, or a
 * product's dedicated `qr_code` token. Printing a single URL shape means a
 * code stays valid when the thing behind it is re-modelled, and one QR
 * generator in rutba-cms covers every entity.
 *
 * Codes are NOT unique across content types — a "summer-sale" CMS page and a
 * "summer-sale" product-group can coexist — so this returns *every* published
 * match and leaves the choice to the caller: one match → redirect, several →
 * let the visitor pick.
 */

// Storefront route shapes. These mirror rutba-web/src/pages and the CMS-side
// builders in rutba-cms/lib/cmsPageWebUrl.js — keep the three in step. Paths
// are returned host-relative; the caller owns the origin.
const CMS_PAGE_SEGMENTS = new Set(['shop', 'blog', 'news', 'info']);

function cmsPagePath(entity) {
  if (entity.slug === 'index') return '/';
  const type = entity.page_type || 'shop';
  const segment = CMS_PAGE_SEGMENTS.has(type) ? type : 'page';
  return `/${segment}/${encodeURIComponent(entity.slug)}`;
}

// Each target declares how to find a code and how to describe what was found.
// `keys` is ordered by authority: an explicit qr_code beats a slug that only
// happens to collide.
const TARGETS = [
  {
    kind: 'product',
    label: 'Product',
    uid: 'api::product.product',
    // documentId last: products predating the slug rollout have no slug, so
    // their labels encode the documentId — the same fallback findPublicDetail
    // already honours.
    keys: ['qr_code', 'slug', 'documentId'],
    fields: ['name', 'slug', 'sku', 'qr_code'],
    populate: { logo: true },
    title: (e) => e.name,
    subtitle: (e) => e.sku || null,
    image: (e) => e.logo?.url || null,
    // findPublicDetail accepts a slug or a documentId, so rows predating the
    // slug rollout still resolve.
    path: (e) => `/product/${encodeURIComponent(e.slug || e.documentId)}`,
  },
  {
    kind: 'product-group',
    label: 'Collection',
    uid: 'api::product-group.product-group',
    keys: ['slug'],
    fields: ['name', 'title', 'slug'],
    populate: { cover_image: true },
    title: (e) => e.title || e.name,
    subtitle: () => null,
    image: (e) => e.cover_image?.url || null,
    path: (e) => `/product-groups/${encodeURIComponent(e.slug)}`,
  },
  {
    kind: 'cms-page',
    label: 'Page',
    uid: 'api::cms-page.cms-page',
    keys: ['slug'],
    fields: ['title', 'slug', 'page_type'],
    populate: { featured_image: true },
    title: (e) => e.title,
    subtitle: (e) => e.page_type || null,
    image: (e) => e.featured_image?.url || null,
    path: cmsPagePath,
  },
  {
    kind: 'cms-page-group',
    label: 'Page group',
    uid: 'api::cms-page-group.cms-page-group',
    keys: ['slug'],
    fields: ['name', 'title', 'slug'],
    populate: { cover_image: true },
    title: (e) => e.title || e.name,
    subtitle: () => null,
    image: (e) => e.cover_image?.url || null,
    path: (e) => `/page-group/${encodeURIComponent(e.slug)}`,
  },
];

const MAX_MATCHES_PER_TARGET = 5;

module.exports = ({ strapi }) => ({
  /**
   * @param {string} rawCode value scanned out of the QR
   * @returns {Promise<Array<object>>} published matches, most authoritative first
   */
  async resolve(rawCode) {
    const code = String(rawCode ?? '').trim();
    if (!code) return [];

    const matches = [];

    for (const target of TARGETS) {
      for (const key of target.keys) {
        const rows = await strapi.documents(target.uid).findMany({
          filters: { [key]: { $eq: code } },
          status: 'published',
          fields: target.fields,
          populate: target.populate,
          pagination: { pageSize: MAX_MATCHES_PER_TARGET },
        });

        for (const row of rows ?? []) {
          // A row can satisfy two keys (qr_code === slug); keep the first,
          // which is the more authoritative one by `keys` order.
          if (matches.some((m) => m.kind === target.kind && m.documentId === row.documentId)) continue;
          matches.push({
            kind: target.kind,
            label: target.label,
            documentId: row.documentId,
            slug: row.slug ?? null,
            title: target.title(row) || row.slug || code,
            subtitle: target.subtitle(row),
            image: target.image(row),
            path: target.path(row),
            matched_on: key,
          });
        }
      }
    }

    // An explicit qr_code token is an unambiguous statement of intent: when one
    // exists, incidental slug collisions elsewhere must not turn a direct scan
    // into a disambiguation prompt.
    const exact = matches.filter((m) => m.matched_on === 'qr_code');
    return exact.length ? exact : matches;
  },
});
