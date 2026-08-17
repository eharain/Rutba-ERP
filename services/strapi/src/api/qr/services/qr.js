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
 *
 * The same resolver also backs the storefront's short links,
 * `<storefront>/s/<base32(product.id)>`. Short codes are handled here rather
 * than in their own endpoint so that a short link inherits the disambiguation
 * and outage behaviour the QR landing route already has, and so that a printed
 * QR can carry either form. See `preferShortCode` below for why the two
 * namespaces rank the same matches differently.
 */

const { decodeShortCode } = require('@rutba/api-provider/lib/short-code.cjs');

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

const PRODUCT_TARGET = TARGETS.find((t) => t.kind === 'product');

/**
 * Resolve `/s/<code>` — a Crockford Base32 encoding of `product.id`.
 *
 * Draft & publish gives every product two rows sharing a documentId and
 * carrying *different* numeric ids, so a code minted from the draft version
 * will not match the published one, and vice versa. Rather than pick a version
 * and hope every generator agrees, accept either id: look for a published row
 * with that id first, then fall back to locating the document by its draft id
 * and re-reading the published version. An unpublished product still resolves
 * to nothing, which is the behaviour the rest of this service already has.
 *
 * @returns {Promise<object|null>} a published product row, or null
 */
async function findProductByShortCode(strapi, code) {
  const id = decodeShortCode(code);
  if (id === null) return null;

  const read = (filters, extra = {}) => strapi.documents(PRODUCT_TARGET.uid).findMany({
    filters,
    status: 'published',
    fields: PRODUCT_TARGET.fields,
    populate: PRODUCT_TARGET.populate,
    pagination: { pageSize: 1 },
    ...extra,
  });

  const published = await read({ id: { $eq: id } });
  if (published?.length) return published[0];

  const draft = await strapi.documents(PRODUCT_TARGET.uid).findMany({
    filters: { id: { $eq: id } },
    status: 'draft',
    fields: ['name'],
    pagination: { pageSize: 1 },
  });
  const documentId = draft?.[0]?.documentId;
  if (!documentId) return null;

  const viaDocument = await read({ documentId: { $eq: documentId } });
  return viaDocument?.[0] ?? null;
}

module.exports = ({ strapi }) => ({
  /**
   * @param {string} rawCode value scanned out of the QR, or typed after `/s/`
   * @param {object} [options]
   * @param {boolean} [options.preferShortCode] the code arrived through `/s/`,
   *   the id-only namespace, so a Base32 hit outranks everything else.
   *
   *   The default is the opposite, and the asymmetry is load-bearing. Almost
   *   every short lowercase slug is also valid Base32 — "sale" decodes to
   *   829486 — so on `/qr/<code>`, where the code is far more likely to be a
   *   slug someone printed, a short-code hit is only used when nothing else
   *   matched. Under `/s/` the namespace itself states the intent, so the
   *   decode wins.
   * @returns {Promise<Array<object>>} published matches, most authoritative first
   */
  async resolve(rawCode, options = {}) {
    const code = String(rawCode ?? '').trim();
    if (!code) return [];
    const preferShortCode = options.preferShortCode === true;

    const matches = [];

    const shortRow = await findProductByShortCode(strapi, code);
    const shortMatch = shortRow ? {
      kind: PRODUCT_TARGET.kind,
      label: PRODUCT_TARGET.label,
      documentId: shortRow.documentId,
      slug: shortRow.slug ?? null,
      title: PRODUCT_TARGET.title(shortRow) || shortRow.slug || code,
      subtitle: PRODUCT_TARGET.subtitle(shortRow),
      image: PRODUCT_TARGET.image(shortRow),
      path: PRODUCT_TARGET.path(shortRow),
      matched_on: 'short_code',
    } : null;

    // Under `/s/` a decoded id is the answer, not a candidate — return before
    // spending four more queries on slug lookups that could only add noise.
    if (preferShortCode && shortMatch) return [shortMatch];

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
    if (exact.length) return exact;

    // Last resort on `/qr/`: a code nothing else claims may still be a short
    // link someone printed or pasted. Only reached when the slug lookups came
    // back empty, so this can never demote a real slug.
    if (!matches.length && shortMatch) return [shortMatch];

    return matches;
  },
});
