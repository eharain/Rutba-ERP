#!/usr/bin/env node
'use strict';

/**
 * Sale/stock/payment/GL tranche smoke (tranche 7) against the live dev DB.
 * Self-cleaning and MARKER-ONLY: marker products / stock items / sale /
 * sale-item / payments / cash register / web order / person / adjustment rows
 * are deleted, the temp app-role grant removed, GL entries swept by
 * source_type + our source ids, and notification side effects swept by id
 * snapshot + event name.
 *
 *  A. anon gates on selfAuth routes (controllers gate themselves)
 *  B. web order flow: guest checkout create (offer re-pricing, provisional
 *     person), secret-gated tracking, staff update-status + cancel through the
 *     REAL state machine
 *  C. POS flow: open register → sale + line + stock unit → /checkout settles
 *     (payment row, stock Sold, sale Completed, best-effort GL) → /detail
 *     tree → search-by-stock-item → close register (reconciliation math)
 *  D. stock-adjustment transitions: role gate, post (units → Reduced,
 *     adjusted_item_ids recorded), cancel (revert + GL reversal)
 *  E. read contracts: return-policy resolver, sale-offers for-product,
 *     return-requests/mine, rider/me
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4030;
const MARK = '__rutba_core_ss_smoke__';
const DESK_ID = 987654; // marker desk — nothing real uses it

const PRODUCT_UID = 'api::product.product';
const STOCK_UID = 'api::stock-item.stock-item';
const SALE_UID = 'api::sale.sale';
const SALE_ITEM_UID = 'api::sale-item.sale-item';
const PAYMENT_UID = 'api::payment.payment';
const REGISTER_UID = 'api::cash-register.cash-register';
const ORDER_UID = 'api::sale-order.sale-order';
const PERSON_UID = 'api::person.person';
const ADJ_UID = 'api::stock-adjustment.stock-adjustment';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`); }
}

async function req(method, path, token, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

const maxId = async (db, table) => {
  const r = await db(table).max('id as m').first();
  return (r && r.m) || 0;
};

async function main() {
  buildCompatStrapi();
  initModules();

  const db = getDb();
  const created = [];
  const track = (uid, doc) => { if (doc && doc.documentId) created.push([uid, doc.documentId]); return doc; };
  const grants = [];
  const glSources = []; // [source_type, source_id] pairs to sweep
  let server = null;
  let notifMax = 0; let logMax = 0;
  let balanceSnap = null;

  try {
    // ── Actors ────────────────────────────────────────────────────────────
    // Staff user (role type rutba_app_user/authenticated) with NO open cash
    // register and NO inventory/stock app-role: gets the temp grant.
    const staffRows = await db('up_users as u')
      .join('up_users_role_lnk as rl', 'rl.user_id', 'u.id')
      .join('up_roles as r', 'r.id', 'rl.role_id')
      .where('u.blocked', 0)
      .whereIn('r.type', ['rutba_app_user', 'authenticated'])
      .whereNotExists(function () {
        this.select(1).from('cash_registers as c')
          .whereRaw('(c.opened_by_id = u.id)')
          .whereIn('c.status', ['Active', 'Open']);
      })
      .select('u.id', 'u.username', 'u.email')
      // cancelOrder's non-owner path needs role type rutba_app_user — put
      // those first so `staff` can drive the whole fulfillment machine.
      .orderByRaw("case when r.type = 'rutba_app_user' then 0 else 1 end")
      .limit(3);
    check('found staff users without an open register', staffRows.length >= 2, `got ${staffRows.length}`);
    const [staff, posUser] = staffRows;

    // A user with NO inventory/stock role for the 403 probe — and NOT one of
    // the actors above (staff is about to receive the temp grant).
    const plainRow = await db('up_users as u')
      .join('up_users_role_lnk as rl', 'rl.user_id', 'u.id')
      .join('up_roles as r', 'r.id', 'rl.role_id')
      .where('u.blocked', 0)
      .whereNot('r.type', 'admin')
      .whereNotIn('u.id', [staff.id, posUser.id])
      .whereNotExists(function () {
        this.select(1).from('up_users_app_roles_lnk as l')
          .join('api_pro_app_roles as ar', 'ar.id', 'l.app_role_id')
          .whereRaw('l.user_id = u.id')
          .where(function () {
            this.where('ar.key', 'like', 'inventory_%').orWhere('ar.key', 'like', 'stock_%');
          });
      })
      .select('u.id').first();
    check('found a user without inventory/stock roles', Boolean(plainRow));

    const invRole = await db('api_pro_app_roles')
      .where('key', 'like', 'inventory_%').where('key', 'like', '%admin%').first('id', 'key')
      || await db('api_pro_app_roles').where('key', 'like', 'stock_%admin%').first('id', 'key');
    check('inventory/stock admin app-role exists', Boolean(invRole), JSON.stringify(invRole));
    // Grant only when missing, and sweep only what WE inserted.
    const grantIfMissing = async (userId, appRoleId) => {
      const row = { user_id: userId, app_role_id: appRoleId };
      const existing = await db('up_users_app_roles_lnk').where(row).first('id');
      if (existing) return;
      await db('up_users_app_roles_lnk').insert(row);
      grants.push(row);
    };
    await grantIfMissing(staff.id, invRole.id);
    // listOffersForProduct requires an order/sale/cms membership — piggyback
    // a sale role on the same actor.
    const saleRole = await db('api_pro_app_roles').where('key', 'pos_admin').first('id');
    if (saleRole) await grantIfMissing(staff.id, saleRole.id);
    // The cash-register routes are auth:false + requireAppRole('sale'/'accounts'),
    // so the POS actor needs a real drawer role — staff level, because that is
    // the cashier the gate has to keep letting through.
    const cashierRole = await db('api_pro_app_roles').where('key', 'pos_staff').first('id')
      || saleRole;
    check('a sale app-role exists for the POS actor', Boolean(cashierRole));
    if (cashierRole) await grantIfMissing(posUser.id, cashierRole.id);

    const tokenStaff = jwt.sign({ id: staff.id }, get('JWT_SECRET'), { expiresIn: '10m' });
    const tokenPos = jwt.sign({ id: posUser.id }, get('JWT_SECRET'), { expiresIn: '10m' });
    const tokenPlain = jwt.sign({ id: plainRow.id }, get('JWT_SECRET'), { expiresIn: '10m' });

    notifMax = await maxId(db, 'notifications');
    logMax = await maxId(db, 'notification_logs');
    // GL posting mutates cached acc-account balances (updateAccountBalances),
    // and the raw JE sweep below doesn't reverse them — snapshot & restore.
    balanceSnap = await db('acc_accounts').select('id', 'balance');

    server = await start(PORT);

    // ── A. anon gates ─────────────────────────────────────────────────────
    console.log('A. anon gates (selfAuth routes, controller-enforced)');
    for (const [m, p] of [
      ['GET', '/api/cash-registers/active?desk_id=1'],
      ['GET', '/api/sales/search-by-stock-item?term=x'],
      ['GET', '/api/sale-orders'],
      ['GET', '/api/rider/me'],
      ['POST', '/api/return-requests'],
    ]) {
      const r = await req(m, p);
      check(`anon ${m} ${p} -> 401`, r.status === 401, `got ${r.status}`);
    }

    // ── B. web order flow ─────────────────────────────────────────────────
    console.log('B. web order flow');
    const webProduct = track(PRODUCT_UID, await documents(PRODUCT_UID).create({
      data: { name: `${MARK} web product`, sku: `${MARK}-web-sku`, selling_price: 500, cost_price: 300 },
    }));
    await documents(PRODUCT_UID).publish({ documentId: webProduct.documentId });

    const orderRes = await req('POST', '/api/orders', null, {
      data: {
        products: { items: [{ product: webProduct.documentId, quantity: 1, price: 500 }] },
        customer: {
          name: `${MARK} buyer`, email: `${MARK}@example.test`, phone: '0300xxxxxxx',
          line1: '1 Marker St', city: 'Karachi', country: 'PK', zip_code: '74000',
        },
        payment_status: 'Ordered', subtotal: 500, total: 500,
      },
    });
    const order = orderRes.body && orderRes.body.data;
    check('guest checkout creates the order (re-priced server-side)',
      orderRes.status === 200 && order && order.documentId
      && order.order_status === 'PAYMENT_CONFIRMED' && Number(order.total) === 500,
      JSON.stringify(order && [orderRes.status, order.order_status, order.total]));
    if (order) created.push([ORDER_UID, order.documentId]);
    if (order && order.customer_person) created.push([PERSON_UID, order.customer_person.documentId]);
    check('provisional person resolved for the guest',
      order && order.customer_person && /example\.test$/.test(order.customer_person.email || ''),
      JSON.stringify(order && order.customer_person && order.customer_person.email));

    const trackBad = order && await req('GET', `/api/sale-orders/tracking/${order.documentId}?secret=WRONG`);
    check('tracking rejects a wrong secret', trackBad && trackBad.status === 403, trackBad && `got ${trackBad.status}`);
    const trackOk = order && await req('GET', `/api/sale-orders/tracking/${order.documentId}?secret=${order.order_secret}`);
    check('tracking returns the public projection with the secret',
      trackOk && trackOk.status === 200 && trackOk.body.data.order_status === 'PAYMENT_CONFIRMED'
      && trackOk.body.data.order_id === order.order_id,
      trackOk && JSON.stringify([trackOk.status, trackOk.body && trackOk.body.data && trackOk.body.data.order_id]));

    const prep = order && await req('POST', `/api/sale-orders/${order.documentId}/update-status`,
      tokenStaff, { data: { status: 'PREPARING' } });
    check('staff drives the state machine (PAYMENT_CONFIRMED -> PREPARING)',
      prep && prep.status === 200 && prep.body.data.order_status === 'PREPARING',
      prep && JSON.stringify([prep.status, prep.body && prep.body.data && prep.body.data.order_status]));
    const badTransition = order && await req('POST', `/api/sale-orders/${order.documentId}/update-status`,
      tokenStaff, { data: { status: 'DELIVERED' } });
    check('invalid transition rejected (PREPARING -> DELIVERED)',
      badTransition && badTransition.status === 400, badTransition && `got ${badTransition.status}`);

    const cancelRes = order && await req('POST', `/api/sale-orders/${order.documentId}/cancel`, tokenStaff);
    check('staff cancel lands the order in CANCELLED',
      cancelRes && cancelRes.status === 200 && cancelRes.body.data.order_status === 'CANCELLED',
      cancelRes && JSON.stringify([cancelRes.status, cancelRes.body && cancelRes.body.data && cancelRes.body.data.order_status]));

    // ── C. POS flow ───────────────────────────────────────────────────────
    console.log('C. POS sale flow (register -> checkout -> GL -> close)');
    const openRes = await req('POST', '/api/cash-registers/open', tokenPos,
      { data: { desk_id: DESK_ID, desk_name: `${MARK} desk`, opening_cash: 0 } });
    const register = openRes.body && openRes.body.data;
    const registerFresh = register && Number(register.desk_id) === DESK_ID;
    check('register opens on the marker desk, stamped from the caller',
      openRes.status === 200 && registerFresh && register.status === 'Active'
      && Number(register.opened_by_id) === posUser.id,
      JSON.stringify(register && [openRes.status, register.desk_id, register.status, register.opened_by_id]));
    if (registerFresh) created.push([REGISTER_UID, register.documentId]);

    const activeRes = await req('GET', `/api/cash-registers/active?desk_id=${DESK_ID}`, tokenPos);
    check('active lookup finds it by desk',
      activeRes.status === 200 && activeRes.body.data
      && activeRes.body.data.documentId === (register && register.documentId),
      JSON.stringify(activeRes.body && activeRes.body.data && activeRes.body.data.documentId));

    const posProduct = track(PRODUCT_UID, await documents(PRODUCT_UID).create({
      data: { name: `${MARK} pos product`, sku: `${MARK}-pos-sku`, selling_price: 500, cost_price: 300 },
    }));
    const stockUnit = track(STOCK_UID, await documents(STOCK_UID).create({
      data: {
        name: `${MARK} pos product`, sku: `${MARK}-apps/inventory/stock-sku`, status: 'InStock',
        cost_price: 300, product: { connect: [posProduct.documentId] },
      },
    }));
    const sale = track(SALE_UID, await documents(SALE_UID).create({
      data: {
        invoice_no: `${MARK}-INV-1`, sale_date: new Date().toISOString(),
        subtotal: 500, total: 500, status: 'Draft',
        ...(registerFresh ? { cash_register: { connect: [register.documentId] } } : {}),
      },
    }));
    const saleItem = track(SALE_ITEM_UID, await documents(SALE_ITEM_UID).create({
      data: {
        quantity: 1, price: 500, total: 500, subtotal: 500,
        sale: { connect: [sale.documentId] },
        product: { connect: [posProduct.documentId] },
      },
    }));
    // stock-item owns the sale_items relation (sale-item.items is mappedBy).
    await documents(STOCK_UID).update({
      documentId: stockUnit.documentId,
      data: { sale_items: { connect: [saleItem.documentId] } },
    });

    const jeMaxBefore = await maxId(db, 'acc_journal_entries');
    const checkoutRes = await req('POST', `/api/sales/${sale.documentId}/checkout`, tokenPos,
      { data: { payments: [{ payment_method: 'Cash', amount: 500, cash_received: 500, change: 0 }] } });
    check('checkout settles the sale', checkoutRes.status === 200
      && checkoutRes.body.completed === true && Number(checkoutRes.body.totalPaid) === 500,
      JSON.stringify(checkoutRes.body));

    const paidSale = await documents(SALE_UID).findOne({
      documentId: sale.documentId, populate: { payments: true },
    });
    check('sale is Completed/Paid with the payment row attached',
      paidSale && paidSale.status === 'Completed' && paidSale.payment_status === 'Paid'
      && (paidSale.payments || []).length === 1,
      JSON.stringify(paidSale && [paidSale.status, paidSale.payment_status, (paidSale.payments || []).length]));
    for (const p of (paidSale && paidSale.payments) || []) created.push([PAYMENT_UID, p.documentId]);

    const soldUnit = await documents(STOCK_UID).findOne({ documentId: stockUnit.documentId });
    check('stock unit flipped to Sold', soldUnit && soldUnit.status === 'Sold',
      JSON.stringify(soldUnit && soldUnit.status));

    const saleJEs = await db('acc_journal_entries')
      .where('id', '>', jeMaxBefore).where('source_type', 'POS Sale').select('id', 'description');
    console.log(`  (GL: ${saleJEs.length} POS Sale journal entr${saleJEs.length === 1 ? 'y' : 'ies'} posted — best-effort by design)`);
    if (saleJEs.length) {
      const lineLinks = await db('acc_journal_lines_journal_entry_lnk')
        .whereIn('acc_journal_entry_id', saleJEs.map((j) => j.id)).count('* as n').first();
      check('journal lines written and linked for the POS sale entries',
        Number(lineLinks.n) >= 4, `got ${lineLinks.n} line links across ${saleJEs.length} entries`);
    }
    glSources.push(['POS Sale', paidSale && paidSale.id]);
    glSources.push(['Cash Register Open', register && register.id]);
    glSources.push(['Cash Register Close', register && register.id]);

    const detailRes = await req('GET', `/api/sales/${sale.documentId}/detail`, tokenPos);
    check('sale detail tree served (items + payments + register)',
      detailRes.status === 200 && detailRes.body.data
      && detailRes.body.data.invoice_no === `${MARK}-INV-1`
      && (detailRes.body.data.items || []).length === 1
      && (detailRes.body.data.payments || []).length === 1,
      JSON.stringify(detailRes.body && detailRes.body.data
        && [detailRes.body.data.invoice_no, (detailRes.body.data.items || []).length]));

    const searchRes = await req('GET', `/api/sales/search-by-stock-item?term=${MARK}-apps/inventory/stock`, tokenPos);
    check('search-by-stock-item finds the sale through the unit',
      searchRes.status === 200 && (searchRes.body.data || []).includes(sale.documentId),
      JSON.stringify(searchRes.body));

    const closeRes = registerFresh && await req('POST', `/api/cash-registers/${register.documentId}/close`,
      tokenPos, { data: { counted_cash: 500 } });
    check('register closes with the POS reconciliation math (expected 500, diff 0)',
      closeRes && closeRes.status === 200 && closeRes.body.data.status === 'Closed'
      && Number(closeRes.body.data.expected_cash) === 500 && Number(closeRes.body.data.difference) === 0,
      closeRes && JSON.stringify([closeRes.status, closeRes.body.data && closeRes.body.data.expected_cash,
        closeRes.body.data && closeRes.body.data.difference]));

    // ── D. stock-adjustment transitions ───────────────────────────────────
    console.log('D. stock-adjustment post/cancel');
    const adjProduct = track(PRODUCT_UID, await documents(PRODUCT_UID).create({
      data: { name: `${MARK} adj product`, sku: `${MARK}-adj-sku`, selling_price: 200, cost_price: 100 },
    }));
    const unitA = track(STOCK_UID, await documents(STOCK_UID).create({
      data: { name: `${MARK} unit A`, status: 'InStock', cost_price: 100, product: { connect: [adjProduct.documentId] } },
    }));
    const unitB = track(STOCK_UID, await documents(STOCK_UID).create({
      data: { name: `${MARK} unit B`, status: 'InStock', cost_price: 100, product: { connect: [adjProduct.documentId] } },
    }));
    const adj = track(ADJ_UID, await documents(ADJ_UID).create({
      data: {
        type: 'WriteOff', status: 'Draft', reason: `${MARK} shrinkage`,
        stock_items: { connect: [unitA.documentId, unitB.documentId] },
      },
    }));
    check('adjustment_number auto-assigned by the lifecycle',
      Boolean(adj.adjustment_number), JSON.stringify(adj.adjustment_number));
    glSources.push(['Inventory Adjustment', adj.id]);

    const postDenied = await req('POST', `/api/stock-adjustments/${adj.documentId}/post`, tokenPlain);
    check('post denied without an inventory/stock manager role',
      postDenied.status === 403, `got ${postDenied.status}`);

    const postRes = await req('POST', `/api/stock-adjustments/${adj.documentId}/post`, tokenStaff);
    check('post moves both units to the loss status',
      postRes.status === 200 && postRes.body.success === true && postRes.body.adjusted === 2
      && postRes.body.status === 'Posted',
      JSON.stringify(postRes.body));
    const unitAPosted = await documents(STOCK_UID).findOne({ documentId: unitA.documentId });
    check('unit is Reduced after WriteOff post', unitAPosted && unitAPosted.status === 'Reduced',
      JSON.stringify(unitAPosted && unitAPosted.status));

    const cancelAdj = await req('POST', `/api/stock-adjustments/${adj.documentId}/cancel`, tokenStaff);
    check('cancel reverts exactly the adjusted units',
      cancelAdj.status === 200 && cancelAdj.body.reverted === 2 && cancelAdj.body.status === 'Cancelled',
      JSON.stringify(cancelAdj.body));
    const unitABack = await documents(STOCK_UID).findOne({ documentId: unitA.documentId });
    check('unit restored to InStock', unitABack && unitABack.status === 'InStock',
      JSON.stringify(unitABack && unitABack.status));

    // ── E. read contracts ─────────────────────────────────────────────────
    console.log('E. read contracts');
    const rp = await req('GET', '/api/return-policy', tokenPlain);
    check('return-policy resolver serves the effective policy',
      rp.status === 200 && rp.body && rp.body.data !== undefined,
      `status ${rp.status}`);
    const offersDenied = await req('GET', `/api/sale-offers/for-product/${webProduct.documentId}`, tokenPlain);
    check('sale-offers for-product gated on order/sale/cms membership',
      offersDenied.status === 403, `got ${offersDenied.status}`);
    const offers = await req('GET', `/api/sale-offers/for-product/${webProduct.documentId}`, tokenStaff);
    check('sale-offers for-product answers for a product with no offers',
      offers.status === 200 && offers.body.data
      && offers.body.data.product && offers.body.data.product.documentId === webProduct.documentId
      && Array.isArray(offers.body.data.offers) && offers.body.data.offers.length === 0,
      JSON.stringify(offers.body));
    const mine = await req('GET', '/api/return-requests/mine', tokenPlain);
    check('return-requests/mine returns the owner-scoped list',
      mine.status === 200 && Array.isArray(mine.body.data), `status ${mine.status}`);
    const riderMe = await req('GET', '/api/rider/me', tokenPlain);
    check('rider/me answers for a non-rider without erroring',
      (riderMe.status === 200 && riderMe.body.data === null) || riderMe.status === 403 || riderMe.status === 404,
      `status ${riderMe.status}`);
  } finally {
    for (const [uid, documentId] of created.reverse()) {
      try { await documents(uid).delete({ documentId }); } catch (e) { console.log(`  (cleanup ${uid} ${documentId}: ${e.message})`); }
    }
    // GL entries posted by checkout / register open-close / adjustment. The
    // acc-journal-entry lifecycle (correctly) refuses to delete Posted
    // entries through documents(), so the sweep goes RAW: line rows first,
    // then entry rows — their *_lnk rows FK-cascade.
    for (const [type, id] of glSources) {
      if (!id) continue;
      try {
        const entryIds = (await db('acc_journal_entries')
          .where({ source_type: type, source_id: id }).select('id')).map((r) => r.id);
        if (!entryIds.length) continue;
        const lineIds = (await db('acc_journal_lines_journal_entry_lnk')
          .whereIn('acc_journal_entry_id', entryIds).select('acc_journal_line_id'))
          .map((r) => r.acc_journal_line_id);
        if (lineIds.length) await db('acc_journal_lines').whereIn('id', lineIds).del();
        await db('acc_journal_entries').whereIn('id', entryIds).del();
      } catch (e) { console.log(`  (GL sweep ${type}#${id}: ${e.message})`); }
    }
    // Notification side effects: order_placed on create, preparing +
    // cancelled from the transitions.
    try {
      await db('notifications').where('id', '>', notifMax)
        .whereIn('event_name', ['order_placed', 'preparing', 'cancelled']).del();
    } catch {}
    try {
      await db('notification_logs').where('id', '>', logMax)
        .whereIn('event_name', ['order_placed', 'preparing', 'cancelled']).del();
    } catch {}
    if (balanceSnap) {
      for (const s of balanceSnap) {
        try { await db('acc_accounts').where('id', s.id).update({ balance: s.balance }); } catch {}
      }
    }
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
