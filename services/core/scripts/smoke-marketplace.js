#!/usr/bin/env node
'use strict';

/**
 * Marketplace tranche smoke (tranche 6) against the live dev DB. Self-cleaning
 * and MARKER-ONLY: marker product/account/order/person/address rows are
 * deleted, the temp app-role grant and the temp API token row are removed, and
 * notification side effects from the cancel transition are swept by id
 * snapshot + event name (crm-smoke pattern). No marketplace API is ever
 * called — the worker owns the adapters; this surface is the data contract.
 *
 *  A. operator credential CRUD overrides (marketplace_admin gate) + PRIVATE
 *     FIELD serialization: api_secret/access_token must never leave the REST
 *     boundary (new stripPrivate), while the worker's /secrets read keeps them
 *  B. worker service-token gate (ctx.state.auth bridge): user token → 403,
 *     anon → 401, API token → 200
 *  C. engine-owned state patch: allowlist enforced, unknown keys rejected
 *  D. offer-prices / outbound-status / outbound-messages / ingest-messages /
 *     stamp-messages contract shapes on a fresh account
 *  E. ingest-orders: create (component line items, SKU→product resolution,
 *     provisional person, address, snapshot), idempotent skip, cancel-sync
 *     through the REAL order state machine (zero-copy executeTransition)
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4029;
const MARK = '__rutba_core_mkt_smoke__';

const ACC_UID = 'api::marketplace-account.marketplace-account';
const ORDER_UID = 'api::sale-order.sale-order';
const PRODUCT_UID = 'api::product.product';
const PERSON_UID = 'api::person.person';
const ADDRESS_UID = 'api::address.address';

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
  let tokenRowId = null;
  let server = null;
  let notifMax = 0; let logMax = 0;

  try {
    // Plain user + marketplace_admin holder.
    const plain = await db('up_users as u')
      .leftJoin('up_users_role_lnk as rl', 'rl.user_id', 'u.id')
      .leftJoin('up_roles as r', 'r.id', 'rl.role_id')
      .where('u.blocked', 0)
      .where(function () { this.whereNull('r.type').orWhereNot('r.type', 'admin'); })
      .whereNotExists(function () {
        this.select(1).from('up_users_app_roles_lnk as l')
          .join('api_pro_app_roles as ar', 'ar.id', 'l.app_role_id')
          .whereRaw('l.user_id = u.id')
          .whereRaw("`ar`.`key` like 'marketplace_%'");
      })
      .select('u.id', 'u.username')
      .limit(2);
    check('found two plain users', plain.length === 2, `got ${plain.length}`);
    const [userA, userB] = plain;

    const mktRole = await db('api_pro_app_roles').where('key', 'marketplace_admin').first('id');
    check('marketplace_admin app-role exists', Boolean(mktRole));
    await db('up_users_app_roles_lnk').insert({ user_id: userB.id, app_role_id: mktRole.id });
    grants.push({ user_id: userB.id, app_role_id: mktRole.id });

    const tokenA = jwt.sign({ id: userA.id }, get('JWT_SECRET'), { expiresIn: '10m' });
    const tokenB = jwt.sign({ id: userB.id }, get('JWT_SECRET'), { expiresIn: '10m' });

    // Temp Strapi API token: core's auth accepts the plain sha512 recipe.
    const rawKey = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const [insertedId] = await db('strapi_api_tokens').insert({
      document_id: 'smoke' + crypto.randomBytes(10).toString('hex').slice(0, 19),
      name: `${MARK} token`,
      type: 'full-access',
      access_key: crypto.createHash('sha512').update(rawKey).digest('hex'),
      created_at: now, updated_at: now, published_at: now,
    });
    tokenRowId = insertedId;

    notifMax = await maxId(db, 'notifications');
    logMax = await maxId(db, 'notification_logs');

    server = await start(PORT);

    // -- A. credential CRUD overrides + private-field serialization ---------
    console.log('A. account CRUD + private fields');
    const denied = await req('POST', '/api/marketplace-accounts', tokenA,
      { data: { platform: 'daraz', account_name: `${MARK} acc` } });
    check('account create denied for a plain user', denied.status === 403, `got ${denied.status}`);

    const accCreate = await req('POST', '/api/marketplace-accounts', tokenB, {
      data: {
        platform: 'daraz', account_name: `${MARK} acc`, is_active: false,
        api_secret: `${MARK}-sek`, access_token: `${MARK}-tok`,
        sync_orders_enabled: true,
      },
    });
    check('account create 201 via override (marketplace_admin gate)',
      accCreate.status === 201 && accCreate.body.data && accCreate.body.data.documentId,
      `status ${accCreate.status}`);
    const accDoc = accCreate.body.data.documentId;
    created.push([ACC_UID, accDoc]);
    check('create response strips private credential fields',
      accCreate.body.data.api_secret === undefined && accCreate.body.data.access_token === undefined
      && accCreate.body.data.extra_config === undefined,
      JSON.stringify(Object.keys(accCreate.body.data || {})));

    const accGet = await req('GET', `/api/marketplace-accounts/${accDoc}`, tokenB);
    check('findOne strips private fields too',
      accGet.status === 200 && accGet.body.data.api_secret === undefined
      && accGet.body.data.access_token === undefined
      && accGet.body.data.account_name === `${MARK} acc`,
      JSON.stringify(accGet.body.data && Object.keys(accGet.body.data)));

    const accUpd = await req('PUT', `/api/marketplace-accounts/${accDoc}`, tokenB,
      { data: { account_name: `${MARK} acc2` } });
    check('account update 200 via override', accUpd.status === 200, `status ${accUpd.status}`);

    // -- B. worker service-token gate ---------------------------------------
    console.log('B. service-token gate');
    const secretsUser = await req('GET', `/api/marketplace-accounts/${accDoc}/secrets`, tokenB);
    check('secrets 403 for a logged-in user', secretsUser.status === 403, `got ${secretsUser.status}`);
    const secretsAnon = await req('GET', `/api/marketplace-accounts/${accDoc}/secrets`);
    check('secrets 401 anonymous', secretsAnon.status === 401, `got ${secretsAnon.status}`);
    const secrets = await req('GET', `/api/marketplace-accounts/${accDoc}/secrets`, rawKey);
    check('secrets 200 with a service token, credentials INCLUDED',
      secrets.status === 200 && secrets.body.data.api_secret === `${MARK}-sek`
      && secrets.body.data.access_token === `${MARK}-tok`,
      `status ${secrets.status}`);

    // -- C. engine-owned state patch ----------------------------------------
    console.log('C. worker state patch');
    const patch = await req('PUT', `/api/marketplace-accounts/${accDoc}/state`, rawKey, {
      data: { seller_id: `${MARK}-seller`, last_orders_synced_at: new Date().toISOString() },
    });
    check('state patch 200 for allowed keys', patch.status === 200, `status ${patch.status}`);
    const afterPatch = await documents(ACC_UID).findOne({ documentId: accDoc });
    check('state patch persisted', afterPatch && afterPatch.seller_id === `${MARK}-seller`
      && afterPatch.last_orders_synced_at !== null,
      JSON.stringify(afterPatch && [afterPatch.seller_id, afterPatch.last_orders_synced_at]));
    const patchBad = await req('PUT', `/api/marketplace-accounts/${accDoc}/state`, rawKey,
      { data: { api_secret: 'nope' } });
    check('state patch rejects non-worker-patchable keys loudly',
      patchBad.status === 400 && /Not patchable/.test((patchBad.body.error || {}).message || ''),
      JSON.stringify(patchBad.body));

    // -- D. worker read contracts on a fresh account ------------------------
    console.log('D. worker read contracts');
    const prices = await req('POST', `/api/marketplace-accounts/${accDoc}/offer-prices`, rawKey,
      { productDocumentIds: [] });
    check('offer-prices empty ids -> {}', prices.status === 200
      && prices.body.data && Object.keys(prices.body.data).length === 0,
      JSON.stringify(prices.body));
    const outStatus = await req('GET', `/api/marketplace-accounts/${accDoc}/outbound-status`, rawKey);
    check('outbound-status: empty updates + watermark',
      outStatus.status === 200 && Array.isArray(outStatus.body.data.updates)
      && outStatus.body.data.updates.length === 0 && Boolean(outStatus.body.data.watermark),
      JSON.stringify(outStatus.body));
    const outMsgs = await req('GET', `/api/marketplace-accounts/${accDoc}/outbound-messages`, rawKey);
    check('outbound-messages: empty', outMsgs.status === 200
      && Array.isArray(outMsgs.body.data.messages) && outMsgs.body.data.messages.length === 0,
      JSON.stringify(outMsgs.body));
    const inMsgs = await req('POST', `/api/marketplace-accounts/${accDoc}/ingest-messages`, rawKey,
      { messages: [] });
    check('ingest-messages: zero totals', inMsgs.status === 200 && inMsgs.body.data.total === 0,
      JSON.stringify(inMsgs.body));
    const stamp = await req('POST', `/api/marketplace-accounts/${accDoc}/stamp-messages`, rawKey,
      { pairs: [] });
    check('stamp-messages: zero stamped', stamp.status === 200 && stamp.body.data.stamped === 0,
      JSON.stringify(stamp.body));

    // -- E. ingest-orders ----------------------------------------------------
    console.log('E. ingest-orders');
    const product = track(PRODUCT_UID, await documents(PRODUCT_UID).create({
      data: { name: `${MARK} product`, sku: `${MARK}-sku`, selling_price: 500, cost_price: 300 },
    }));

    const normalized = {
      externalOrderId: `${MARK}-EXT-1`,
      externalOrderNumber: 'MKT1001',
      status: 'pending',
      paymentMethod: 'COD',
      paid: false,
      currency: 'PKR',
      buyer: { name: `${MARK} buyer`, email: `${MARK}@example.test`, phone: '0300xxxxxxx' },
      shipping: { name: `${MARK} buyer`, line1: '1 Marker St', city: 'Karachi', country: 'PK', zip_code: '74000' },
      items: [
        { sku: `${MARK}-sku`, name: `${MARK} product`, quantity: 2, unitPrice: 100, total: 200 },
        { sku: 'no-such-sku-xyz', name: 'Mystery', quantity: 1, unitPrice: 50 },
      ],
      totals: { itemsTotal: 250, shippingFee: 150, total: 400 },
    };

    const ing = await req('POST', `/api/marketplace-accounts/${accDoc}/ingest-orders`, rawKey,
      { orders: [normalized] });
    const r0 = ing.body && ing.body.data && ing.body.data.results && ing.body.data.results[0];
    check('ingest creates the sale-order', ing.status === 200 && r0 && r0.action === 'created',
      JSON.stringify(ing.body));
    check('unmatched SKUs reported', r0 && r0.unmatched_skus === 1, JSON.stringify(r0));
    const orderDoc = r0 && r0.documentId;
    if (orderDoc) created.push([ORDER_UID, orderDoc]);

    const order = orderDoc && await documents(ORDER_UID).findOne({
      documentId: orderDoc,
      populate: {
        products: { populate: { items: { populate: { product: true } } } },
        customer_person: true,
        delivery_address: true,
        marketplace_account: true,
      },
    });
    check('order header mapped (channel, ids, totals, COD)',
      order && order.channel === 'daraz' && order.external_order_id === `${MARK}-EXT-1`
      && order.order_id === 'DARAZ-MKT1001' && Number(order.total) === 400
      && order.payment_method === 'cod' && order.order_status === 'PAYMENT_CONFIRMED',
      JSON.stringify(order && [order.channel, order.order_id, order.total, order.payment_method, order.order_status]));
    const items = (order && order.products && order.products.items) || [];
    check('component line items written (2 rows, SKU resolved on one)',
      items.length === 2
      && items.some((i) => i.product && i.product.documentId === product.documentId && i.quantity === 2)
      && items.some((i) => !i.product && /Mystery/.test(i.product_name || '')),
      JSON.stringify(items.map((i) => [i.product_name, i.quantity, i.product && i.product.documentId])));
    check('provisional person + address linked',
      order && order.customer_person && order.delivery_address
      && order.marketplace_account && order.marketplace_account.documentId === accDoc,
      JSON.stringify(order && [Boolean(order.customer_person), Boolean(order.delivery_address)]));
    if (order && order.delivery_address) created.push([ADDRESS_UID, order.delivery_address.documentId]);
    if (order && order.customer_person) created.push([PERSON_UID, order.customer_person.documentId]);

    const again = await req('POST', `/api/marketplace-accounts/${accDoc}/ingest-orders`, rawKey,
      { orders: [normalized] });
    const r1 = again.body && again.body.data && again.body.data.results && again.body.data.results[0];
    check('re-ingest is idempotent (skipped)', r1 && r1.action === 'skipped', JSON.stringify(r1));

    const cancel = await req('POST', `/api/marketplace-accounts/${accDoc}/ingest-orders`, rawKey,
      { orders: [{ ...normalized, status: 'cancelled' }] });
    const r2 = cancel.body && cancel.body.data && cancel.body.data.results && cancel.body.data.results[0];
    check('marketplace cancel drives the state machine',
      r2 && r2.action === 'updated' && r2.reason === 'cancelled', JSON.stringify(r2));
    const afterCancel = orderDoc && await documents(ORDER_UID).findOne({ documentId: orderDoc });
    check('order is CANCELLED', afterCancel && afterCancel.order_status === 'CANCELLED',
      JSON.stringify(afterCancel && afterCancel.order_status));

    // outbound-status now sees the cancelled order for this account
    const outAfter = await req('GET', `/api/marketplace-accounts/${accDoc}/outbound-status?since=${encodeURIComponent(new Date(Date.now() - 60000).toISOString())}`, rawKey);
    const upd = (outAfter.body.data.updates || []).find((u) => u.external_order_id === `${MARK}-EXT-1`);
    check('outbound-status reports the cancellation',
      outAfter.status === 200 && upd && upd.order_status === 'CANCELLED',
      JSON.stringify(outAfter.body.data));
  } finally {
    for (const [uid, documentId] of created.reverse()) {
      try { await documents(uid).delete({ documentId }); } catch (e) { console.log(`  (cleanup ${uid} ${documentId}: ${e.message})`); }
    }
    // Notification side effects from the CANCELLED transition.
    try { await db('notifications').where('id', '>', notifMax).where('event_name', 'cancelled').del(); } catch {}
    try { await db('notification_logs').where('id', '>', logMax).where('event_name', 'cancelled').del(); } catch {}
    if (tokenRowId) { try { await db('strapi_api_tokens').where('id', tokenRowId).del(); } catch {} }
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
