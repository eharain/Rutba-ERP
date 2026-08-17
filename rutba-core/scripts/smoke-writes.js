#!/usr/bin/env node
'use strict';

/**
 * Write-path smoke test. Creates marker-named rows on the dev DB, exercises
 * create/update/publish/unpublish/delete (incl. components and link tables),
 * verifies against raw SQL, and cleans up everything it created — including
 * on failure (finally block deletes all marker documents).
 */

const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');

const MARKER = '__rutba_core_write_smoke__';
let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function cleanup(db) {
  for (const [uid, table, nameCol] of [
    ['api::sale-order.sale-order', 'orders', 'order_id'],
    ['api::product.product', 'products', 'name'],
    ['api::seo-meta.seo-meta', 'seo_metas', 'entity_title'],
    ['api::cms-page.cms-page', 'cms_pages', 'title'],
    ['api::cms-page-group.cms-page-group', 'cms_page_groups', 'name'],
  ]) {
    const rows = await db(table).where(nameCol, 'like', `${MARKER}%`).select('document_id').groupBy('document_id');
    for (const r of rows) await documents(uid).delete({ documentId: r.document_id });
  }
}

async function main() {
  const db = getDb();
  const products = documents('api::product.product');
  const orders = documents('api::sale-order.sale-order');

  try {
    // Pick two existing draft categories to relate to.
    const cats = await documents('api::category.category').findMany({ limit: 2, sort: 'id:asc' });
    check('found 2 draft categories to test with', cats.length === 2);
    const [catA, catB] = cats;

    // ── create ────────────────────────────────────────────────
    const created = await products.create({
      data: {
        name: `${MARKER} v1`,
        selling_price: 123.45,
        keywords: { smoke: true, n: 7 },
        categories: [catA.id, catB.documentId], // mixed id + documentId inputs
      },
      populate: { categories: true },
    });
    check('create returns document', created && typeof created.documentId === 'string');
    check('create is draft (publishedAt null)', created.publishedAt === null);
    check('json attr round-trips', created.keywords && created.keywords.n === 7);
    check('create relations set (2 categories, order kept)',
      JSON.stringify((created.categories || []).map((c) => c.id)) === JSON.stringify([catA.id, catB.id]),
      JSON.stringify((created.categories || []).map((c) => c.id)));
    const docId = created.documentId;

    // ── update: scalars + disconnect/connect ──────────────────
    const updated = await products.update({
      documentId: docId,
      data: {
        name: `${MARKER} v2`,
        categories: { disconnect: [catA.id], connect: [] },
      },
      populate: { categories: true },
    });
    check('update scalar applied', updated.name === `${MARKER} v2`);
    check('disconnect leaves 1 category',
      updated.categories.length === 1 && updated.categories[0].id === catB.id);

    const reconnected = await products.update({
      documentId: docId,
      data: { categories: { connect: [catA.id] } },
      populate: { categories: true },
    });
    check('connect appends (2 categories)', reconnected.categories.length === 2);

    // ── publish: clone + target remap ─────────────────────────
    const published = await products.publish({ documentId: docId, populate: { categories: true } });
    check('publish creates published version', published && published.publishedAt !== null);
    check('published shares documentId', published.documentId === docId);
    check('published id differs from draft id', published.id !== created.id);
    const pubCatRows = await db('categories').whereIn('id', published.categories.map((c) => c.id))
      .select('published_at');
    check('published links remap to published categories',
      pubCatRows.length === published.categories.length &&
      pubCatRows.every((r) => r.published_at !== null));

    // re-publish is idempotent (replaces the published version)
    await products.publish({ documentId: docId });
    const versions = await db('products').where('document_id', docId).count('id as c');
    check('re-publish keeps exactly 2 versions', Number(versions[0].c) === 2);

    // ── unpublish ─────────────────────────────────────────────
    await products.unpublish({ documentId: docId });
    const afterUnpub = await db('products').where('document_id', docId).whereNotNull('published_at').count('id as c');
    check('unpublish removes published version', Number(afterUnpub[0].c) === 0);

    // ── sale-order with nested components ─────────────────────
    const order = await orders.create({
      data: {
        order_id: `${MARKER}-SO`,
        products: {
          items: [
            { product: created.id, quantity: 2, price: 100, total: 200, product_name: 'smoke item A' },
            { product: { documentId: docId }, quantity: 1, price: 50, total: 50, product_name: 'smoke item B' },
          ],
        },
      },
      populate: { products: { populate: { items: { populate: { product: true } } } } },
    });
    check('order created with component wrapper', order.products && order.products.items);
    const items = order.products.items || [];
    check('nested repeatable items (2, ordered)',
      items.length === 2 && items[0].product_name === 'smoke item A');
    check('component relation resolves via id and documentId',
      items.every((i) => i.product && i.product.documentId === docId));

    // ── delete: full graph teardown ───────────────────────────
    const orderRowId = order.id;
    const itemIds = items.map((i) => i.id);
    await orders.delete({ documentId: order.documentId });
    const [orphanWrappers] = await db('orders_cmps').where('entity_id', orderRowId).count('id as c');
    const [orphanItems] = await db('components_order_order_product_items').whereIn('id', itemIds).count('id as c');
    check('order cmps rows gone', Number(orphanWrappers.c) === 0);
    check('nested component rows gone', Number(orphanItems.c) === 0);

    await products.delete({ documentId: docId });
    const [prodRows] = await db('products').where('document_id', docId).count('id as c');
    const [linkRows] = await db('products_categories_lnk as l')
      .join('products as p', 'p.id', 'l.product_id').where('p.document_id', docId).count('l.id as c');
    check('product versions gone', Number(prodRows.c) === 0);
    check('product link rows gone (cascade)', Number(linkRows.c) === 0);

    // ── inverse (mappedBy) relations: written from the far end ─
    // cms-page.member_page_groups is the inverse of cms-page-group.pages, and
    // the CMS page editor sets it from the page — the same link row, reversed.
    const pages = documents('api::cms-page.cms-page');
    const pageGroups = documents('api::cms-page-group.cms-page-group');
    const gA = await pageGroups.create({ data: { name: `${MARKER} gA`, slug: `${MARKER}-ga` } });
    const gB = await pageGroups.create({ data: { name: `${MARKER} gB`, slug: `${MARKER}-gb` } });

    const p1 = await pages.create({ data: { title: `${MARKER} p1`, slug: `${MARKER}-p1` } });
    const p2 = await pages.create({
      data: {
        title: `${MARKER} p2`,
        slug: `${MARKER}-p2`,
        member_page_groups: [gB.documentId, gA.id], // mixed documentId + id
      },
      populate: { member_page_groups: true },
    });
    check('inverse m2m written from the mappedBy side (order kept)',
      JSON.stringify((p2.member_page_groups || []).map((g) => g.id)) === JSON.stringify([gB.id, gA.id]),
      JSON.stringify((p2.member_page_groups || []).map((g) => g.id)));

    const p2Links = await db('cms_page_groups_pages_lnk').where('cms_page_id', p2.id).orderBy('cms_page_group_ord');
    check('inverse write fills BOTH order columns',
      p2Links.length === 2 &&
      JSON.stringify(p2Links.map((r) => r.cms_page_group_ord)) === JSON.stringify([1, 2]) &&
      p2Links.every((r) => r.cms_page_ord !== null),
      JSON.stringify(p2Links));

    const gAFull = await pageGroups.findOne({ documentId: gA.documentId, populate: { pages: true } });
    check('owning side sees the inverse-written link',
      (gAFull.pages || []).some((pg) => pg.id === p2.id));

    // owner side writes the same table: p1 first, so p2 keeps rank 2 below
    const gAOrdered = await pageGroups.update({
      documentId: gA.documentId,
      data: { pages: [p1.id, p2.id] },
      populate: { pages: true },
    });
    check('owner-side replace orders its own list',
      JSON.stringify((gAOrdered.pages || []).map((p) => p.id)) === JSON.stringify([p1.id, p2.id]));
    const p1InA = await db('cms_page_groups_pages_lnk')
      .where({ cms_page_group_id: gA.id, cms_page_id: p1.id }).first();
    check('owner-side write fills the far list order column too', p1InA && p1InA.cms_page_group_ord !== null,
      JSON.stringify(p1InA));

    // a replace from the page side must not shuffle the group's page list
    await pages.update({ documentId: p2.documentId, data: { member_page_groups: [gA.documentId] } });
    const p2InA = await db('cms_page_groups_pages_lnk')
      .where({ cms_page_group_id: gA.id, cms_page_id: p2.id }).first();
    check('inverse replace keeps the pair\'s rank in the far list', p2InA && p2InA.cms_page_ord === 2,
      JSON.stringify(p2InA));
    const [gBLinks] = await db('cms_page_groups_pages_lnk')
      .where({ cms_page_group_id: gB.id, cms_page_id: p2.id }).count('id as c');
    check('inverse replace dropped the group left out', Number(gBLinks.c) === 0);

    // connect/disconnect through the inverse side
    const p2Connected = await pages.update({
      documentId: p2.documentId,
      data: { member_page_groups: { connect: [gB.documentId] } },
      populate: { member_page_groups: true },
    });
    check('inverse connect appends', (p2Connected.member_page_groups || []).length === 2);
    const p2Disconnected = await pages.update({
      documentId: p2.documentId,
      data: { member_page_groups: { disconnect: [gA.id] } },
      populate: { member_page_groups: true },
    });
    check('inverse disconnect removes just that one',
      (p2Disconnected.member_page_groups || []).length === 1 &&
      p2Disconnected.member_page_groups[0].id === gB.id);

    // the literal payload the CMS page editor PUTs (toOrderedRelation)
    const p2Reset = await pages.update({
      documentId: p2.documentId,
      data: {
        member_page_groups: {
          set: [
            { documentId: gA.documentId, position: { start: true } },
            { documentId: gB.documentId, position: { after: gA.documentId } },
          ],
        },
      },
      populate: { member_page_groups: true },
    });
    check('inverse set:[{documentId,position}] payload (CMS editor shape)',
      JSON.stringify((p2Reset.member_page_groups || []).map((g) => g.id)) === JSON.stringify([gA.id, gB.id]),
      JSON.stringify((p2Reset.member_page_groups || []).map((g) => g.id)));

    // to-one inverse (cms-page.seo_meta ← seo-meta.cms_page): connecting steals
    const seo = documents('api::seo-meta.seo-meta');
    const sm = await seo.create({ data: { entity_title: `${MARKER} seo`, cms_page: p1.id } });
    const p2WithSeo = await pages.update({
      documentId: p2.documentId,
      data: { seo_meta: sm.id },
      populate: { seo_meta: true },
    });
    check('inverse oneToOne write links the sidecar', p2WithSeo.seo_meta && p2WithSeo.seo_meta.id === sm.id);
    const smLinks = await db('seo_metas_cms_page_lnk').where('seo_meta_id', sm.id);
    check('inverse oneToOne steals instead of duplicating',
      smLinks.length === 1 && smLinks[0].cms_page_id === p2.id, JSON.stringify(smLinks));

    // Publish rebuilds a version from its own graph, and an inverse link lives
    // on the OWNING side — so the published page picks the group up when the
    // GROUP is published (its clone remaps targets to published counterparts).
    await pages.publish({ documentId: p2.documentId });
    await pageGroups.publish({ documentId: gB.documentId });
    const p2Published = await pages.findOne({
      documentId: p2.documentId, status: 'published', populate: { member_page_groups: true },
    });
    check('published page shows the group after the group is published',
      (p2Published.member_page_groups || []).some((g) => g.documentId === gB.documentId),
      JSON.stringify((p2Published.member_page_groups || []).map((g) => g.documentId)));

    // ── caller-scoped transaction: rollback undoes shim writes ──
    const { withTransaction } = require('../src/db/connection');
    let trxDocId = null;
    try {
      await withTransaction(async () => {
        const p = await products.create({ data: { name: `${MARKER} trx` } });
        trxDocId = p.documentId;
        throw new Error('force rollback');
      });
    } catch (e) {
      if (e.message !== 'force rollback') throw e;
    }
    const [trxRows] = await db('products').where('document_id', trxDocId).count('id as c');
    check('transaction rollback leaves no rows', Number(trxRows.c) === 0, `docId=${trxDocId}`);
  } finally {
    await cleanup(db);
  }

  console.log(failures === 0 ? '\nWRITE SMOKE: all checks passed' : `\nWRITE SMOKE: ${failures} check(s) FAILED`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('write smoke failed:', err);
  try { await cleanup(getDb()); } catch {}
  await closeDb();
  process.exit(2);
});
