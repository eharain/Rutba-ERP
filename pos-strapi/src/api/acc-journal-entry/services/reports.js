'use strict';

/**
 * Financial reporting service.
 *
 * All reports derive directly from posted journal lines (acc-journal-line ⋈
 * acc-account ⋈ acc-journal-entry) — there are no snapshot tables. Amounts are
 * rounded to 2dp at the edge. Suitable for the data volumes of an SME; if line
 * counts grow large, add date-bucketed balance snapshots behind the same API.
 */

const JL_UID = 'api::acc-journal-line.acc-journal-line';
const INV_UID = 'api::acc-invoice.acc-invoice';
const BILL_UID = 'api::acc-bill.acc-bill';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ymd = (d) => (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10));

module.exports = ({ strapi }) => ({

  /** Posted journal lines in a date window, account + entry populated. */
  async _lines({ from, to, branchId } = {}) {
    const je = { status: 'Posted' };
    if (from || to) je.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    if (branchId) je.branch = { id: branchId };
    const lines = await strapi.entityService.findMany(JL_UID, {
      filters: { journal_entry: je },
      populate: {
        account: { fields: ['id', 'code', 'name', 'account_type', 'sub_type'] },
        journal_entry: { fields: ['date', 'source_type'] },
      },
      limit: 100000,
    });
    return lines || [];
  },

  async trialBalance({ from, to, branch } = {}) {
    const lines = await this._lines({ from, to, branchId: branch });
    const byAcc = new Map();
    for (const l of lines) {
      const a = l.account;
      if (!a) continue;
      const cur = byAcc.get(a.id) || { code: a.code, name: a.name, account_type: a.account_type, debit: 0, credit: 0 };
      cur.debit += Number(l.debit || 0);
      cur.credit += Number(l.credit || 0);
      byAcc.set(a.id, cur);
    }
    const rows = [...byAcc.values()]
      .map((r) => {
        const net = r.debit - r.credit;
        return { code: r.code, name: r.name, account_type: r.account_type, debit: round2(net > 0 ? net : 0), credit: round2(net < 0 ? -net : 0) };
      })
      .filter((r) => r.debit !== 0 || r.credit !== 0)
      .sort((x, y) => String(x.code).localeCompare(String(y.code)));
    const totals = rows.reduce((t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }), { debit: 0, credit: 0 });
    return { period: { from, to }, rows, totals: { debit: round2(totals.debit), credit: round2(totals.credit) }, balanced: round2(totals.debit) === round2(totals.credit) };
  },

  async incomeStatement({ from, to, branch } = {}) {
    const lines = await this._lines({ from, to, branchId: branch });
    let revenue = 0, cogs = 0, expense = 0;
    const detail = { revenue: {}, cogs: {}, expense: {} };
    for (const l of lines) {
      const a = l.account;
      if (!a) continue;
      const d = Number(l.debit || 0), c = Number(l.credit || 0);
      if (a.account_type === 'Revenue') { revenue += c - d; detail.revenue[a.name] = round2((detail.revenue[a.name] || 0) + (c - d)); }
      else if (a.sub_type === 'Cost of Goods Sold') { cogs += d - c; detail.cogs[a.name] = round2((detail.cogs[a.name] || 0) + (d - c)); }
      else if (a.account_type === 'Expense') { expense += d - c; detail.expense[a.name] = round2((detail.expense[a.name] || 0) + (d - c)); }
    }
    const gross_profit = revenue - cogs;
    return { period: { from, to }, revenue: round2(revenue), cogs: round2(cogs), gross_profit: round2(gross_profit), expenses: round2(expense), net_profit: round2(gross_profit - expense), detail };
  },

  async balanceSheet({ asOf, branch } = {}) {
    const lines = await this._lines({ to: asOf, branchId: branch });
    let assets = 0, liabilities = 0, equity = 0, income = 0;
    const detail = { assets: {}, liabilities: {}, equity: {} };
    for (const l of lines) {
      const a = l.account;
      if (!a) continue;
      const d = Number(l.debit || 0), c = Number(l.credit || 0);
      if (a.account_type === 'Asset') { assets += d - c; detail.assets[a.name] = round2((detail.assets[a.name] || 0) + (d - c)); }
      else if (a.account_type === 'Liability') { liabilities += c - d; detail.liabilities[a.name] = round2((detail.liabilities[a.name] || 0) + (c - d)); }
      else if (a.account_type === 'Equity') { equity += c - d; detail.equity[a.name] = round2((detail.equity[a.name] || 0) + (c - d)); }
      else if (a.account_type === 'Revenue') { income += c - d; }
      else if (a.account_type === 'Expense') { income -= d - c; }
    }
    // Net income for the period to date folds into equity (retained earnings).
    equity += income;
    return { as_of: asOf, assets: round2(assets), liabilities: round2(liabilities), equity: round2(equity), retained_to_date: round2(income), balanced: round2(assets) === round2(liabilities + equity), detail };
  },

  async cashFlow({ from, to, branch } = {}) {
    const lines = await this._lines({ from, to, branchId: branch });
    const by_source = {};
    for (const l of lines) {
      const a = l.account;
      if (!a || !['Cash', 'Bank'].includes(a.sub_type)) continue;
      const delta = Number(l.debit || 0) - Number(l.credit || 0); // inflow positive
      const key = l.journal_entry?.source_type || 'Other';
      by_source[key] = round2((by_source[key] || 0) + delta);
    }
    return { period: { from, to }, by_source, net_change: round2(Object.values(by_source).reduce((s, v) => s + v, 0)) };
  },

  async _aging(uid, asOf) {
    const ref = asOf || ymd(new Date());
    const docs = await strapi.entityService.findMany(uid, {
      filters: { status: { $in: ['Sent', 'Received', 'Partially Paid', 'Overdue'] } },
      fields: ['date', 'due_date', 'total', 'amount_paid', 'balance_due'],
      populate: uid === INV_UID ? { customer: { fields: ['name'] } } : { supplier: { fields: ['name'] } },
      limit: 100000,
    });
    const buckets = { current: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    const rows = [];
    for (const x of (docs || [])) {
      const bal = Number(x.balance_due != null ? x.balance_due : (Number(x.total || 0) - Number(x.amount_paid || 0)));
      if (bal <= 0) continue;
      const due = x.due_date || x.date;
      const age = Math.floor((new Date(ref) - new Date(due)) / 86400000);
      const bucket = age > 90 ? 'd90_plus' : age > 60 ? 'd61_90' : age > 30 ? 'd31_60' : 'current';
      buckets[bucket] = round2(buckets[bucket] + bal);
      rows.push({ id: x.id, party: x.customer?.name || x.supplier?.name || '', due_date: due, age_days: age, balance: round2(bal), bucket });
    }
    return { as_of: ref, buckets, total: round2(Object.values(buckets).reduce((s, v) => s + v, 0)), rows };
  },

  async arAging({ asOf } = {}) { return this._aging(INV_UID, asOf); },
  async apAging({ asOf } = {}) { return this._aging(BILL_UID, asOf); },
});
