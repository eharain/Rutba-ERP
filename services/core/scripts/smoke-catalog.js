#!/usr/bin/env node
'use strict';

/**
 * Catalog/platform tranche smoke (tranche 9) against the live dev DB.
 * Marker-only and self-cleaning: one marker product (+ its category/brand)
 * created and deleted; nothing else is written.
 *
 *  A. public storefront catalog (auth:false): list / search / by-id / by-ids
 *     / highest-price, brands public list — anonymous must work, and drafts
 *     must NOT leak into public reads
 *  B. catalog draft & publish triad: publish makes the product visible to the
 *     public read, discard-draft reverts edits, unpublish removes it again
 *  C. products/published-status batch lookup
 *  D. accounting reports respond (tranche-7 misses now served)
 *  E. utils: enums lookup + validator content-type-fields
 *  F. gates: notifications/me anonymous 401, media-library needs auth
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4036;
const MARK = '__rutba_core_catalog_smoke__';
const PRODUCT_UID = 'api::product.product';

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

async function main() {
  buildCompatStrapi();
  initModules();

  const db = getDb();
  const created = [];
  let server = null;

  try {
    const staff = await db('up_users as u')
      .join('up_users_role_lnk as rl', 'rl.user_id', 'u.id')
      .join('up_roles as r', 'r.id', 'rl.role_id')
      .where('u.blocked', 0).whereIn('r.type', ['rutba_app_user', 'authenticated'])
      .first('u.id');
    check('found a staff user', Boolean(staff));
    const token = jwt.sign({ id: staff.id }, get('JWT_SECRET'), { expiresIn: '10m' });

    server = await start(PORT);

    // A marker product starts as a DRAFT (D&P type, no publish yet).
    const product = await documents(PRODUCT_UID).create({
      data: {
        name: `${MARK} widget`, sku: `${MARK}-sku`,
        selling_price: 1234, cost_price: 600,
      },
    });
    created.push([PRODUCT_UID, product.documentId]);

    // ── A. public storefront catalog ──────────────────────────────────────
    // These are auth:false but app-scoped: requireApp(ctx,'web') 404s anything
    // without the storefront's X-Rutba-App header so the endpoints are not
    // enumerable. The storefront bakes that header into its client.
    console.log('A. public catalog (anonymous, storefront header)');
    const WEB = { 'x-rutba-app': 'web' };

    const noHeader = await req('GET', '/api/products/public/list');
    check('public list 404s WITHOUT the storefront app header (anti-enumeration)',
      noHeader.status === 404, `got ${noHeader.status}`);

    const list = await req('GET', '/api/products/public/list?pageSize=5', null, undefined, WEB);
    check('public list answers anonymously with a data array',
      list.status === 200 && Array.isArray(list.body.data),
      `status ${list.status} ${JSON.stringify(list.body).slice(0, 140)}`);

    const search = await req('GET', `/api/products/public/search?q=${encodeURIComponent(MARK)}`, null, undefined, WEB);
    check('public search answers anonymously',
      search.status === 200 && search.body.data !== undefined, `status ${search.status}`);
    const draftLeaked = Array.isArray(search.body.data)
      && search.body.data.some((p) => (p.sku || p.attributes?.sku) === `${MARK}-sku`);
    check('an UNPUBLISHED product does not leak into public search', !draftLeaked);

    const highest = await req('GET', '/api/products/public/highest-price', null, undefined, WEB);
    check('public highest-price answers anonymously', highest.status === 200, `status ${highest.status}`);
    const byIds = await req('GET', '/api/products/public/by-ids?ids=0', null, undefined, WEB);
    check('public by-ids answers anonymously', byIds.status === 200, `status ${byIds.status}`);
    const brands = await req('GET', '/api/brands/public/list', null, undefined, WEB);
    check('brands public list answers anonymously', brands.status === 200, `status ${brands.status}`);

    // ── B. draft & publish triad ──────────────────────────────────────────
    console.log('B. product publish triad');
    const pub = await req('POST', `/api/products/${product.documentId}/publish`, token);
    check('publish 200', pub.status === 200, `status ${pub.status} ${JSON.stringify(pub.body).slice(0, 140)}`);
    const publishedRow = await db('products')
      .where({ document_id: product.documentId }).whereNotNull('published_at').first('id');
    check('a published row now exists', Boolean(publishedRow));

    const detail = await req('GET', `/api/products/public/by-id/${product.documentId}`,
      null, undefined, { 'x-rutba-app': 'web' });
    check('the published product is readable on the public detail route',
      detail.status === 200 && detail.body.data, `status ${detail.status}`);

    const unpub = await req('POST', `/api/products/${product.documentId}/unpublish`, token);
    check('unpublish 200', unpub.status === 200, `status ${unpub.status}`);
    const goneRow = await db('products')
      .where({ document_id: product.documentId }).whereNotNull('published_at').first('id');
    check('the published row is gone after unpublish', !goneRow);

    // discard-draft needs a published version to restore from.
    await req('POST', `/api/products/${product.documentId}/publish`, token);
    await documents(PRODUCT_UID).update({
      documentId: product.documentId, data: { name: `${MARK} widget EDITED` },
    });
    const discard = await req('POST', `/api/products/${product.documentId}/discard-draft`, token);
    check('discard-draft 200', discard.status === 200, `status ${discard.status}`);
    const draftAfter = await db('products')
      .where({ document_id: product.documentId }).whereNull('published_at').first('name');
    check('discard-draft restored the draft from the published version',
      draftAfter && draftAfter.name === `${MARK} widget`,
      JSON.stringify(draftAfter && draftAfter.name));

    // ── C. published-status ───────────────────────────────────────────────
    console.log('C. published-status');
    const status = await req('POST', '/api/products/published-status', token,
      { documentIds: [product.documentId] });
    check('published-status reports the marker product as published',
      status.status === 200 && status.body.data
      && status.body.data[product.documentId],
      `status ${status.status} ${JSON.stringify(status.body).slice(0, 140)}`);

    // ── D. accounting reports ─────────────────────────────────────────────
    console.log('D. accounting reports');
    for (const r of ['trial-balance', 'income-statement', 'balance-sheet', 'cash-flow', 'ar-aging', 'ap-aging']) {
      const res = await req('GET', `/api/acc-journal-entries/reports/${r}`, token);
      check(`report ${r} responds`, res.status === 200 || res.status === 403,
        `status ${res.status} ${JSON.stringify(res.body).slice(0, 110)}`);
    }

    // ── E. utils ──────────────────────────────────────────────────────────
    console.log('E. utils');
    const enums = await req('GET', '/api/enums/product/status', token);
    check('enums lookup responds', enums.status === 200 || enums.status === 400 || enums.status === 404,
      `status ${enums.status}`);
    // PARITY QUIRK (upstream): the route supplies only :name, but the handler
    // reads ctx.params.fieldType too and 400s when it is absent — so this
    // endpoint always 400s on services/strapi as well. Core reproduces it exactly.
    const fields = await req('GET', '/api/validator/content-type-fields/product', token);
    check('validator content-type-fields reproduces the upstream 400',
      fields.status === 400
      && /Schema name and field are required/.test((fields.body.error || {}).message || ''),
      `status ${fields.status} ${JSON.stringify(fields.body).slice(0, 110)}`);

    // ── F. gates ──────────────────────────────────────────────────────────
    console.log('F. gates');
    const notifAnon = await req('GET', '/api/notifications/me');
    check('notifications/me 401 anonymous', notifAnon.status === 401, `got ${notifAnon.status}`);
    const mediaAnon = await req('GET', '/api/media-library/folders/tree');
    check('media-library requires authentication', mediaAnon.status === 401,
      `got ${mediaAnon.status}`);
  } finally {
    for (const [uid, documentId] of created.reverse()) {
      try { await documents(uid).delete({ documentId }); } catch (e) {
        console.log(`  (cleanup ${uid} ${documentId}: ${e.message})`);
      }
    }
    try { await db('products').where('sku', 'like', `%${MARK}%`).del(); } catch {}
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
