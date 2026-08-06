#!/usr/bin/env node
'use strict';

/**
 * Accounting GL smoke (roadmap 0.4) — exercises the posting paths that were
 * wired to close the web/cash/purchase/payroll → ledger gaps. Runs against the
 * live dev DB on :4025 and is self-cleaning (marker rows + the journal entries
 * they produce are deleted; temp app-role grants removed).
 *
 *  A. Ledger config: every account-mapping key the code resolves is seeded.
 *     SHRINKAGE_EXPENSE was the one that wasn't, so stock-adjustment and
 *     stock-count losses failed inside their best-effort try/catch and never
 *     reached the ledger.
 *  B. purchase-return lifecycle → Dr ACCOUNTS_PAYABLE / Cr INVENTORY, keyed
 *     'Purchase Return', idempotent on re-fire.
 *  C. purchase generate-bill → the bill carries expense_key INVENTORY, so the
 *     acc-bill lifecycle capitalizes goods instead of expensing them to
 *     OPERATING_EXPENSES against a COGS credit that never had a debit.
 *  D. pay-adjustment disburse → Dr EMPLOYEE_ADVANCES / Cr cash, keyed
 *     'Employee Advance', idempotent, admin-gated.
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4025;
const MARK = '__rutba_core_gl_smoke__';

const PR_UID = 'api::purchase-return.purchase-return';
const PURCHASE_UID = 'api::purchase.purchase';
const BILL_UID = 'api::acc-bill.acc-bill';
const ADJ_UID = 'api::pay-adjustment.pay-adjustment';
const EMP_UID = 'api::hr-employee.hr-employee';
const JE_UID = 'api::acc-journal-entry.acc-journal-entry';

// Every key resolve() is called with anywhere in pos-strapi/src.
const RESOLVER_KEYS = [
  'CASH_DRAWER', 'CASH_SAFE', 'BANK_PRIMARY', 'CARD_CLEARING', 'MOBILE_WALLET',
  'EXCHANGE_CLEARING', 'ACCOUNTS_RECEIVABLE', 'INVENTORY', 'ACCOUNTS_PAYABLE',
  'TAX_PAYABLE', 'CUSTOMER_DEPOSITS', 'SALES_REVENUE', 'SALES_RETURNS', 'COGS',
  'OPERATING_EXPENSES', 'COD_CLEARING', 'SHIPPING_REVENUE', 'CASH_SHORT_OVER',
  'SHRINKAGE_EXPENSE', 'PAYROLL_EXPENSE', 'SALARY_PAYABLE', 'WAGES_PAYABLE',
  'STATUTORY_PAYABLE', 'EMPLOYEE_ADVANCES', 'WIP_LABOR',
];

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
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

// Journal entries for a source document, with their lines joined to accounts.
async function entriesFor(db, sourceType, sourceId) {
  const rows = await db('acc_journal_entries')
    .where({ source_type: sourceType, source_id: sourceId, status: 'Posted' })
    .select('id', 'entry_number', 'total_debit', 'total_credit', 'source_ref');
  for (const e of rows) {
    e.lines = await db('acc_journal_lines as l')
      .join('acc_journal_lines_journal_entry_lnk as jl', 'jl.acc_journal_line_id', 'l.id')
      .leftJoin('acc_journal_lines_account_lnk as al', 'al.acc_journal_line_id', 'l.id')
      .leftJoin('acc_accounts as a', 'a.id', 'al.acc_account_id')
      .where('jl.acc_journal_entry_id', e.id)
      .select('a.code as code', 'l.debit', 'l.credit');
  }
  return rows;
}
const lineFor = (e, code) => (e.lines || []).find((l) => String(l.code) === code);
const num = (v) => Math.round(Number(v || 0) * 100) / 100;

async function main() {
  buildCompatStrapi();
  initModules();

  const db = getDb();
  const created = [];
  const track = (uid, row) => { created.push([uid, row.documentId]); return row; };
  const jeSources = [];
  const grants = [];
  let server = null;

  try {
    /* ── A. ledger configuration ─────────────────────────────────────── */
    console.log('A. account mappings');
    const mapped = new Set(
      (await db('acc_account_mappings').select('key')).map((r) => r.key)
    );
    const unseeded = RESOLVER_KEYS.filter((k) => !mapped.has(k));
    check('every resolver key has a mapping', unseeded.length === 0, `missing: ${unseeded.join(', ')}`);
    check('SHRINKAGE_EXPENSE mapped', mapped.has('SHRINKAGE_EXPENSE'));

    /* ── B. purchase-return → GL ─────────────────────────────────────── */
    console.log('B. purchase-return → GL');
    const pr = track(PR_UID, await documents(PR_UID).create({
      data: { return_no: `${MARK}-PR1`, return_date: new Date().toISOString(), total_refund: 1234.5 },
    }));
    jeSources.push(['Purchase Return', pr.id]);

    let es = await entriesFor(db, 'Purchase Return', pr.id);
    check('posts exactly one entry on create', es.length === 1, `got ${es.length}`);
    if (es[0]) {
      check('debits 2000 Accounts Payable 1234.50', num(lineFor(es[0], '2000')?.debit) === 1234.5,
        String(lineFor(es[0], '2000')?.debit));
      check('credits 1300 Inventory 1234.50', num(lineFor(es[0], '1300')?.credit) === 1234.5,
        String(lineFor(es[0], '1300')?.credit));
      check('entry balances', num(es[0].total_debit) === num(es[0].total_credit));
    }

    await documents(PR_UID).update({ documentId: pr.documentId, data: { total_refund: 1234.5 } });
    es = await entriesFor(db, 'Purchase Return', pr.id);
    check('idempotent on update re-fire', es.length === 1, `got ${es.length}`);

    /* ── C + D. HTTP ─────────────────────────────────────────────────── */
    console.log('C. purchase generate-bill → capitalizes to Inventory');

    const user = await db('up_users').where('blocked', 0).first('id', 'email');
    check('found test user', Boolean(user));
    for (const key of ['payroll_admin', 'accounts_admin']) {
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
    const acctHeaders = { 'X-Rutba-App': 'accounts', 'X-Rutba-App-Role': 'accounts_admin' };
    const payHeaders = { 'X-Rutba-App': 'payroll', 'X-Rutba-App-Role': 'payroll_admin' };

    server = await start(PORT);

    const purchase = track(PURCHASE_UID, await documents(PURCHASE_UID).create({
      data: { orderId: `${MARK}-PO1`, order_date: new Date().toISOString(), status: 'Received', total: 900 },
    }));

    const billRes = await req('POST', `/api/purchases/${purchase.documentId}/generate-bill`, token, {}, acctHeaders);
    check('generate-bill 200 for an accounts_admin claim', billRes.status === 200,
      `got ${billRes.status} ${JSON.stringify(billRes.body && billRes.body.error)}`);

    const bill = billRes.body?.data;
    if (bill?.documentId) {
      created.push([BILL_UID, bill.documentId]);
      const row = await db('acc_bills').where('document_id', bill.documentId).first('id', 'expense_key', 'status', 'total');
      check('bill capitalizes to INVENTORY (expense_key)', row?.expense_key === 'INVENTORY', String(row?.expense_key));
      check('bill flipped to Received', row?.status === 'Received', String(row?.status));
      if (row) {
        jeSources.push(['Bill Payment', row.id]);
        const be = await entriesFor(db, 'Bill Payment', row.id);
        check('AP entry posted for the bill', be.length >= 1, `got ${be.length}`);
        if (be[0]) {
          check('debits 1300 Inventory, not 6000 Operating Expenses',
            Boolean(lineFor(be[0], '1300')?.debit) && !lineFor(be[0], '6000'),
            JSON.stringify(be[0].lines));
          check('credits 2000 Accounts Payable', num(lineFor(be[0], '2000')?.credit) === num(row.total));
        }
      }
    }

    const billAgain = await req('POST', `/api/purchases/${purchase.documentId}/generate-bill`, token, {}, acctHeaders);
    check('generate-bill idempotent (one bill per purchase)',
      billAgain.status === 200 && billAgain.body?.meta?.existing === true,
      `got ${billAgain.status} ${JSON.stringify(billAgain.body && billAgain.body.meta)}`);

    console.log('D. pay-adjustment disburse → GL');

    const emp = track(EMP_UID, await documents(EMP_UID).create({
      data: { name: MARK, email: `${MARK}@example.test` },
    }));
    const adj = track(ADJ_UID, await documents(ADJ_UID).create({
      data: { type: 'advance', amount: 5000, status: 'Pending', reason: MARK, employee: emp.id },
    }));

    const noClaim = await req('POST', `/api/pay-adjustments/${adj.documentId}/disburse`, token, { data: {} }, acctHeaders);
    check('disburse 403 for a non-payroll claim', noClaim.status === 403, `got ${noClaim.status}`);

    const dis = await req('POST', `/api/pay-adjustments/${adj.documentId}/disburse`, token, { data: { method: 'Cash' } }, payHeaders);
    check('disburse 200 for a payroll_admin claim', dis.status === 200,
      `got ${dis.status} ${JSON.stringify(dis.body && dis.body.error)}`);

    const adjRow = await db('pay_adjustments').where('document_id', adj.documentId).first('id', 'balance', 'disbursed_at', 'disbursement_method');
    if (adjRow) {
      jeSources.push(['Employee Advance', adjRow.id]);
      const ae = await entriesFor(db, 'Employee Advance', adjRow.id);
      check('posts exactly one entry', ae.length === 1, `got ${ae.length}`);
      if (ae[0]) {
        check('debits 1220 Employee Advances 5000', num(lineFor(ae[0], '1220')?.debit) === 5000,
          String(lineFor(ae[0], '1220')?.debit));
        check('credits 1000 Cash Drawer 5000', num(lineFor(ae[0], '1000')?.credit) === 5000,
          String(lineFor(ae[0], '1000')?.credit));
        check('entry balances', num(ae[0].total_debit) === num(ae[0].total_credit));
      }
      check('opening balance stamped from amount', num(adjRow.balance) === 5000, String(adjRow.balance));
      check('disbursed_at stamped', Boolean(adjRow.disbursed_at));
      check('disbursement_method stamped', adjRow.disbursement_method === 'Cash', String(adjRow.disbursement_method));

      const again = await req('POST', `/api/pay-adjustments/${adj.documentId}/disburse`, token, { data: { method: 'Cash' } }, payHeaders);
      check('disburse idempotent (flags alreadyPosted)', again.body?.meta?.alreadyPosted === true,
        JSON.stringify(again.body && again.body.meta));
      const ae2 = await entriesFor(db, 'Employee Advance', adjRow.id);
      check('no second entry on re-disburse', ae2.length === 1, `got ${ae2.length}`);
    }

    const bonus = track(ADJ_UID, await documents(ADJ_UID).create({
      data: { type: 'bonus', amount: 700, status: 'Pending', reason: MARK, employee: emp.id },
    }));
    const bonusRes = await req('POST', `/api/pay-adjustments/${bonus.documentId}/disburse`, token, { data: {} }, payHeaders);
    check('disburse rejects a bonus (not cash-recoverable)', bonusRes.status === 400, `got ${bonusRes.status}`);
  } finally {
    /* ── cleanup ─────────────────────────────────────────────────────── */
    for (const [sourceType, sourceId] of jeSources) {
      const ids = (await getDb()('acc_journal_entries')
        .where({ source_type: sourceType, source_id: sourceId }).select('id')).map((r) => r.id);
      for (const id of ids) {
        const lineIds = (await getDb()('acc_journal_lines_journal_entry_lnk')
          .where('acc_journal_entry_id', id).select('acc_journal_line_id')).map((r) => r.acc_journal_line_id);
        if (lineIds.length) {
          await getDb()('acc_journal_lines_journal_entry_lnk').whereIn('acc_journal_line_id', lineIds).del();
          await getDb()('acc_journal_lines_account_lnk').whereIn('acc_journal_line_id', lineIds).del();
          await getDb()('acc_journal_lines').whereIn('id', lineIds).del();
        }
        await getDb()('acc_journal_entries').where('id', id).del();
      }
    }
    for (const [uid, documentId] of created.reverse()) {
      try { await documents(uid).delete({ documentId }); } catch { /* best-effort */ }
    }
    for (const g of grants) {
      try { await getDb()('up_users_app_roles_lnk').where(g).del(); } catch { /* best-effort */ }
    }
    if (server) await new Promise((r) => server.close(r));
    await closeDb();
  }

  console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
