'use strict';

/**
 * Report — never modify — the products that are PUBLISHED today but carry no
 * image anywhere, i.e. the rows that would now fail the publish gate
 * (src/api/product/publish-image-guard.js).
 *
 * These predate the gate. Unpublishing them in bulk would silently pull live
 * catalog entries down, so this only counts and lists them; deciding what to do
 * with the list is a human call. Nothing here writes.
 *
 * The image test is the shared helper the gate and the storefront both use, so
 * this cannot drift from what the gate actually enforces: a product counts as
 * imaged if it, EITHER of its version rows, any of its variants (draft or
 * published), or — for a variant — its parent, carries a gallery/logo file.
 *
 * Boots Strapi load-only (no HTTP listen — safe while the dev server is up).
 *   node scripts/audit-imageless-published-products.js
 *   node scripts/audit-imageless-published-products.js --csv=out.csv
 */

const fs = require('fs');
const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { imagedProductIdSet } = require('../src/utils/public-product');

async function main() {
  const app = await createStrapi(await compileStrapi()).load();
  app.log.level = 'error';

  try {
    const knex = app.db.connection;

    // Every document that has a published version, and ALL its version rows —
    // media hang off whichever row the uploader touched, and the gate unions
    // both, so the audit must too.
    const publishedDocIds = (
      await knex('products').whereNotNull('published_at').distinct('document_id')
    ).map((r) => r.document_id);

    const rows = await knex('products')
      .whereIn('document_id', publishedDocIds)
      .select('id', 'document_id', 'name', 'sku', 'is_variant', 'published_at');

    // A variant is covered by its parent's photography (the gate credits it), so
    // the parent's rows join the candidate set. product_id is the VARIANT side of
    // this self-relation link table, inv_product_id the parent — verified against
    // the live schema, where every product_id row is is_variant=1.
    const rowIds = rows.map((r) => r.id);
    const parentLinks = await knex('products_parent_lnk')
      .whereIn('product_id', rowIds)
      .select('product_id', 'inv_product_id');
    const parentRowOf = new Map(parentLinks.map((l) => [l.product_id, l.inv_product_id]));

    const candidates = [...new Set([...rowIds, ...parentRowOf.values()])];
    const imaged = await imagedProductIdSet(app, candidates, {
      variantStatuses: ['draft', 'published'],
    });

    // Roll rows up to documents: a document passes if ANY of its rows (or the
    // parent of any of its rows) is imaged.
    const byDoc = new Map();
    for (const r of rows) {
      const parentRow = parentRowOf.get(r.id);
      const ok = imaged.has(r.id) || (parentRow != null && imaged.has(parentRow));
      const prev = byDoc.get(r.document_id);
      if (!prev) byDoc.set(r.document_id, { ...r, imaged: ok });
      else if (ok) prev.imaged = true;
    }

    const failing = [...byDoc.values()].filter((d) => !d.imaged);
    const variants = failing.filter((d) => d.is_variant === 1 || d.is_variant === true);

    console.log('');
    console.log('  Published product documents : ' + byDoc.size);
    console.log('  With an image (gate passes) : ' + (byDoc.size - failing.length));
    console.log('  IMAGE-LESS (gate would fail): ' + failing.length);
    console.log('    of which colour variants  : ' + variants.length);
    console.log('');
    console.log('  Nothing was changed. These stay published until someone decides.');
    console.log('');

    const sorted = failing.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    for (const d of sorted.slice(0, 40)) {
      console.log(
        `   ${d.document_id}  ${d.is_variant ? '[variant] ' : ''}${d.sku || '(no sku)'}  ${d.name}`
      );
    }
    if (sorted.length > 40) console.log(`   … and ${sorted.length - 40} more (use --csv=<file>)`);

    const csvArg = process.argv.find((a) => a.startsWith('--csv='));
    if (csvArg) {
      const file = csvArg.slice('--csv='.length);
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      fs.writeFileSync(
        file,
        ['documentId,sku,name,isVariant,publishedAt']
          .concat(
            sorted.map((d) =>
              [d.document_id, d.sku, d.name, d.is_variant ? 'yes' : 'no', d.published_at]
                .map(esc)
                .join(',')
            )
          )
          .join('\n'),
        'utf8'
      );
      console.log(`\n  Wrote ${sorted.length} rows to ${file}`);
    }
  } finally {
    await app.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
