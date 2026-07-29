#!/usr/bin/env node
'use strict';

/**
 * mfg tranche smoke — exercises the ported manufacturing module end-to-end
 * against the live dev DB. Self-cleaning: every row it creates carries the
 * marker and is deleted at the end (best-effort, also on failure).
 *
 *  A. Lifecycle adapters over documents() writes:
 *     lot defaults → issue ledger → lot balance recompute → issue delete
 *     restores balance; job-work jw_number default.
 *  B. mfg-bom KIND-typing document middleware: Active BOM with a
 *     finished_good input → blocked (ValidationError); Draft → allowed.
 *  C. HTTP custom routes (server on :4022): WO state machine
 *     (401 no token, 400 invalid move, Released → InProgress → Completed),
 *     bundle process, lot recompute (manager gate via UP role populate).
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents, getRegistry } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4022;
const MARK = '__rutba_core_mfg_smoke__';

const LOT_UID = 'api::mfg-material-lot.mfg-material-lot';
const ISSUE_UID = 'api::mfg-material-issue.mfg-material-issue';
const JW_UID = 'api::mfg-job-work.mfg-job-work';
const BOM_UID = 'api::mfg-bom.mfg-bom';
const PRODUCT_UID = 'api::product.product';
const WO_UID = 'api::mfg-work-order.mfg-work-order';
const BUNDLE_UID = 'api::mfg-bundle.mfg-bundle';
const ACTIVITY_UID = 'api::work-item-activity.work-item-activity';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function post(path, token, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function main() {
  // Sections A/B run before the HTTP server boots — register the module's
  // document middlewares (lifecycle adapters, BOM typing) up front. The later
  // buildServer() call reuses the same initialized registry.
  buildCompatStrapi();
  initModules();

  const db = getDb();
  const created = []; // [uid, documentId] LIFO cleanup

  const track = (uid, row) => { created.push([uid, row.documentId]); return row; };
  const cleanup = async () => {
    for (const [uid, documentId] of created.reverse()) {
      try { await documents(uid).delete({ documentId }); } catch {}
    }
    // Audit-trail rows created by the transitions.
    const actTable = getRegistry().models.get(ACTIVITY_UID).tableName;
    try { await db(actTable).where('summary', 'like', `%${MARK}%`).del(); } catch {}
  };

  let server = null;
  let tempGrant = null;
  try {
    // ── A. lifecycle adapters ────────────────────────────────────────────
    console.log('A. lifecycles through documents()');

    const lot = track(LOT_UID, await documents(LOT_UID).create({
      data: { lot_code: `${MARK}-LOT`, quantity_received: 100, unit_cost: 5, status: 'Available', uom: 'm' },
    }));
    check('lot beforeCreate defaults quantity_remaining', Number(lot.quantity_remaining) === 100, `got ${lot.quantity_remaining}`);
    check('lot beforeCreate defaults total_cost', Number(lot.total_cost) === 500, `got ${lot.total_cost}`);
    check('lot beforeCreate stamps received_at', Boolean(lot.received_at));

    const issue = await documents(ISSUE_UID).create({
      data: { quantity: 30, issue_type: 'Issue', unit_cost: 5, material_lot: lot.id, notes: MARK },
    });
    check('issue beforeCreate stamps issued_at', Boolean(issue.issued_at));
    check('issue beforeCreate computes total_cost', Number(issue.total_cost) === 150, `got ${issue.total_cost}`);

    let lotAfter = await documents(LOT_UID).findOne({ documentId: lot.documentId });
    check('issue afterCreate recomputes lot balance', Number(lotAfter.quantity_remaining) === 70, `got ${lotAfter.quantity_remaining}`);
    check('lot status derived PartiallyConsumed', lotAfter.status === 'PartiallyConsumed', `got ${lotAfter.status}`);

    await documents(ISSUE_UID).delete({ documentId: issue.documentId });
    lotAfter = await documents(LOT_UID).findOne({ documentId: lot.documentId });
    check('issue afterDelete restores lot balance', Number(lotAfter.quantity_remaining) === 100, `got ${lotAfter.quantity_remaining}`);
    check('lot status back to Available', lotAfter.status === 'Available', `got ${lotAfter.status}`);

    const jw = track(JW_UID, await documents(JW_UID).create({ data: { notes: MARK } }));
    check('job-work beforeCreate assigns jw_number', /^JW-/.test(jw.jw_number || ''), `got ${jw.jw_number}`);

    // ── B. BOM typing middleware ─────────────────────────────────────────
    console.log('B. mfg-bom KIND typing');

    const fg = track(PRODUCT_UID, await documents(PRODUCT_UID).create({
      data: { name: `${MARK} finished`, kind: 'finished_good' },
    }));

    let blocked = false; let blockMsg = '';
    try {
      await documents(BOM_UID).create({
        data: {
          name: `${MARK}-bom-active`,
          status: 'Active',
          output_quantity: 1,
          product: fg.id,
          material_lines: [{ material_product: fg.id, quantity: 1 }],
        },
      });
    } catch (e) { blocked = true; blockMsg = e.message; }
    check('Active BOM with finished_good input blocked', blocked, 'create succeeded');
    check('block is a typing ValidationError', /BOM typing/.test(blockMsg), blockMsg);

    const draftBom = track(BOM_UID, await documents(BOM_UID).create({
      data: {
        name: `${MARK}-bom-draft`,
        status: 'Draft',
        output_quantity: 1,
        product: fg.id,
        material_lines: [{ material_product: fg.id, quantity: 1 }],
      },
    }));
    check('Draft BOM with same violation allowed (warn only)', Boolean(draftBom.documentId));

    // ── C. HTTP custom routes ────────────────────────────────────────────
    console.log('C. HTTP transition routes');

    // The manager gates read app_roles from the DB (isManufacturingManager /
    // requireAppRole) — temp-grant manufacturing_admin to a test user, removed
    // in cleanup.
    const testUser = await db('up_users').where('blocked', 0).first('id', 'email');
    check('found test user', Boolean(testUser), 'no unblocked up_users');
    const mfgAdminRole = await db('api_pro_app_roles').where('key', 'manufacturing_admin').first('id');
    check('manufacturing_admin app-role exists', Boolean(mfgAdminRole));
    const existingGrant = await db('up_users_app_roles_lnk')
      .where({ user_id: testUser.id, app_role_id: mfgAdminRole.id }).first('id');
    if (!existingGrant) {
      await db('up_users_app_roles_lnk').insert({ user_id: testUser.id, app_role_id: mfgAdminRole.id });
      tempGrant = { user_id: testUser.id, app_role_id: mfgAdminRole.id };
    }
    const token = jwt.sign({ id: testUser.id }, get('JWT_SECRET'), { expiresIn: '10m' });

    server = await start(PORT);

    const wo = track(WO_UID, await documents(WO_UID).create({
      data: { wo_number: MARK, name: MARK, status: 'Draft', quantity_ordered: 5, overhead_rate: 0 },
    }));
    const woPath = `/api/mfg-work-orders/${wo.documentId}/process`;

    const noAuth = await post(woPath, null, { status: 'Released' });
    check('WO process 401 without token', noAuth.status === 401, `got ${noAuth.status}`);

    const badMove = await post(woPath, token, { status: 'Completed' });
    check('WO Draft→Completed rejected 400', badMove.status === 400, `got ${badMove.status} ${JSON.stringify(badMove.body && badMove.body.error)}`);

    const rel = await post(woPath, token, { status: 'Released' });
    check('WO Draft→Released 200', rel.status === 200 && rel.body && rel.body.data && rel.body.data.status === 'Released',
      `got ${rel.status} ${JSON.stringify(rel.body && (rel.body.error || rel.body.data && rel.body.data.status))}`);

    const prog = await post(woPath, token, { status: 'InProgress' });
    check('WO Released→InProgress 200 + started_at', prog.status === 200 && Boolean(prog.body.data && prog.body.data.started_at),
      `got ${prog.status}`);

    const done = await post(woPath, token, { status: 'Completed', quantity_finished: 0 });
    check('WO InProgress→Completed 200', done.status === 200 && done.body.data && done.body.data.status === 'Completed',
      `got ${done.status} ${JSON.stringify(done.body && done.body.error)}`);
    check('WO completion stamps completed_at + costing', Boolean(done.body.data && done.body.data.completed_at) && done.body.data.total_cost !== undefined,
      JSON.stringify(done.body.data && { completed_at: done.body.data.completed_at, total_cost: done.body.data.total_cost }));

    const activityCount = await db(getRegistry().models.get(ACTIVITY_UID).tableName)
      .where('target_document_id', wo.documentId).count('id as n').first();
    check('transitions logged to work-item audit trail', Number(activityCount.n) >= 3, `got ${activityCount.n}`);

    const bundle = track(BUNDLE_UID, await documents(BUNDLE_UID).create({
      data: { bundle_code: MARK, quantity: 10, status: 'Created', work_order: wo.id },
    }));
    const bundlePath = `/api/mfg-bundles/${bundle.documentId}/process`;
    const bundleBad = await post(bundlePath, token, { status: 'InProgress' });
    check('bundle Created→InProgress rejected 400', bundleBad.status === 400, `got ${bundleBad.status}`);
    const bundleIssued = await post(bundlePath, token, { status: 'Issued' });
    check('bundle Created→Issued 200', bundleIssued.status === 200 && bundleIssued.body.data && bundleIssued.body.data.status === 'Issued',
      `got ${bundleIssued.status}`);

    // Manager-gated reconciliation — exercises the UP role populate through
    // isManufacturingManager (super-admin passes via role.type).
    const recompute = await post('/api/mfg-material-lots/recompute', token, {});
    check('lot recompute 200 for admin', recompute.status === 200 && recompute.body && recompute.body.success === true,
      `got ${recompute.status} ${JSON.stringify(recompute.body)}`);
  } finally {
    try { await cleanup(); } catch (e) { console.log('  WARN cleanup:', e.message); }
    if (tempGrant) {
      try { await db('up_users_app_roles_lnk').where(tempGrant).del(); } catch {}
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
