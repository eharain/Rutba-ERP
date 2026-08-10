'use strict';

/**
 * Shared storefront-visibility helpers, used by every surface that renders
 * product cards (shop list/search, product-group pages, CMS home groups).
 *
 * The public gate a product must pass to be LISTED for online sale:
 *   published  — Strapi status, applied by each caller
 *   active     — ACTIVE_PRODUCT_FILTER (is_active true-or-null)
 *   not a variant — colour/design variants belong on their parent's page
 *   pinned     — in at least one published product-group (the editorial gate)
 *   has image  — an own gallery/logo image, or one on any of its variants
 *
 * A product failing the pinned/image legs is hidden from all lists but its
 * detail page still renders in a "temporarily offline" state (no purchase) —
 * printed QR labels resolve to /product/<slug> for any published product, so
 * a hard 404 there would kill labels at scan time.
 */

// A bare variant card named "Black" in a grid is never right, even if someone
// pins one into a product-group by mistake.
const NOT_A_VARIANT = { is_variant: { $ne: true } };

/**
 * Of `candidateIds` (product row ids), return the Set that has at least one
 * image — its own gallery/logo, or one on any of its published variants.
 *
 * Media live in the files_related_mph morph table, which Strapi filters can't
 * reach, so this resolves the id set up front and callers AND `{ id: { $in } }`
 * into their normal filters — keeping pagination and counts exact. Queries are
 * bounded by the candidate set (pinned ids / one group's ids), never the whole
 * catalog.
 */
async function imagedProductIdSet(strapi, candidateIds) {
  const ids = Array.from(new Set((candidateIds ?? []).filter(Boolean)));
  if (ids.length === 0) return new Set();

  // Variants of the candidates: a parent whose only photos live on its colour
  // variants still has something to render (the card/gallery fall back to them).
  const variantRows = await strapi.documents('api::product.product').findMany({
    status: 'published',
    filters: { parent: { id: { $in: ids } } },
    fields: ['id'],
    populate: { parent: { fields: ['id'] } },
    pagination: { pageSize: Math.max(ids.length * 8, 500) },
  });
  const parentOf = new Map();
  for (const v of variantRows ?? []) {
    if (v?.id && v?.parent?.id) parentOf.set(v.id, v.parent.id);
  }

  const knex = strapi.db.connection;
  const rows = await knex('files_related_mph')
    .where('related_type', 'api::product.product')
    .whereIn('field', ['gallery', 'logo'])
    .whereIn('related_id', [...ids, ...parentOf.keys()])
    .distinct('related_id');

  const imaged = new Set();
  for (const r of rows) {
    const rid = Number(r.related_id);
    imaged.add(parentOf.get(rid) ?? rid); // credit a variant's image to its parent
  }
  return new Set(ids.filter((id) => imaged.has(id)));
}

/** JS-side twin of the image leg, for rows whose media are already populated. */
function hasAnyImage(product) {
  if (!product) return false;
  const own = (product.gallery?.length ?? 0) > 0 || !!product.logo;
  if (own) return true;
  return (product.variants ?? []).some(
    (v) => (v?.gallery?.length ?? 0) > 0 || !!v?.logo
  );
}

module.exports = { NOT_A_VARIANT, imagedProductIdSet, hasAnyImage };
