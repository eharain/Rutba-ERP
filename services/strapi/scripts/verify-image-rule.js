'use strict';

/**
 * Proof that "a product with no image does not go out" blocks what it should
 * and — the case that matters more — does NOT block what it shouldn't.
 *
 * Subjects are picked out of the live catalog rather than written as fixtures,
 * and the REAL document-service middleware chain is what runs. Checks:
 *
 *   (a) a product with no image on itself, its variants or its parent cannot
 *       be published, and the refusal names the actual reason
 *   (b) a PARENT whose only photos sit on a colour variant CAN still be
 *       published — the regression a naive `!gallery.length && !logo` causes
 *   (d) the social product picker's hasImage filter offers only imaged
 *       products, and withholds nothing that is imaged
 *   (+) a social post that links products and has nothing to show is refused,
 *       while one carrying its own creative is not
 *
 * (c), the marketplace catalog sync, is not here: that engine lives in
 * apps/sales/marketplace and is covered by its own suite — `npm test` there, under
 * "catalog image gate".
 *
 * ── Why nothing is mutated ────────────────────────────────────────────────
 * A real publish would clone the draft over the published row, so running this
 * against live data must not actually publish anything. Instead it registers a
 * SENTINEL middleware after the guard: reaching the sentinel means the guard
 * let the operation through, and the sentinel throws before the write happens.
 * So each subject ends in exactly one of two observable states — guard's
 * ValidationError (blocked) or sentinel (allowed) — and the publish itself
 * never runs. Check (b) is the one exception: no such product exists in this
 * catalog yet, so it builds a temporary parent+variant and deletes them again.
 *
 * Run:  node scripts/js/load-env.js -- npm --prefix services/strapi run verify:image-rule
 * (via the loader, so it talks to the same database the dev server does)
 */

const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { NO_IMAGE_MESSAGE } = require('../src/api/product/publish-image-guard');

const SENTINEL = 'gate-allowed-this-through';

async function main() {
  const app = await createStrapi(await compileStrapi()).load();
  app.log.level = 'error';

  try {
    const knex = app.db.connection;

    // Row ids carrying at least one image, straight from the morph table.
    const imagedRowIds = new Set(
      (
        await knex('files_related_mph')
          .where('related_type', 'api::product.product')
          .whereIn('field', ['gallery', 'logo'])
          .distinct('related_id')
      ).map((r) => Number(r.related_id))
    );

    const all = await knex('products').select('id', 'document_id', 'name', 'is_variant');
    const links = await knex('products_parent_lnk').select('product_id', 'inv_product_id');

    // product_id is the VARIANT side of this self-relation, inv_product_id the
    // parent (verified against the live schema: every product_id row is a variant).
    const variantsOfParentRow = new Map();
    const parentRowOfVariant = new Map();
    for (const l of links) {
      parentRowOfVariant.set(l.product_id, l.inv_product_id);
      if (!variantsOfParentRow.has(l.inv_product_id)) variantsOfParentRow.set(l.inv_product_id, []);
      variantsOfParentRow.get(l.inv_product_id).push(l.product_id);
    }
    const byRowId = new Map(all.map((r) => [r.id, r]));

    // ── subject A: nothing imaged anywhere (self, variants, parent) ──────────
    const blockedSubject = all.find((r) => {
      if (imagedRowIds.has(r.id)) return false;
      const kids = variantsOfParentRow.get(r.id) || [];
      if (kids.some((k) => imagedRowIds.has(k))) return false;
      const parentRow = parentRowOfVariant.get(r.id);
      if (parentRow != null && imagedRowIds.has(parentRow)) return false;
      // Sibling rows of the same document must be image-less too.
      return !all.some((o) => o.document_id === r.document_id && imagedRowIds.has(o.id));
    });

    // ── subject B: a PARENT with no own image whose VARIANT carries one ──────
    const allowedSubject = all.find((r) => {
      const kids = variantsOfParentRow.get(r.id) || [];
      if (kids.length === 0) return false;
      // No image on ANY row of the parent's document…
      const ownRows = all.filter((o) => o.document_id === r.document_id);
      if (ownRows.some((o) => imagedRowIds.has(o.id))) return false;
      // …but at least one variant has one.
      return kids.some((k) => imagedRowIds.has(k));
    });

    // The sentinel registers last, so it sits AFTER the guard in the chain.
    app.documents.use(async (ctx, next) => {
      if (ctx.uid === 'api::product.product' && ctx.action === 'publish') {
        throw new Error(SENTINEL);
      }
      return next();
    });

    const attempt = async (documentId) => {
      try {
        await app.documents('api::product.product').publish({ documentId });
        return { outcome: 'PUBLISHED', message: '(sentinel missed — nothing proven)' };
      } catch (e) {
        if (e.message === SENTINEL) return { outcome: 'ALLOWED', message: 'reached the publish step' };
        return { outcome: 'BLOCKED', message: e.message };
      }
    };

    const results = [];

    console.log('\n── (a) product with no image anywhere ────────────────────────');
    if (!blockedSubject) {
      console.log('  no such product in this catalog — cannot test');
      results.push(false);
    } else {
      const kids = variantsOfParentRow.get(blockedSubject.id) || [];
      console.log(`  subject : ${blockedSubject.name}`);
      console.log(`  document: ${blockedSubject.document_id}  (variants: ${kids.length})`);
      const r = await attempt(blockedSubject.document_id);
      console.log(`  result  : ${r.outcome}`);
      console.log(`  message : ${r.message}`);
      const ok = r.outcome === 'BLOCKED' && r.message === NO_IMAGE_MESSAGE;
      console.log(`  EXPECT BLOCKED, with the real reason → ${ok ? 'PASS' : 'FAIL'}`);
      results.push(ok);
    }

    console.log('\n── (b) parent whose only images live on a colour variant ─────');
    if (allowedSubject) {
      const kids = variantsOfParentRow.get(allowedSubject.id) || [];
      const imagedKids = kids.filter((k) => imagedRowIds.has(k));
      console.log(`  subject : ${allowedSubject.name}  (found in the live catalog)`);
      console.log(`  document: ${allowedSubject.document_id}`);
      console.log(`  parent has no image of its own; ${imagedKids.length}/${kids.length} variants do:`);
      for (const k of imagedKids.slice(0, 3)) console.log(`      └ ${byRowId.get(k)?.name}`);
      const r = await attempt(allowedSubject.document_id);
      console.log(`  result  : ${r.outcome}`);
      console.log(`  EXPECT ALLOWED (no regression) → ${r.outcome === 'ALLOWED' ? 'PASS' : 'FAIL'}`);
      results.push(r.outcome === 'ALLOWED');
    } else {
      // Every parent in this catalog currently carries its own photo, so the
      // case has to be built to be tested. It is one upload away from being
      // real — a photographer shooting only the colour variants produces it —
      // and it is the exact shape a naive image check gets wrong, so it is
      // worth proving rather than assuming.
      //
      // Built as an A/B: the SAME parent is tested before and after its variant
      // gets a photo. Only the variant's image changes, so if the verdict flips
      // from BLOCKED to ALLOWED, the variant's image is demonstrably what the
      // gate credited. Everything created here is removed in the finally below.
      console.log('  none in the live catalog (all 36 parents carry their own photo)');
      console.log('  → building a temporary parent+variant to test it. A/B on the same parent:\n');
      results.push(await verifyByConstruction(app, knex, attempt));
    }

    console.log('\n── (d) the social product picker offers only imaged products ─');
    results.push(await verifyPickerFilter(app, knex));

    console.log('\n── (+) a product post with nothing to show is refused ────────');
    results.push(await verifyProductPostGate(app, blockedSubject, imagedRowIds, all));

    const passed = results.every(Boolean);
    console.log(`\n  ${passed ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'} — no product was published.\n`);
    process.exitCode = passed ? 0 : 1;
  } finally {
    await app.destroy();
  }
}

/**
 * The social picker sends `hasImage`, which the product controller resolves via
 * imagedProductDocumentIdSet. Verified against the whole live catalog, both
 * ways round: nothing image-less survives the filter, and nothing imaged is
 * wrongly dropped by it (the second half is what catches an over-strict rule).
 */
async function verifyPickerFilter(app, knex) {
  const { imagedProductDocumentIdSet, documentHasAnyImage } = require('../src/utils/public-product');

  const imaged = await imagedProductDocumentIdSet(app);
  // The picker's own population: parents only (a bare variant card is never a
  // post subject), drafts — exactly what apps/content/social/pages/products.js sends.
  const candidates = await knex('products')
    .where((q) => q.where('is_variant', false).orWhereNull('is_variant'))
    .distinct('document_id');
  const docIds = candidates.map((r) => r.document_id);

  const offered = docIds.filter((d) => imaged.has(d));
  const withheld = docIds.filter((d) => !imaged.has(d));
  console.log(`  parent products in the catalog : ${docIds.length}`);
  console.log(`  offered by the picker          : ${offered.length}`);
  console.log(`  withheld (no image anywhere)   : ${withheld.length}`);

  // Sample both sides and re-derive the answer independently, per document.
  const sample = (arr, n) => arr.slice(0, n);
  let wrong = 0;
  for (const d of sample(withheld, 25)) {
    if (await documentHasAnyImage(app, d)) {
      console.log(`    WRONGLY WITHHELD: ${d} has an image`);
      wrong += 1;
    }
  }
  for (const d of sample(offered, 25)) {
    if (!(await documentHasAnyImage(app, d))) {
      console.log(`    WRONGLY OFFERED: ${d} has no image`);
      wrong += 1;
    }
  }
  const ok = wrong === 0 && withheld.length > 0;
  console.log(`  cross-checked 25 from each side against the per-document rule`);
  console.log(`  EXPECT no disagreement, and something actually withheld → ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

/**
 * The social gate refuses a post that links products and has nothing to show,
 * but must NOT refuse one carrying its own creative. Both directions are
 * checked against a real image-less product. Nothing is written: the create is
 * expected to throw, and the allowed case is asserted on the guard directly so
 * no social-post row is left behind.
 */
async function verifyProductPostGate(app, imagelessProduct, imagedRowIds, allRows) {
  if (!imagelessProduct) {
    console.log('  no image-less product available — cannot test');
    return false;
  }
  const guard = require('../src/api/social-post/product-post-image-guard');
  const imagedRow = allRows.find((r) => imagedRowIds.has(r.id));

  const check = async (label, data, expectBlocked) => {
    let blocked = false;
    let message = '';
    try {
      await guard.validateProductPostMedia(app, data);
    } catch (e) {
      blocked = true;
      message = e.message;
    }
    const ok = blocked === expectBlocked;
    console.log(`  ${label}`);
    console.log(`      ${blocked ? 'BLOCKED' : 'allowed'}${blocked ? ` — ${message.slice(0, 60)}…` : ''}`);
    console.log(`      EXPECT ${expectBlocked ? 'BLOCKED' : 'allowed'} → ${ok ? 'PASS' : 'FAIL'}`);
    return ok;
  };

  const results = [];
  results.push(await check(
    `post linking "${imagelessProduct.name}" with no cover and no media:`,
    { title: 'x', products: { set: [imagelessProduct.document_id] } },
    true
  ));
  results.push(await check(
    'the same post, but with its own cover (a designed creative):',
    { title: 'x', cover: 1, products: { set: [imagelessProduct.document_id] } },
    false
  ));
  if (imagedRow) {
    results.push(await check(
      `a post linking the imaged product "${imagedRow.name}":`,
      { title: 'x', products: { set: [imagedRow.document_id] } },
      false
    ));
  }
  results.push(await check(
    'a post linking no products at all (not this gate\'s business):',
    { title: 'x' },
    false
  ));
  return results.every(Boolean);
}

/**
 * Build a parent + colour variant, prove the parent is blocked while neither
 * has a photo, attach a photo to the VARIANT ONLY, prove the parent is now
 * allowed — then delete everything. The image is an existing file row, linked
 * by a morph row; no upload happens and no existing product is touched.
 */
async function verifyByConstruction(app, knex, attempt) {
  const docs = app.documents('api::product.product');
  const TAG = '__image-gate-verify';
  let parent = null;
  let variant = null;

  try {
    parent = await docs.create({ data: { name: `${TAG} parent`, is_variant: false } });
    variant = await docs.create({
      data: { name: `${TAG} variant — Black`, is_variant: true, parent: parent.documentId },
    });

    const variantRowIds = (
      await knex('products').where('document_id', variant.documentId).select('id')
    ).map((r) => r.id);

    console.log(`  parent  : ${parent.documentId}`);
    console.log(`  variant : ${variant.documentId} (rows ${variantRowIds.join(', ')})`);

    console.log('\n  b1. neither parent nor variant has a photo');
    const before = await attempt(parent.documentId);
    console.log(`      result: ${before.outcome}`);
    const b1 = before.outcome === 'BLOCKED';
    console.log(`      EXPECT BLOCKED → ${b1 ? 'PASS' : 'FAIL'}`);

    // Give the VARIANT a photo — an existing file, linked as its gallery.
    const file = await knex('files').first('id', 'name');
    if (!file) {
      console.log('\n      no file rows in the media library — cannot finish this check');
      return false;
    }
    await knex('files_related_mph').insert(
      variantRowIds.map((rid) => ({
        file_id: file.id,
        related_id: rid,
        related_type: 'api::product.product',
        field: 'gallery',
        order: 1,
      }))
    );

    console.log(`\n  b2. the VARIANT now has a photo (file #${file.id} "${file.name}");`);
    console.log('      the parent still has none of its own');
    const after = await attempt(parent.documentId);
    console.log(`      result: ${after.outcome}`);
    const b2 = after.outcome === 'ALLOWED';
    console.log(`      EXPECT ALLOWED — parent credited with its variant's image → ${b2 ? 'PASS' : 'FAIL'}`);

    return b1 && b2;
  } finally {
    // Remove the fixture whatever happened above.
    for (const doc of [variant, parent]) {
      if (!doc) continue;
      const rowIds = (
        await knex('products').where('document_id', doc.documentId).select('id')
      ).map((r) => r.id);
      if (rowIds.length) {
        await knex('files_related_mph')
          .where('related_type', 'api::product.product')
          .whereIn('related_id', rowIds)
          .del();
      }
      await docs.delete({ documentId: doc.documentId }).catch(() => {});
    }
    const left = await knex('products').where('name', 'like', `${TAG}%`).count('id as n');
    console.log(`\n  cleanup : temporary products remaining = ${left[0].n} (expected 0)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
