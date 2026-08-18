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
//
// Explicit false-or-null, for the same reason ACTIVE_PRODUCT_FILTER is
// true-or-null: `$ne` compiles to a bare `is_variant <> true`, which is UNKNOWN
// — not true — for NULL, so a `$ne: true` test silently drops every row that
// predates the field. The schema default of `false` only fires for rows created
// through Strapi after it was added; legacy and bulk-imported products carry
// NULL. That is what emptied whole product-group pages (miss-rose, j.perfumes)
// and hid their products from the shop grid while the JS-side twin below, which
// reads `!p.is_variant`, kept treating those same rows as non-variants.
const NOT_A_VARIANT = {
  $or: [{ is_variant: { $eq: false } }, { is_variant: { $null: true } }],
};

/**
 * Of `candidateIds` (product row ids), return the Set that has at least one
 * image — its own gallery/logo, or one on any of its variants.
 *
 * Media live in the files_related_mph morph table, which Strapi filters can't
 * reach, so this resolves the id set up front and callers AND `{ id: { $in } }`
 * into their normal filters — keeping pagination and counts exact. Queries are
 * bounded by the candidate set (pinned ids / one group's ids), never the whole
 * catalog.
 *
 * `variantStatuses` picks which variant versions may lend their image to the
 * parent. The storefront default is published-only: a draft variant's photo is
 * not on the live site, so it must not make a parent look listable. The publish
 * gate passes ['draft', 'published'] instead — see documentHasAnyImage.
 */
async function imagedProductIdSet(
  strapi,
  candidateIds,
  { variantStatuses = ['published'] } = {}
) {
  const ids = Array.from(new Set((candidateIds ?? []).filter(Boolean)));
  if (ids.length === 0) return new Set();

  // Variants of the candidates: a parent whose only photos live on its colour
  // variants still has something to render (the card/gallery fall back to them).
  // One query per requested status — the document service resolves exactly one
  // version per call, so 'any version' has to be a union, not an omitted arg
  // (omitting `status` returns drafts only, which would silently narrow this).
  const variantRowSets = await Promise.all(
    variantStatuses.map((status) =>
      strapi.documents('api::product.product').findMany({
        status,
        filters: { parent: { id: { $in: ids } } },
        fields: ['id'],
        populate: { parent: { fields: ['id'] } },
        pagination: { pageSize: Math.max(ids.length * 8, 500) },
      })
    )
  );
  const parentOf = new Map();
  for (const v of variantRowSets.flat()) {
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

/**
 * Does this product DOCUMENT carry an image anywhere? The question the publish
 * gate asks, so it works from a documentId rather than a row id.
 *
 * Both version rows count: media hang off the draft being published, and off
 * the published row when re-publishing. Variants count at ANY status — see the
 * note on the gate in api/product/publish-image-guard.js for why the publish
 * gate is deliberately looser here than the storefront listing gate.
 */
async function documentHasAnyImage(strapi, documentId) {
  if (!documentId) return false;

  const rowIds = await productRowIdsOfDocument(strapi, documentId);
  if (rowIds.length === 0) return false;

  // A variant is sold from its parent's page and never gets a card of its own,
  // so the parent's photography covers it — the same credit publicAvailabilityFor
  // gives a variant detail page. Adding the parent's rows to the candidate set
  // also lets a sibling variant's photo count, which is right for the same
  // reason: the page the shopper lands on is the parent's, and it renders.
  const parentDocumentId = await parentDocumentIdOf(strapi, documentId);
  if (parentDocumentId) {
    rowIds.push(...(await productRowIdsOfDocument(strapi, parentDocumentId)));
  }

  const imaged = await imagedProductIdSet(strapi, rowIds, {
    variantStatuses: ['draft', 'published'],
  });
  return imaged.size > 0;
}

/**
 * The documentIds of every product carrying an image — the whole-catalog
 * counterpart of imagedProductIdSet, for callers that filter a LIST rather than
 * test a known candidate set.
 *
 * imagedProductIdSet is deliberately bounded by its candidate ids; handing it
 * the entire catalog would put thousands of ids into an IN clause and into a
 * document-service filter on every request. This answers the same question from
 * the other end — start at the media table (which is what is actually scarce)
 * and walk out to the products — in three bounded queries, whatever the catalog
 * size.
 *
 * Same rule as everywhere else: a product counts as imaged via its own media OR
 * any variant's, at any publish status. (Variant status is not filtered here,
 * matching the publish gate rather than the storefront listing gate: a picker
 * offering products to photograph a post around should see the photo that
 * exists, not only the one that is already live.)
 */
async function imagedProductDocumentIdSet(strapi) {
  const knex = strapi.db.connection;

  const imagedRowIds = (
    await knex('files_related_mph')
      .where('related_type', 'api::product.product')
      .whereIn('field', ['gallery', 'logo'])
      .distinct('related_id')
  ).map((r) => Number(r.related_id));
  if (imagedRowIds.length === 0) return new Set();

  // A variant's image credits its parent, so collect the parents of any imaged
  // variant rows alongside the imaged rows themselves.
  const parentRowIds = (
    await knex('products_parent_lnk')
      .whereIn('product_id', imagedRowIds)
      .select('inv_product_id')
  ).map((r) => Number(r.inv_product_id));

  const rows = await knex('products')
    .whereIn('id', [...new Set([...imagedRowIds, ...parentRowIds])])
    .select('document_id');
  return new Set(rows.map((r) => r.document_id).filter(Boolean));
}

/**
 * Row ids of both versions of a product document. Resolved against the table
 * directly (like _publishedGroupsFor) — the document service answers one
 * version per call, and callers here care about either.
 */
async function productRowIdsOfDocument(strapi, documentId) {
  const rows = await strapi.db
    .connection('products')
    .where('document_id', documentId)
    .select('id');
  return rows.map((r) => r.id);
}

/** The parent document of a variant, or null. Read off the draft — the version
 *  a publish always starts from — falling back to the published row. */
async function parentDocumentIdOf(strapi, documentId) {
  for (const status of ['draft', 'published']) {
    const row = await strapi.documents('api::product.product').findOne({
      documentId,
      status,
      fields: ['id'],
      populate: { parent: { fields: ['documentId'] } },
    });
    if (row?.parent?.documentId) return row.parent.documentId;
    if (row) return null; // found the row, it simply has no parent
  }
  return null;
}

module.exports = {
  NOT_A_VARIANT,
  imagedProductIdSet,
  imagedProductDocumentIdSet,
  hasAnyImage,
  documentHasAnyImage,
};
