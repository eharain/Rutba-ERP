#!/usr/bin/env node
'use strict';

/**
 * inventory-extras tranche smoke (tranche 4) — reorder engine, low-stock
 * alerts and expiry sweeps against the live dev DB. Self-cleaning and
 * MARKER-ONLY: every row it writes carries the marker; temp app-role grants
 * are removed; any real stock rows a sweep touches are snapshotted first and
 * restored (today both snapshots are expected empty — verified before the
 * suite was written). The two alert run-now calls also refresh REAL alert
 * rows' derived metrics — the same idempotent convergence the daily
 * lowStockAlertSweep cron performs; marker alert rows are deleted.
 *
 *  - suggestions: legacy reorder_level fallback, then policy math (MinMax)
 *  - run-now: marker alert opens; acknowledge/dismiss transitions + gates;
 *    second run auto-resolves once on-order covers the deficit
 *  - generate-purchases / generate-work-orders: draft docs + idempotency skip
 *  - expiring: horizon filter + `fields` projection; sweep-expired flips the
 *    unit AND the bulk batch, and the lifecycles recompute both product caches
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4027;
const MARK = '__rutba_core_inv_smoke__';

const PRODUCT_UID = 'api::product.product';
const POLICY_UID = 'api::reorder-policy.reorder-policy';
const ALERT_UID = 'api::stock-alert.stock-alert';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const STOCK_BATCH_UID = 'api::stock-batch.stock-batch';
const PURCHASE_UID = 'api::purchase.purchase';
const PURCHASE_ITEM_UID = 'api::purchase-item.purchase-item';
const WO_UID = 'api::mfg-work-order.mfg-work-order';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function req(method, path, token, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

const dateISO = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function main() {
  buildCompatStrapi();
  initModules();

  const db = getDb();
  const created = [];
  const track = (uid, documentId) => { if (documentId) created.push([uid, documentId]); return documentId; };
  const grants = [];
  let server = null;
  // Real (non-marker) stock rows a sweep could flip — snapshot to restore.
  let realExpiredItems = [];
  let realExpiredBatches = [];

  try {
    // Two plain users: neither a UP super-admin nor a holder of any
    // inventory/stock/purchase app-role. B gets a temp control_admin grant.
    const plainUsers = await db('up_users as u')
      .leftJoin('up_users_role_lnk as rl', 'rl.user_id', 'u.id')
      .leftJoin('up_roles as r', 'r.id', 'rl.role_id')
      .where('u.blocked', 0)
      .where(function () { this.whereNull('r.type').orWhereNot('r.type', 'admin'); })
      .whereNotExists(function () {
        this.select(1).from('up_users_app_roles_lnk as l')
          .join('api_pro_app_roles as ar', 'ar.id', 'l.app_role_id')
          .whereRaw('l.user_id = u.id')
          .whereRaw("`ar`.`key` regexp '^(inventory|stock|purchase)_'");
      })
      .select('u.id', 'u.document_id as documentId', 'u.username')
      .limit(2);
    check('found two plain users', plainUsers.length === 2, `got ${plainUsers.length}`);
    const [userA, userB] = plainUsers;

    const invAdmin = await db('api_pro_app_roles').where('key', 'control_admin').first('id');
    check('control_admin app-role exists', Boolean(invAdmin));
    await db('up_users_app_roles_lnk').insert({ user_id: userB.id, app_role_id: invAdmin.id });
    grants.push({ user_id: userB.id, app_role_id: invAdmin.id });

    const tokenA = jwt.sign({ id: userA.id }, get('JWT_SECRET'), { expiresIn: '10m' });
    const tokenB = jwt.sign({ id: userB.id }, get('JWT_SECRET'), { expiresIn: '10m' });

    server = await start(PORT);

    // ── suggestions ───────────────────────────────────────────────────────
    console.log('A. reorder suggestions');
    const noAuth = await req('GET', '/api/reorder-policies/suggestions');
    check('suggestions 401 without token', noAuth.status === 401, `got ${noAuth.status}`);

    // The route is auth:false, so a valid JWT alone used to be enough — which
    // meant a storefront customer could read every product's deficit, supplier
    // and unit cost. It now takes an inventory/stock membership (any level).
    const sugDenied = await req('GET', '/api/reorder-policies/suggestions', tokenA);
    check('suggestions 403 without an inventory/stock role', sugDenied.status === 403, `got ${sugDenied.status}`);

    const p1 = await documents(PRODUCT_UID).create({
      data: { name: `${MARK} product`, sku: `${MARK}-sku`, reorder_level: 7, cost_price: 50 },
    });
    track(PRODUCT_UID, p1.documentId);

    const fb = await req('GET', '/api/reorder-policies/suggestions', tokenB);
    const fbRow = fb.status === 200 && (fb.body.data || []).find((s) => s.product === p1.documentId);
    check('legacy fallback suggestion (reorder_level, no policy)',
      Boolean(fbRow) && fbRow.fallback === true && fbRow.min_stock === 7 && fbRow.suggested_qty === 7
      && fbRow.method === 'ReorderPoint' && fbRow.source === 'Purchase',
      `got ${fb.status} ${JSON.stringify(fbRow || (fb.body && fb.body.error))}`);

    const pol = await documents(POLICY_UID).create({
      data: {
        product: p1.documentId, is_active: true, method: 'MinMax',
        min_stock: 10, safety_stock: 2, max_stock: 20, source: 'Purchase',
      },
    });
    track(POLICY_UID, pol.documentId);

    const ps = await req('GET', '/api/reorder-policies/suggestions', tokenB);
    const psRow = ps.status === 200 && (ps.body.data || []).find((s) => s.product === p1.documentId);
    check('policy suggestion (MinMax up-to-max, deficit ranked)',
      Boolean(psRow) && psRow.fallback === false && psRow.policy === pol.documentId
      && psRow.suggested_qty === 20 && psRow.deficit === 12 && psRow.unit_cost === 50,
      `got ${ps.status} ${JSON.stringify(psRow || (ps.body && ps.body.error))}`);

    // ── low-stock alerts ──────────────────────────────────────────────────
    console.log('B. stock alerts');
    const runDenied = await req('POST', '/api/stock-alerts/run-now', tokenA, {});
    check('run-now 403 without inventory/stock manager role', runDenied.status === 403, `got ${runDenied.status}`);

    const run1 = await req('POST', '/api/stock-alerts/run-now', tokenB, {});
    check('run-now syncs and returns summary', run1.status === 200 && run1.body.success === true
      && typeof run1.body.checked === 'number' && run1.body.opened >= 1,
      `got ${run1.status} ${JSON.stringify(run1.body)}`);

    const alert = await documents(ALERT_UID).findFirst({ filters: { trigger_key: { $eq: `${p1.documentId}:all` } } });
    track(ALERT_UID, alert && alert.documentId);
    check('marker alert opened (Critical, engine metrics persisted)',
      Boolean(alert) && alert.status === 'Open' && alert.severity === 'Critical'
      && Number(alert.deficit) === 12 && Number(alert.suggested_qty) === 20,
      JSON.stringify(alert && { status: alert.status, severity: alert.severity, deficit: alert.deficit }));

    const ackDenied = await req('POST', `/api/stock-alerts/${alert.documentId}/acknowledge`, tokenA, {});
    check('acknowledge 403 without membership', ackDenied.status === 403, `got ${ackDenied.status}`);

    const ack = await req('POST', `/api/stock-alerts/${alert.documentId}/acknowledge`, tokenB, {});
    check('acknowledge transitions to Acknowledged', ack.status === 200 && ack.body.status === 'Acknowledged',
      `got ${ack.status} ${JSON.stringify(ack.body)}`);

    const dis = await req('POST', `/api/stock-alerts/${alert.documentId}/dismiss`, tokenB, { notes: `${MARK} noisy` });
    check('dismiss transitions to Dismissed', dis.status === 200 && dis.body.status === 'Dismissed', `got ${dis.status}`);
    const dismissed = await documents(ALERT_UID).findFirst({ filters: { id: { $eq: alert.id } } });
    check('dismiss persists notes + stamp', dismissed && dismissed.notes === `${MARK} noisy` && Boolean(dismissed.dismissed_at));

    const ackAfter = await req('POST', `/api/stock-alerts/${alert.documentId}/acknowledge`, tokenB, {});
    check('acknowledge after dismiss rejected 400', ackAfter.status === 400, `got ${ackAfter.status}`);

    // ── generate purchases / work orders ──────────────────────────────────
    console.log('C. replenishment generation');
    const genDenied = await req('POST', '/api/reorder-policies/generate-purchases', tokenA, {});
    check('generate-purchases 403 without manager role', genDenied.status === 403, `got ${genDenied.status}`);

    const genBody = { suggestions: [{ product: p1.documentId, suggested_qty: 20, unit_cost: 50 }] };
    const gen1 = await req('POST', '/api/reorder-policies/generate-purchases', tokenB, genBody);
    const purchaseDoc = gen1.body && gen1.body.purchases && gen1.body.purchases[0] && gen1.body.purchases[0].purchase;
    check('generate-purchases creates one draft purchase', gen1.status === 200 && gen1.body.created === 1
      && Boolean(purchaseDoc) && /^REORDER-/.test(gen1.body.purchases[0].orderId)
      && gen1.body.purchases[0].total === 1000,
      `got ${gen1.status} ${JSON.stringify(gen1.body)}`);

    const pItems = await documents(PURCHASE_ITEM_UID).findMany({
      filters: { purchase: { documentId: { $eq: purchaseDoc } } },
    });
    check('purchase line written (qty × cost)', pItems.length === 1
      && Number(pItems[0].quantity) === 20 && Number(pItems[0].total) === 1000,
      JSON.stringify(pItems.map((i) => [i.quantity, i.total])));

    const gen2 = await req('POST', '/api/reorder-policies/generate-purchases', tokenB, genBody);
    check('generate-purchases idempotent (open REORDER draft skips)', gen2.status === 200 && gen2.body.created === 0
      && Array.isArray(gen2.body.skipped) && gen2.body.skipped.includes(p1.documentId),
      `got ${gen2.status} ${JSON.stringify(gen2.body)}`);

    const woBody = { suggestions: [{ product: p1.documentId, suggested_qty: 5, source: 'Manufacture' }] };
    const wo1 = await req('POST', '/api/reorder-policies/generate-work-orders', tokenB, woBody);
    const woDoc = wo1.body && wo1.body.work_orders && wo1.body.work_orders[0] && wo1.body.work_orders[0].work_order;
    check('generate-work-orders creates one draft WO', wo1.status === 200 && wo1.body.created === 1
      && Boolean(woDoc) && /^REORDER-WO-/.test(wo1.body.work_orders[0].wo_number),
      `got ${wo1.status} ${JSON.stringify(wo1.body)}`);

    const wo2 = await req('POST', '/api/reorder-policies/generate-work-orders', tokenB, woBody);
    check('generate-work-orders idempotent', wo2.status === 200 && wo2.body.created === 0,
      `got ${wo2.status} ${JSON.stringify(wo2.body)}`);

    // On-order (20 purchased + 5 in WO) now covers the deficit → the second
    // sync auto-resolves the dismissed marker alert.
    const run2 = await req('POST', '/api/stock-alerts/run-now', tokenB, {});
    check('second run-now succeeds', run2.status === 200 && run2.body.success === true, `got ${run2.status}`);
    const resolved = await documents(ALERT_UID).findFirst({ filters: { id: { $eq: alert.id } } });
    check('covered alert auto-resolved', resolved && resolved.status === 'Resolved' && Boolean(resolved.resolved_at),
      JSON.stringify(resolved && resolved.status));

    // ── expiry ────────────────────────────────────────────────────────────
    console.log('D. expiry');
    const si = [];
    for (const [tag, offset] of [['past', -1], ['far', 40], ['near', 10]]) {
      const row = await documents(STOCK_ITEM_UID).create({
        data: {
          product: p1.documentId, status: 'InStock', expiry_date: dateISO(offset),
          barcode: `${MARK}-${tag}`, sku: `${MARK}-${tag}`,
        },
      });
      track(STOCK_ITEM_UID, row.documentId);
      si.push(row);
    }
    const sb1 = await documents(STOCK_BATCH_UID).create({
      data: {
        product: p1.documentId, status: 'Active', expiry_date: dateISO(-1),
        batch_code: `${MARK}-batch`, quantity_received: 5, quantity_remaining: 5,
      },
    });
    track(STOCK_BATCH_UID, sb1.documentId);

    const cachedP1 = await documents(PRODUCT_UID).findFirst({ filters: { id: { $eq: p1.id } } });
    check('lifecycles recompute caches on create (3 units, 5 bulk)',
      cachedP1 && Number(cachedP1.stock_quantity) === 3 && Number(cachedP1.bulk_quantity_on_hand) === 5,
      JSON.stringify(cachedP1 && [cachedP1.stock_quantity, cachedP1.bulk_quantity_on_hand]));

    const exp = await req('GET', '/api/stock-items/expiring?days=30', tokenA);
    const expMarks = exp.status === 200 ? (exp.body.data || []).filter((r) => String(r.barcode || '').startsWith(MARK)) : [];
    check('expiring returns past+near, not far', expMarks.length === 2
      && expMarks.some((r) => r.barcode === `${MARK}-past`) && expMarks.some((r) => r.barcode === `${MARK}-near`),
      `got ${exp.status} ${JSON.stringify(expMarks.map((r) => r.barcode))}`);
    check('expiring rows are field-projected + populated',
      expMarks.length === 2 && expMarks.every((r) => r.cost_price === undefined && r.status === 'InStock'
        && r.product && r.product.name === `${MARK} product` && r.product.track_mode === undefined),
      JSON.stringify(expMarks[0]));

    const sweepDenied = await req('POST', '/api/stock-items/sweep-expired', tokenA, {});
    check('sweep-expired 403 without inventory/stock admin', sweepDenied.status === 403, `got ${sweepDenied.status}`);

    // Snapshot any REAL rows the sweep would flip, to restore afterwards
    // (expected none — marker rows are the only past-expiry stock today).
    const today = dateISO(0);
    realExpiredItems = (await db('stock_items').where('status', 'InStock')
      .where(function () { this.where('archived', 0).orWhereNull('archived'); })
      .whereNotNull('expiry_date').where('expiry_date', '<', today)
      .whereNot('barcode', 'like', `${MARK}%`).select('id')).map((r) => r.id);
    realExpiredBatches = (await db('stock_batches').where('status', 'Active')
      .whereNotNull('expiry_date').where('expiry_date', '<', today)
      .whereNot('batch_code', 'like', `${MARK}%`).select('id')).map((r) => r.id);
    if (realExpiredItems.length || realExpiredBatches.length) {
      console.log(`  info  sweep will also flip real rows — items=${realExpiredItems.length} batches=${realExpiredBatches.length} (will restore)`);
    }

    const sweep = await req('POST', '/api/stock-items/sweep-expired', tokenB, {});
    check('sweep-expired flips unit + batch', sweep.status === 200 && sweep.body.success === true
      && sweep.body.expired === 1 + realExpiredItems.length
      && sweep.body.batchesExpired === 1 + realExpiredBatches.length,
      `got ${sweep.status} ${JSON.stringify(sweep.body)}`);

    const sweptItem = await documents(STOCK_ITEM_UID).findFirst({ filters: { id: { $eq: si[0].id } } });
    const sweptBatch = await documents(STOCK_BATCH_UID).findFirst({ filters: { id: { $eq: sb1.id } } });
    check('past unit + batch now Expired', sweptItem && sweptItem.status === 'Expired'
      && sweptBatch && sweptBatch.status === 'Expired',
      JSON.stringify([sweptItem && sweptItem.status, sweptBatch && sweptBatch.status]));

    const afterP1 = await documents(PRODUCT_UID).findFirst({ filters: { id: { $eq: p1.id } } });
    check('caches dropped by expiry lifecycles (2 units, 0 bulk)',
      afterP1 && Number(afterP1.stock_quantity) === 2 && Number(afterP1.bulk_quantity_on_hand) === 0,
      JSON.stringify(afterP1 && [afterP1.stock_quantity, afterP1.bulk_quantity_on_hand]));

    const sweepAgain = await req('POST', '/api/stock-items/sweep-expired', tokenB, {});
    check('sweep idempotent', sweepAgain.status === 200
      && sweepAgain.body.expired === 0 && sweepAgain.body.batchesExpired === 0,
      JSON.stringify(sweepAgain.body));

    // ── crons registered (dormant) ────────────────────────────────────────
    const { tasks } = require('../src/platform/cron');
    check('inventory crons registered with services/strapi rules',
      tasks.has('inventoryExpirySweep') && tasks.get('inventoryExpirySweep').rule === '15 2 * * *'
      && tasks.has('lowStockAlertSweep') && tasks.get('lowStockAlertSweep').rule === '30 2 * * *');
  } finally {
    // Restore any real rows the sweep flipped (status back; lifecycles recompute).
    const strapiC = global.strapi;
    for (const id of realExpiredItems) {
      try { await strapiC.entityService.update(STOCK_ITEM_UID, id, { data: { status: 'InStock' } }); } catch {}
    }
    for (const id of realExpiredBatches) {
      try { await strapiC.entityService.update(STOCK_BATCH_UID, id, { data: { status: 'Active' } }); } catch {}
    }
    // Purchase lines aren't individually tracked — remove them before their purchase.
    try {
      const marks = await documents(PURCHASE_UID).findMany({ filters: { orderId: { $startsWith: 'REORDER-' } } });
      for (const p of marks) {
        const lines = await documents(PURCHASE_ITEM_UID).findMany({
          filters: { purchase: { documentId: { $eq: p.documentId } }, product: { documentId: { $eq: created.find(([u]) => u === PRODUCT_UID)?.[1] } } },
        });
        if (!lines.length) continue; // a REORDER purchase not touching the marker product is real data
        for (const l of lines) { try { await documents(PURCHASE_ITEM_UID).delete({ documentId: l.documentId }); } catch {} }
        try { await documents(PURCHASE_UID).delete({ documentId: p.documentId }); } catch {}
      }
    } catch {}
    // Marker WOs from generate-work-orders.
    try {
      const wos = await documents(WO_UID).findMany({ filters: { wo_number: { $startsWith: 'REORDER-WO-' }, product: { documentId: { $eq: created.find(([u]) => u === PRODUCT_UID)?.[1] } } } });
      for (const w of wos) { try { await documents(WO_UID).delete({ documentId: w.documentId }); } catch {} }
    } catch {}
    for (const [uid, documentId] of created.reverse()) {
      try { await documents(uid).delete({ documentId }); } catch {}
    }
    // Stock-level rows the lifecycles may have built for the marker product.
    try {
      const orphanLevels = await db('stock_levels as sl')
        .leftJoin('stock_levels_product_lnk as l', 'l.stock_level_id', 'sl.id')
        .whereNull('l.id').select('sl.id');
      if (orphanLevels.length) await db('stock_levels').whereIn('id', orphanLevels.map((r) => r.id)).del();
    } catch {}
    for (const g of grants) {
      try { await db('up_users_app_roles_lnk').where(g).del(); } catch {}
    }
    if (server) server.close();
    await closeDb();
  }

  console.log(failures === 0 ? `\nALL PASS` : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('SMOKE ERROR:', e.stack);
  try { await closeDb(); } catch {}
  process.exit(1);
});
