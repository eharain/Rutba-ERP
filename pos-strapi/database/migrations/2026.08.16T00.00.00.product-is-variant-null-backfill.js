'use strict';

/**
 * Normalise `products.is_variant` NULL → false.
 *
 * `is_variant` is declared `{ type: 'boolean', default: false }`, but a Strapi
 * default only fires for rows created through Strapi after the field was added.
 * Rows that predate it — and anything inserted by bulk import — carry NULL, and
 * NULL is not false to SQL. The storefront's listable gate tested
 * `{ is_variant: { $ne: true } }`, which Strapi compiles to a bare
 * `is_variant <> true` (see @strapi/database query/helpers/where.js) — UNKNOWN,
 * not true, for a NULL — so every legacy row was silently dropped from the shop
 * grid, from search, and from its product-group page. Whole groups rendered
 * empty (miss-rose, j.perfumes, alkaram-gents-latha).
 *
 * The gate itself is fixed in src/utils/public-product.js, which now tests
 * false-or-null explicitly, mirroring ACTIVE_PRODUCT_FILTER. This migration
 * closes the other half: it makes the stored data match what the schema already
 * claims, so the next `$ne`/`= false` test written against this column — in this
 * repo or in rutba-marketplace — cannot reintroduce the same class of bug.
 *
 * Only provably-parentless rows are touched. `parent` is the authoritative
 * signal: a product is genuinely a variant iff it has one, and at the time of
 * writing the flag and the relation agreed on every row where the flag was set
 * (128 true / 128 with a parent, 0 disagreements in either direction). Rows
 * carrying a parent are left alone regardless of their flag — this migration
 * normalises unset data, it does not reclassify products.
 *
 * Idempotent: re-running matches nothing, because the NULLs are gone.
 */

const PARENT_LNK_CANDIDATES = ['products_parent_lnk', 'products_parent_links'];

async function firstExistingTable(knex, names) {
  for (const name of names) {
    if (await knex.schema.hasTable(name)) return name;
  }
  return null;
}

async function up(knex) {
  if (!(await knex.schema.hasTable('products'))) {
    console.log('[is_variant] No products table — fresh DB, nothing to backfill.');
    return;
  }

  const columns = await knex('products').columnInfo();
  if (!columns.is_variant) {
    console.log('[is_variant] products.is_variant not present yet — skipping.');
    return;
  }

  const [{ count: nullCount } = {}] = await knex('products')
    .whereNull('is_variant')
    .count({ count: '*' });
  if (Number(nullCount ?? 0) === 0) {
    console.log('[is_variant] No NULL rows — already normalised.');
    return;
  }

  // Restrict to rows with no parent link. If the link table can't be located we
  // stop rather than guess: setting `false` on a row that is actually a variant
  // would put a bare "Black" card into the storefront grid, which is precisely
  // what the flag exists to prevent.
  const parentLnk = await firstExistingTable(knex, PARENT_LNK_CANDIDATES);
  if (!parentLnk) {
    console.log(
      `[is_variant] ${nullCount} NULL row(s) found but no parent link table ` +
      `(tried ${PARENT_LNK_CANDIDATES.join(', ')}) — skipping rather than ` +
      'risk flagging a real variant as a standalone product.'
    );
    return;
  }

  const lnkColumns = await knex(parentLnk).columnInfo();
  const childCol = ['product_id', 'child_id'].find((c) => lnkColumns[c]);
  if (!childCol) {
    console.log(
      `[is_variant] "${parentLnk}" has no recognised child column ` +
      `(${Object.keys(lnkColumns).join(', ')}) — skipping.`
    );
    return;
  }

  const updated = await knex('products')
    .whereNull('is_variant')
    .whereNotIn('id', knex(parentLnk).select(childCol))
    .update({ is_variant: false });

  const remaining = await knex('products').whereNull('is_variant').count({ count: '*' });
  const left = Number(remaining?.[0]?.count ?? 0);

  console.log(`[is_variant] Set is_variant=false on ${updated} parentless row(s).`);
  if (left > 0) {
    // Rows that kept NULL do have a parent, so they are real variants whose flag
    // was never written. Reported, not rewritten: flipping them to true would
    // remove products from the storefront, and that is an editorial call.
    console.log(
      `[is_variant] ${left} NULL row(s) left untouched because they carry a ` +
      'parent — these look like unflagged variants and want a human decision.'
    );
  }
}

async function down() {
  // Deliberately irreversible. The pre-migration state was "NULL means nobody
  // ever set this", which is indistinguishable from a deliberate false once
  // written — and restoring NULL would re-break the storefront.
}

module.exports = { up, down };
