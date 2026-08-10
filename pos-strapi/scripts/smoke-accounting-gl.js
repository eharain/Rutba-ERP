#!/usr/bin/env node
'use strict';

/**
 * Accounting GL smoke against pos-strapi itself (roadmap 0.4).
 *
 * The sibling rutba-core/scripts/smoke-accounting-gl.js covers the same ground
 * on core, where lifecycles run through the document-middleware adapter. This
 * one boots pos-strapi so the checks go through Strapi's OWN query-engine
 * lifecycles and services — the two servers must agree.
 *
 *   A. Every account-mapping key the code resolves is seeded (SHRINKAGE_EXPENSE
 *      was missing, so stock-adjustment / stock-count losses failed inside
 *      their best-effort try/catch and never reached the ledger).
 *   B. purchase-return  → Dr ACCOUNTS_PAYABLE / Cr INVENTORY, idempotent.
 *   C. purchase generate-bill → the bill capitalizes to INVENTORY, so the
 *      acc-bill lifecycle debits the asset instead of OPERATING_EXPENSES.
 *   D. pay-adjustment disburse → Dr EMPLOYEE_ADVANCES / Cr cash, idempotent.
 *   E. The same two actions over HTTP, so routing and the gates are exercised
 *      too, not just the services.
 *
 * Section E serves its OWN HTTP on SMOKE_PORT (default 4011) rather than
 * talking to a dev server on 4010: booting a second Strapi alongside a running
 * one starves both (each boot is minutes of admin build + type generation), and
 * a self-served port makes the run standalone. Nothing else may hold that port.
 *
 * Known limit: under `createStrapi().load()` the api-pro request-interceptor
 * never sets `ctx.state.apiProClaim` — verified against
 * /acc-journal-entries/reports/trial-balance, a claim-gated route that predates
 * this work, so it is the harness and not these endpoints. Section E probes for
 * that and SKIPS the claim-dependent assertions rather than reporting a
 * failure it cannot attribute. Full HTTP + policy coverage for the same two
 * endpoints runs in rutba-core/scripts/smoke-accounting-gl.js, which serves
 * through core's own interceptor. What section E still asserts unconditionally:
 * the session token works, api-pro can see the granted roles, and disburse
 * refuses a non-payroll caller.
 *
 * On tokens: users-permissions runs `jwtManagement: 'refresh'` (config/plugins),
 * so access tokens are session-backed — a hand-signed {id} JWT is rejected with
 * "Missing or invalid credentials". Section E mints one through the plugin's own
 * jwt service, which routes via strapi.sessionManager.
 *
 * Self-cleaning: marker rows and the journal entries they produce are removed.
 * Run: npm --prefix pos-strapi run smoke:accounting-gl   (from the repo root:
 * node scripts/js/load-env.js -- npm --prefix pos-strapi run smoke:accounting-gl)
 */

const { createStrapi, compileStrapi } = require('@strapi/strapi');

const SMOKE_PORT = Number(process.env.SMOKE_PORT || 4011);
const BASE = `http://127.0.0.1:${SMOKE_PORT}`;
const MARK = '__pos_gl_smoke__';
const PR_UID = 'api::purchase-return.purchase-return';
const PURCHASE_UID = 'api::purchase.purchase';
const BILL_UID = 'api::acc-bill.acc-bill';
const ADJ_UID = 'api::pay-adjustment.pay-adjustment';
const EMP_UID = 'api::hr-employee.hr-employee';

const RESOLVER_KEYS = [
  'CASH_DRAWER', 'CASH_SAFE', 'BANK_PRIMARY', 'CARD_CLEARING', 'MOBILE_WALLET',
  'EXCHANGE_CLEARING', 'ACCOUNTS_RECEIVABLE', 'INVENTORY', 'ACCOUNTS_PAYABLE',
  'TAX_PAYABLE', 'CUSTOMER_DEPOSITS', 'SALES_REVENUE', 'SALES_RETURNS', 'COGS',
  'OPERATING_EXPENSES', 'COD_CLEARING', 'SHIPPING_REVENUE', 'CASH_SHORT_OVER',
  'SHRINKAGE_EXPENSE', 'PAYROLL_EXPENSE', 'SALARY_PAYABLE', 'WAGES_PAYABLE',
  'STATUTORY_PAYABLE', 'EMPLOYEE_ADVANCES', 'WIP_LABOR',
];

let failures = 0;
let lastClaim = null;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const num = (v) => Math.round(Number(v || 0) * 100) / 100;

// Wait for the HTTP server this run started to answer (401 counts — it means
// something is listening).
async function reachable(tries = 20) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/api/users/me`, { signal: AbortSignal.timeout(3000) });
      if (res.status > 0) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function req(method, path, token, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

async function entriesFor(strapi, source_type, source_id) {
  return strapi.entityService.findMany('api::acc-journal-entry.acc-journal-entry', {
    filters: { source_type, source_id, status: 'Posted' },
    populate: { lines: { populate: { account: { fields: ['code'] } } } },
  });
}
const lineFor = (e, code) => (e.lines || []).find((l) => String(l.account?.code) === code);

// Strapi's "port already used" error arrives mid-boot and reads like an
// unrelated failure, so say it plainly before spending minutes loading.
async function portFree(port) {
  const net = require('net');
  return new Promise((resolve) => {
    const s = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => s.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

async function main() {
  if (!(await portFree(SMOKE_PORT))) {
    console.error(`Port ${SMOKE_PORT} is in use — free it or set SMOKE_PORT to another port.`);
    process.exitCode = 1;
    return;
  }
  // Bind our own port so section E can drive real HTTP without a second boot.
  // Use strapi.listen(), not strapi.server.listen(): the latter binds the
  // socket without the middleware composition start() performs, so the api-pro
  // request-interceptor never runs and every gated route falls through to UP.
  process.env.PORT = String(SMOKE_PORT);
  const strapi = await createStrapi(await compileStrapi()).load();
  // Record whether the api-pro interceptor resolved a claim for the last
  // request, so section E can tell "the endpoint rejected me" apart from "the
  // interceptor never ran in this harness".
  strapi.server.use(async (ctx, next) => {
    await next();
    lastClaim = ctx.state.apiProClaim || null;
  });
  await strapi.listen();
  const created = [];
  const jeSources = [];
  const grants = [];
  const track = (uid, row) => { created.push([uid, row.id]); return row; };

  try {
    /* ── A ── */
    console.log('A. account mappings');
    const mappings = await strapi.entityService.findMany('api::acc-account-mapping.acc-account-mapping', {
      fields: ['key'], limit: 500,
    });
    const mapped = new Set(mappings.map((m) => m.key));
    const unseeded = RESOLVER_KEYS.filter((k) => !mapped.has(k));
    check('every resolver key has a mapping', unseeded.length === 0, `missing: ${unseeded.join(', ')}`);

    // The resolver is the thing that actually has to work.
    const resolver = strapi.service('api::acc-journal-entry.account-resolver');
    let resolvedAll = true; let resolveErr = '';
    for (const k of RESOLVER_KEYS) {
      try { await resolver.resolve(k, null); } catch (e) { resolvedAll = false; resolveErr += `${k}: ${e.message}; `; }
    }
    check('resolver resolves every key', resolvedAll, resolveErr);

    /* ── B ── */
    console.log('B. purchase-return → GL');
    const pr = track(PR_UID, await strapi.entityService.create(PR_UID, {
      data: { return_no: `${MARK}-PR`, return_date: new Date().toISOString(), total_refund: 480 },
    }));
    jeSources.push(['Purchase Return', pr.id]);

    let es = await entriesFor(strapi, 'Purchase Return', pr.id);
    check('posts exactly one entry on create', es.length === 1, `got ${es.length}`);
    if (es[0]) {
      check('debits 2000 Accounts Payable 480', num(lineFor(es[0], '2000')?.debit) === 480, String(lineFor(es[0], '2000')?.debit));
      check('credits 1300 Inventory 480', num(lineFor(es[0], '1300')?.credit) === 480, String(lineFor(es[0], '1300')?.credit));
      check('entry balances', num(es[0].total_debit) === num(es[0].total_credit));
    }
    await strapi.entityService.update(PR_UID, pr.id, { data: { total_refund: 480 } });
    es = await entriesFor(strapi, 'Purchase Return', pr.id);
    check('idempotent on update re-fire', es.length === 1, `got ${es.length}`);

    /* ── C ── */
    console.log('C. purchase → bill capitalizes to Inventory');
    const purchase = track(PURCHASE_UID, await strapi.entityService.create(PURCHASE_UID, {
      data: { orderId: `${MARK}-PO`, order_date: new Date().toISOString(), status: 'Received', total: 640 },
    }));
    // Exercise the same two writes generateBill performs (create Draft → flip
    // to Received) so the acc-bill lifecycle posts, without needing HTTP auth.
    const bill = track(BILL_UID, await strapi.entityService.create(BILL_UID, {
      data: {
        bill_number: `${MARK}-BILL`,
        date: new Date().toISOString().slice(0, 10),
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        subtotal: 640, tax_amount: 0, total: 640, balance_due: 640,
        status: 'Draft', expense_key: 'INVENTORY', purchase: purchase.id,
      },
    }));
    await strapi.entityService.update(BILL_UID, bill.id, { data: { status: 'Received' } });
    jeSources.push(['Bill Payment', bill.id]);

    const be = await entriesFor(strapi, 'Bill Payment', bill.id);
    check('AP entry posted', be.length === 1, `got ${be.length}`);
    if (be[0]) {
      check('debits 1300 Inventory, not 6000 Operating Expenses',
        num(lineFor(be[0], '1300')?.debit) === 640 && !lineFor(be[0], '6000'),
        JSON.stringify((be[0].lines || []).map((l) => [l.account?.code, l.debit, l.credit])));
      check('credits 2000 Accounts Payable 640', num(lineFor(be[0], '2000')?.credit) === 640);
      check('entry balances', num(be[0].total_debit) === num(be[0].total_credit));
    }

    /* ── D ── */
    console.log('D. pay-adjustment disburse → GL');
    const emp = track(EMP_UID, await strapi.entityService.create(EMP_UID, {
      data: { name: MARK, email: `${MARK}@example.test` },
    }));
    const adj = track(ADJ_UID, await strapi.entityService.create(ADJ_UID, {
      data: { type: 'advance', amount: 3200, status: 'Pending', reason: MARK, employee: emp.id },
    }));

    // Call the controller action directly with a stub ctx — the HTTP gate is
    // covered by the core smoke; what matters here is Strapi-side posting.
    const ctrl = strapi.controller('api::pay-adjustment.pay-adjustment');
    const doc = await strapi.documents(ADJ_UID).findFirst({ filters: { id: { $eq: adj.id } } });
    const ctx = {
      params: { documentId: doc.documentId },
      request: { body: { data: { method: 'Cash' } } },
      state: { user: { id: 1 }, apiProClaim: { roleKey: 'payroll_admin' } },
      sent: null, err: null,
      send(p) { this.sent = p; return p; },
      unauthorized(m) { this.err = ['401', m]; }, forbidden(m) { this.err = ['403', m]; },
      notFound(m) { this.err = ['404', m]; }, badRequest(m) { this.err = ['400', m]; },
      throw(s, m) { this.err = [String(s), m]; },
    };
    // isPayrollAdmin short-circuits on role.type === 'admin' OR the claim above.
    await ctrl.disburse(ctx);
    check('disburse succeeds', !ctx.err, JSON.stringify(ctx.err));

    jeSources.push(['Employee Advance', adj.id]);
    const ae = await entriesFor(strapi, 'Employee Advance', adj.id);
    check('posts exactly one entry', ae.length === 1, `got ${ae.length}`);
    if (ae[0]) {
      check('debits 1220 Employee Advances 3200', num(lineFor(ae[0], '1220')?.debit) === 3200, String(lineFor(ae[0], '1220')?.debit));
      check('credits 1000 Cash Drawer 3200', num(lineFor(ae[0], '1000')?.credit) === 3200, String(lineFor(ae[0], '1000')?.credit));
      check('entry balances', num(ae[0].total_debit) === num(ae[0].total_credit));
    }
    const after = await strapi.entityService.findOne(ADJ_UID, adj.id, { fields: ['balance', 'disbursed_at', 'disbursement_method'] });
    check('opening balance stamped from amount', num(after?.balance) === 3200, String(after?.balance));
    check('disbursed_at stamped', Boolean(after?.disbursed_at));

    ctx.sent = null; ctx.err = null;
    await ctrl.disburse(ctx);
    const ae2 = await entriesFor(strapi, 'Employee Advance', adj.id);
    check('idempotent — no second entry', ae2.length === 1, `got ${ae2.length}`);
    check('idempotent path flags alreadyPosted', ctx.sent?.meta?.alreadyPosted === true);

    /* ── E ── */
    console.log(`E. HTTP against a running pos-strapi (${BASE})`);
    if (!(await reachable())) {
      check(`HTTP server came up on ${SMOKE_PORT}`, false, 'is something else holding the port?');
    } else {
      const knex = strapi.db.connection;
      const actor = await knex('up_users').where('blocked', 0).first('id');
      // Session-backed access token (see the header note on jwtManagement).
      const token = await strapi.plugin('users-permissions').service('jwt').issue({ id: actor.id });
      check('minted a session-backed access token', typeof token === 'string' && token.length > 0);

      for (const key of ['accounts_admin', 'payroll_admin']) {
        const role = await knex('api_pro_app_roles').where('key', key).first('id');
        if (role && !(await knex('up_users_app_roles_lnk').where({ user_id: actor.id, app_role_id: role.id }).first('id'))) {
          await knex('up_users_app_roles_lnk').insert({ user_id: actor.id, app_role_id: role.id });
          grants.push({ user_id: actor.id, app_role_id: role.id });
        }
      }
      // api-pro caches user→app_roles (`u:<id>:app_roles`) and only invalidates
      // on app-role/app-domain content-type writes — a raw link-table insert
      // like the one above leaves it stale. Without this the claim never
      // resolves, the interceptor skips the request, and both endpoints 403
      // for unrelated-looking reasons (UP "Forbidden" / the controller gate).
      strapi.apiPro?.clearCache?.(actor.id);

      // Diagnostic: the interceptor silently SKIPS a request whose claim it
      // cannot resolve, and the endpoint then fails for an unrelated-looking
      // reason (UP "Forbidden", or the controller's own gate). Prove api-pro
      // can actually see the grants before blaming the endpoints.
      check('strapi.apiPro is wired', Boolean(strapi.apiPro), 'plugin not bootstrapped?');
      try {
        const contextSvc = strapi.plugin('api-pro').service('context');
        const seen = await contextSvc.loadUserAppRoles(strapi, actor.id);
        const keys = (seen || []).map((r) => String(r.key || '').toLowerCase());
        check('api-pro sees the granted app-roles', keys.includes('accounts_admin') && keys.includes('payroll_admin'),
          `saw: ${keys.join(', ') || '(none)'}`);
      } catch (e) {
        check('api-pro context service reachable', false, e.message);
      }
      const acct = { 'X-Rutba-App': 'accounts', 'X-Rutba-App-Role': 'accounts_admin' };
      const pay = { 'X-Rutba-App': 'payroll', 'X-Rutba-App-Role': 'payroll_admin' };

      const me = await req('GET', '/api/users/me', token);
      check('token authenticates', me.status === 200, `got ${me.status}`);

      // Does the api-pro interceptor engage at all here? Probe an endpoint
      // that predates this work and is known to be claim-gated.
      await req('GET', '/api/acc-journal-entries/reports/trial-balance?from=2026-01-01&to=2026-12-31', token, undefined, acct);
      const interceptorRuns = Boolean(lastClaim && lastClaim.roleKey);
      if (!interceptorRuns) {
        console.log('  SKIP  api-pro interceptor does not engage under createStrapi().load()+listen()');
        console.log('        — no ctx.state.apiProClaim on a known claim-gated route, so the');
        console.log('          claim-dependent assertions below would test the harness, not the code.');
        console.log('        HTTP + policy coverage for these endpoints lives in');
        console.log('          rutba-core/scripts/smoke-accounting-gl.js (section C/D).');
      }

      // generate-bill: the path that used to 403 every non-super-admin.
      const p2 = track(PURCHASE_UID, await strapi.entityService.create(PURCHASE_UID, {
        data: { orderId: `${MARK}-PO-HTTP`, order_date: new Date().toISOString(), status: 'Received', total: 510 },
      }));
      const p2doc = await strapi.documents(PURCHASE_UID).findFirst({ filters: { id: { $eq: p2.id } } });
      const billRes = await req('POST', `/api/purchases/${p2doc.documentId}/generate-bill`, token, {}, acct);
      if (interceptorRuns) {
        check('generate-bill 200 for an accounts_admin claim', billRes.status === 200,
          `got ${billRes.status} ${JSON.stringify(billRes.body && billRes.body.error)}`);
      }
      if (billRes.body?.data?.documentId) {
        const brow = await knex('acc_bills').where('document_id', billRes.body.data.documentId).first('id', 'expense_key');
        created.push([BILL_UID, brow.id]);
        jeSources.push(['Bill Payment', brow.id]);
        check('bill capitalizes to INVENTORY over HTTP', brow?.expense_key === 'INVENTORY', String(brow?.expense_key));
        const hbe = await entriesFor(strapi, 'Bill Payment', brow.id);
        check('AP entry debits 1300 Inventory', hbe.length === 1 && num(lineFor(hbe[0], '1300')?.debit) === 510,
          JSON.stringify((hbe[0]?.lines || []).map((l) => [l.account?.code, l.debit, l.credit])));
      }

      // disburse: new route + UP grant + api-pro policy + payroll claim gate.
      const adj2 = track(ADJ_UID, await strapi.entityService.create(ADJ_UID, {
        data: { type: 'advance', amount: 900, status: 'Pending', reason: MARK, employee: emp.id },
      }));
      const adj2doc = await strapi.documents(ADJ_UID).findFirst({ filters: { id: { $eq: adj2.id } } });
      const wrongClaim = await req('POST', `/api/pay-adjustments/${adj2doc.documentId}/disburse`, token, { data: {} }, acct);
      check('disburse 403 for a non-payroll claim', wrongClaim.status === 403, `got ${wrongClaim.status}`);

      const disRes = await req('POST', `/api/pay-adjustments/${adj2doc.documentId}/disburse`, token, { data: { method: 'Bank' } }, pay);
      if (interceptorRuns) {
        check('disburse 200 for a payroll_admin claim', disRes.status === 200,
          `got ${disRes.status} ${JSON.stringify(disRes.body && disRes.body.error)}`);
        jeSources.push(['Employee Advance', adj2.id]);
        const hae = await entriesFor(strapi, 'Employee Advance', adj2.id);
        check('advance posts Dr 1220 / Cr 1100 Bank over HTTP',
          hae.length === 1 && num(lineFor(hae[0], '1220')?.debit) === 900 && num(lineFor(hae[0], '1100')?.credit) === 900,
          JSON.stringify((hae[0]?.lines || []).map((l) => [l.account?.code, l.debit, l.credit])));
      } else {
        jeSources.push(['Employee Advance', adj2.id]);
      }
    }
  } finally {
    const knex = strapi.db.connection;
    for (const [source_type, source_id] of jeSources) {
      const ids = (await knex('acc_journal_entries').where({ source_type, source_id }).select('id')).map((r) => r.id);
      for (const id of ids) {
        const lineIds = (await knex('acc_journal_lines_journal_entry_lnk')
          .where('acc_journal_entry_id', id).select('acc_journal_line_id')).map((r) => r.acc_journal_line_id);
        if (lineIds.length) {
          await knex('acc_journal_lines_journal_entry_lnk').whereIn('acc_journal_line_id', lineIds).del();
          await knex('acc_journal_lines_account_lnk').whereIn('acc_journal_line_id', lineIds).del();
          await knex('acc_journal_lines').whereIn('id', lineIds).del();
        }
        // Posted entries are immutable via lifecycles — delete at the DB layer.
        await knex('acc_journal_entries').where('id', id).del();
      }
    }
    for (const [uid, id] of created.reverse()) {
      try { await strapi.entityService.delete(uid, id); } catch { /* best-effort */ }
    }
    for (const g of grants) {
      try { await knex('up_users_app_roles_lnk').where(g).del(); } catch { /* best-effort */ }
    }
    console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
    await strapi.destroy();
  }
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
