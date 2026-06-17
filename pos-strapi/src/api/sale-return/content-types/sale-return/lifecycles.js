'use strict';

/**
 * Sale Return accounting lifecycle (POS returns/refunds & exchanges).
 *
 * On refund_status → Refunded / Credited, post the contra-revenue + refund and
 * (best-effort) reverse COGS for any restocked units. Keyed source_type
 * 'Sale Return' + the return id, so posting is idempotent (findBySource).
 * Exchanges also create a new sale whose revenue/COGS post through the normal
 * POS checkout path — this lifecycle only books the return side.
 */

const SR_UID = 'api::sale-return.sale-return';

// refund_method → account-resolver key for the credit (cash out) side.
const REFUND_METHOD_KEY = {
  Cash: 'CASH_DRAWER',
  Card: 'CARD_CLEARING',
  Bank: 'BANK_PRIMARY',
  'Mobile Wallet': 'MOBILE_WALLET',
  'Store Credit': 'CUSTOMER_DEPOSITS',
  'Exchange Return': 'CUSTOMER_DEPOSITS',
};

const POSTED = ['Refunded', 'Credited'];

async function postReturn(strapi, id) {
  const accounting = strapi.service('api::acc-journal-entry.accounting');
  const resolver = strapi.service('api::acc-journal-entry.account-resolver');

  const sr = await strapi.entityService.findOne(SR_UID, id, {
    fields: ['return_no', 'total_refund', 'refund_method', 'refund_status', 'type'],
    populate: {
      branches: { fields: ['id'] },
      items: { populate: { items: { fields: ['cost_price'] } } },
    },
  });
  if (!sr || !POSTED.includes(sr.refund_status)) return;

  // Idempotency.
  const existing = await accounting.findBySource('Sale Return', id);
  if (existing && existing.length > 0) return;

  const amount = Math.round(Number(sr.total_refund || 0) * 100) / 100;
  if (amount <= 0) return;

  const branchId = sr.branches?.[0]?.id || null;
  const refundKey = REFUND_METHOD_KEY[sr.refund_method] || 'CASH_DRAWER';

  // --- Contra-revenue + refund ---
  await accounting.createAndPost({
    date: sr.return_date || new Date(),
    description: `Sale Return ${sr.return_no}`,
    source_type: 'Sale Return',
    source_id: id,
    source_ref: sr.return_no,
    lines: [
      { account: await resolver.resolve('SALES_RETURNS', branchId), debit: amount, credit: 0, description: 'Sales return' },
      { account: await resolver.resolve(refundKey, branchId), debit: 0, credit: amount, description: `Refund — ${sr.refund_method}` },
    ],
    branch: branchId,
  });

  // --- COGS reversal for restocked units (best-effort) ---
  let cost = 0;
  for (const line of (sr.items || [])) {
    for (const si of (line.items || [])) cost += Number(si?.cost_price || 0);
  }
  cost = Math.round(cost * 100) / 100;
  if (cost > 0) {
    await accounting.createAndPost({
      date: sr.return_date || new Date(),
      description: `COGS reversal for Return ${sr.return_no}`,
      source_type: 'Sale Return',
      source_id: id,
      source_ref: sr.return_no,
      lines: [
        { account: await resolver.resolve('INVENTORY', branchId), debit: cost, credit: 0, description: 'Inventory restocked' },
        { account: await resolver.resolve('COGS', branchId), debit: 0, credit: cost, description: 'Reverse COGS' },
      ],
      branch: branchId,
    });
  }
}

module.exports = {
  async afterCreate(event) {
    const { result } = event;
    if (!POSTED.includes(result?.refund_status)) return;
    try { await postReturn(strapi, result.id); }
    catch (err) { strapi.log.error(`[sale-return lifecycle] accounting failed for ${result.id}: ${err.message}`); }
  },

  async beforeUpdate(event) {
    const id = event.params?.where?.id || event.params?.where;
    if (!id) return;
    const existing = await strapi.entityService.findOne(SR_UID, id, { fields: ['refund_status'] });
    event.state = { previousRefundStatus: existing?.refund_status || null };
  },

  async afterUpdate(event) {
    const { result, state } = event;
    const prev = state?.previousRefundStatus;
    if (!POSTED.includes(result?.refund_status)) return;
    if (POSTED.includes(prev)) return; // already posted on a prior transition
    try { await postReturn(strapi, result.id); }
    catch (err) { strapi.log.error(`[sale-return lifecycle] accounting failed for ${result.id}: ${err.message}`); }
  },
};
