#!/usr/bin/env node
'use strict';

/**
 * hr/payroll tranche smoke — exercises the ported tranche-2 endpoints against
 * the live dev DB. Self-cleaning (marker rows deleted; temp app-role grants
 * removed).
 *
 *  A. Leave-request lifecycle through documents(): total_days derived from the
 *     date range on create and update.
 *  B. HTTP (server on :4024, X-Rutba-App-Role claim headers):
 *     - my-requests / team-queue (literal paths beat :documentId routes)
 *     - approve → idempotent re-approve → cancel → reject-after-cancel 400
 *     - create override (HR actor keeps explicit employee; total_days stamped)
 *     - hr-team app-role-options
 *     - payroll preview passes the gate for a payroll_admin claim and 403s for
 *       a non-payroll claim (utils/payroll-access reads the api-pro claim; the
 *       old phantom permission_roles gate admitted only Strapi super-admins)
 *     - my-payslips [] for a user with no employee link
 *     - work-item watch toggle on/off, comment create (author stamp + audit),
 *       assign rejects non-allowlisted entity_uid
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents, getRegistry } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4024;
const MARK = '__rutba_core_hr_smoke__';

const LR_UID = 'api::hr-leave-request.hr-leave-request';
const EMP_UID = 'api::hr-employee.hr-employee';
const WATCH_UID = 'api::work-item-watch.work-item-watch';
const COMMENT_UID = 'api::work-item-comment.work-item-comment';
const ACTIVITY_UID = 'api::work-item-activity.work-item-activity';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
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
  const track = (uid, row) => { created.push([uid, row.documentId]); return row; };
  const grants = [];

  let server = null;
  try {
    // ── A. leave-request lifecycle ───────────────────────────────────────
    console.log('A. leave-request lifecycle');

    const lr = track(LR_UID, await documents(LR_UID).create({
      data: { leave_type: 'Annual', start_date: '2026-08-03', end_date: '2026-08-07', status: 'Pending', reason: MARK },
    }));
    check('total_days derived on create (inclusive)', Number(lr.total_days) === 5, `got ${lr.total_days}`);

    const lr2 = await documents(LR_UID).update({
      documentId: lr.documentId,
      data: { start_date: '2026-08-03', end_date: '2026-08-04' },
    });
    check('total_days derived on update', Number(lr2.total_days) === 2, `got ${lr2.total_days}`);

    // ── B. HTTP ──────────────────────────────────────────────────────────
    console.log('B. HTTP custom routes');

    const user = await db('up_users').where('blocked', 0).first('id', 'email', 'username');
    check('found test user', Boolean(user));
    for (const key of ['hr_admin', 'payroll_admin', 'manufacturing_admin']) {
      const role = await db('api_pro_app_roles').where('key', key).first('id');
      check(`${key} app-role exists`, Boolean(role));
      if (role) {
        const has = await db('up_users_app_roles_lnk').where({ user_id: user.id, app_role_id: role.id }).first('id');
        if (!has) {
          await db('up_users_app_roles_lnk').insert({ user_id: user.id, app_role_id: role.id });
          grants.push({ user_id: user.id, app_role_id: role.id });
        }
      }
    }
    const token = jwt.sign({ id: user.id }, get('JWT_SECRET'), { expiresIn: '10m' });
    const hrHeaders = { 'X-Rutba-App': 'hr', 'X-Rutba-App-Role': 'hr_admin' };
    const payHeaders = { 'X-Rutba-App': 'payroll', 'X-Rutba-App-Role': 'payroll_admin' };

    server = await start(PORT);

    const noAuth = await req('GET', '/api/hr-leave-requests/my-requests');
    check('my-requests 401 without token', noAuth.status === 401, `got ${noAuth.status}`);

    const mine = await req('GET', '/api/hr-leave-requests/my-requests', token, undefined, hrHeaders);
    check('my-requests 200 (no employee → empty)', mine.status === 200 && Array.isArray(mine.body.data) && mine.body.data.length === 0,
      `got ${mine.status} ${JSON.stringify(mine.body && (mine.body.error || mine.body.data && mine.body.data.length))}`);

    const queue = await req('GET', '/api/hr-leave-requests/team-queue', token, undefined, hrHeaders);
    // hr_admin claim = org-wide → returns ALL pending requests (array).
    check('team-queue 200 for hr_admin', queue.status === 200 && Array.isArray(queue.body.data), `got ${queue.status}`);

    // Approve flow on a marked Pending request tied to a marked employee.
    const emp = track(EMP_UID, await documents(EMP_UID).create({
      data: { name: MARK, email: `${MARK}@example.test` },
    }));
    const pending = track(LR_UID, await documents(LR_UID).create({
      data: { leave_type: 'Casual', start_date: '2026-08-10', end_date: '2026-08-10', status: 'Pending', employee: emp.id, reason: MARK },
    }));
    const lrPath = `/api/hr-leave-requests/${pending.documentId}`;

    const approved = await req('POST', `${lrPath}/approve`, token, {}, hrHeaders);
    check('approve 200 → Approved + decided_at', approved.status === 200 && approved.body.data
      && approved.body.data.status === 'Approved' && Boolean(approved.body.data.decided_at),
      `got ${approved.status} ${JSON.stringify(approved.body && (approved.body.error || approved.body.data && approved.body.data.status))}`);

    const again = await req('POST', `${lrPath}/approve`, token, {}, hrHeaders);
    check('re-approve idempotent 200', again.status === 200 && again.body.data && again.body.data.status === 'Approved', `got ${again.status}`);

    const cancelled = await req('POST', `${lrPath}/cancel`, token, {}, hrHeaders);
    check('cancel after approve 200 → Cancelled', cancelled.status === 200 && cancelled.body.data && cancelled.body.data.status === 'Cancelled',
      `got ${cancelled.status} ${JSON.stringify(cancelled.body && cancelled.body.error)}`);

    const rejectLate = await req('POST', `${lrPath}/reject`, token, {}, hrHeaders);
    check('reject after cancel 400', rejectLate.status === 400, `got ${rejectLate.status}`);

    // create override: HR actor with explicit employee keeps it.
    const createdViaHttp = await req('POST', '/api/hr-leave-requests', token, {
      data: { leave_type: 'Sick', start_date: '2026-08-17', end_date: '2026-08-19', status: 'Pending', employee: emp.documentId, reason: MARK },
    }, hrHeaders);
    if (createdViaHttp.body && createdViaHttp.body.data && createdViaHttp.body.data.documentId) {
      created.push([LR_UID, createdViaHttp.body.data.documentId]);
    }
    check('create override 201 + total_days stamped', createdViaHttp.status === 201
      && createdViaHttp.body.data && Number(createdViaHttp.body.data.total_days) === 3,
      `got ${createdViaHttp.status} total_days=${createdViaHttp.body && createdViaHttp.body.data && createdViaHttp.body.data.total_days}`);

    const options = await req('GET', '/api/hr-teams/app-role-options', token, undefined, hrHeaders);
    check('app-role-options 200 with domains', options.status === 200 && Array.isArray(options.body.data)
      && options.body.data.every((d) => d.domainKey), `got ${options.status}`);

    // Payroll manager gate now reads the api-pro claim (utils/payroll-access),
    // not the phantom permission_roles relation that made this super-admin-only.
    // A payroll_admin claim gets PAST authorization, so a nonexistent run fails
    // on the run itself (5xx from the service) rather than 403.
    const preview = await req('POST', '/api/pay-payroll-runs/xxxxxxxxxxxxxxxxxxxxxxxx/preview', token, {}, payHeaders);
    check('payroll preview passes the gate for a payroll_admin claim', preview.status !== 403,
      `got ${preview.status} ${JSON.stringify(preview.body && preview.body.error)}`);

    // …and still refuses a claim from another domain.
    const previewHr = await req('POST', '/api/pay-payroll-runs/xxxxxxxxxxxxxxxxxxxxxxxx/preview', token, {}, hrHeaders);
    check('payroll preview 403 for a non-payroll claim', previewHr.status === 403, `got ${previewHr.status}`);

    const slips = await req('GET', '/api/pay-payslips/my-payslips', token, undefined, payHeaders);
    check('my-payslips 200 (no employee link → empty)', slips.status === 200 && Array.isArray(slips.body.data), `got ${slips.status}`);

    // work-item collaboration (selfAuth routes).
    const toggleBody = { data: { entity_uid: 'api::mfg-work-order.mfg-work-order', target_document_id: `${MARK}-doc` } };
    const on = await req('POST', '/api/work-item-watches/toggle', token, toggleBody);
    check('watch toggle on', on.status === 200 && on.body && on.body.data && on.body.data.watching === true,
      `got ${on.status} ${JSON.stringify(on.body)}`);
    const off = await req('POST', '/api/work-item-watches/toggle', token, toggleBody);
    check('watch toggle off (idempotent pair)', off.status === 200 && off.body.data && off.body.data.watching === false, `got ${off.status}`);

    // Comments are policy-scoped to the manufacturing / order-management apps.
    const comment = await req('POST', '/api/work-item-comments', token, {
      data: { entity_uid: 'api::mfg-work-order.mfg-work-order', target_document_id: `${MARK}-doc`, body: `${MARK} comment` },
    }, { 'X-Rutba-App': 'manufacturing', 'X-Rutba-App-Role': 'manufacturing_admin' });
    if (comment.body && comment.body.data && comment.body.data.documentId) {
      created.push([COMMENT_UID, comment.body.data.documentId]);
    }
    check('comment create stamps author', comment.status === 200 && comment.body.data
      && (comment.body.data.author_label === (user.username || user.email)),
      `got ${comment.status} author_label=${comment.body && comment.body.data && comment.body.data.author_label}`);

    const badAssign = await req('POST', '/api/work-item-activities/assign', token, {
      data: { entity_uid: 'api::product.product', target_document_id: `${MARK}-doc` },
    });
    check('assign rejects non-assignable entity 400', badAssign.status === 400, `got ${badAssign.status}`);
  } finally {
    for (const [uid, documentId] of created.reverse()) {
      try { await documents(uid).delete({ documentId }); } catch {}
    }
    const actTable = getRegistry().models.get(ACTIVITY_UID).tableName;
    try { await db(actTable).where('target_document_id', 'like', `%${MARK}%`).del(); } catch {}
    const watchTable = getRegistry().models.get(WATCH_UID).tableName;
    try { await db(watchTable).where('target_document_id', 'like', `%${MARK}%`).del(); } catch {}
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
