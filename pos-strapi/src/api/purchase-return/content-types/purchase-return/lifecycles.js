'use strict';

/**
 * Purchase Return accounting lifecycle (goods sent back to a supplier).
 *
 * The mirror of the acc-bill receipt entry: a bill capitalizes goods with
 * Dr INVENTORY / Cr ACCOUNTS_PAYABLE, so returning them books the reverse —
 * Dr ACCOUNTS_PAYABLE / Cr INVENTORY. Without this the returned stock leaves
 * the warehouse while the ledger keeps carrying it as an asset and keeps
 * showing the supplier as owed.
 *
 * Keyed source_type 'Purchase Return' + the return id, so posting is
 * idempotent (findBySource) and reversible (reverseBySource). Posting is
 * best-effort — a missing mapping logs and is reconciled later; it never
 * unwinds the return itself.
 *
 * purchase-return has no status field: the document exists only once the
 * goods have gone back, so it posts on create. afterUpdate covers the case
 * where the header lands before its items and total_refund fills in after.
 */

const PR_UID = 'api::purchase-return.purchase-return';

async function postPurchaseReturn(strapi, id) {
  const accounting = strapi.service('api::acc-journal-entry.accounting');
  const resolver = strapi.service('api::acc-journal-entry.account-resolver');

  const pr = await strapi.entityService.findOne(PR_UID, id, {
    fields: ['return_no', 'return_date', 'total_refund'],
    populate: {
      branches: { fields: ['id'] },
      items: { fields: ['total', 'quantity', 'price'] },
    },
  });
  if (!pr) return;

  // Idempotency — never double-post for the same return.
  const existing = await accounting.findBySource('Purchase Return', id);
  if (existing && existing.length > 0) return;

  // Prefer the stated refund; fall back to the line items so a header saved
  // without a total still books the right value.
  let amount = Number(pr.total_refund || 0);
  if (amount <= 0) {
    for (const it of (pr.items || [])) {
      const total = Number(it?.total || 0);
      amount += total > 0 ? total : (Number(it?.quantity || 0) * Number(it?.price || 0));
    }
  }
  amount = Math.round(amount * 100) / 100;
  if (amount <= 0) return;

  const branchId = pr.branches?.[0]?.id || null;

  await accounting.createAndPost({
    date: pr.return_date || new Date(),
    description: `Purchase Return ${pr.return_no || id}`,
    source_type: 'Purchase Return',
    source_id: id,
    source_ref: pr.return_no || String(id),
    lines: [
      { account: await resolver.resolve('ACCOUNTS_PAYABLE', branchId), debit: amount, credit: 0, description: 'Supplier payable reduced' },
      { account: await resolver.resolve('INVENTORY', branchId), debit: 0, credit: amount, description: 'Goods returned to supplier' },
    ],
    branch: branchId,
  });
}

module.exports = {
  async afterCreate(event) {
    const { result } = event;
    if (!result?.id) return;
    try { await postPurchaseReturn(strapi, result.id); }
    catch (err) { strapi.log.error(`[purchase-return lifecycle] accounting failed for ${result.id}: ${err.message}`); }
  },

  async afterUpdate(event) {
    const { result } = event;
    if (!result?.id) return;
    try { await postPurchaseReturn(strapi, result.id); }
    catch (err) { strapi.log.error(`[purchase-return lifecycle] accounting failed for ${result.id}: ${err.message}`); }
  },
};
