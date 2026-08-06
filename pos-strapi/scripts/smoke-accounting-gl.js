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
 *
 * Self-cleaning: marker rows and the journal entries they produce are removed.
 * Run: npm --prefix pos-strapi run smoke:accounting-gl   (from the repo root:
 * node scripts/js/load-env.js -- npm --prefix pos-strapi run smoke:accounting-gl)
 */

const { createStrapi, compileStrapi } = require('@strapi/strapi');

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
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const num = (v) => Math.round(Number(v || 0) * 100) / 100;

async function entriesFor(strapi, source_type, source_id) {
  return strapi.entityService.findMany('api::acc-journal-entry.acc-journal-entry', {
    filters: { source_type, source_id, status: 'Posted' },
    populate: { lines: { populate: { account: { fields: ['code'] } } } },
  });
}
const lineFor = (e, code) => (e.lines || []).find((l) => String(l.account?.code) === code);

async function main() {
  const strapi = await createStrapi(await compileStrapi()).load();
  const created = [];
  const jeSources = [];
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
    console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
    await strapi.destroy();
  }
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
