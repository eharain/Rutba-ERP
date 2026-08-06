'use strict';

/**
 * purchase controller
 *
 * Extended with `generateBill` — turns a received purchase into a supplier bill
 * (acc-bill) so accounts payable is posted to the GL via the acc-bill lifecycle.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');

const PURCHASE_UID = 'api::purchase.purchase';
const BILL_UID = 'api::acc-bill.acc-bill';

const ymd = (d) => d.toISOString().slice(0, 10);

module.exports = createCoreController(PURCHASE_UID, ({ strapi }) => ({
  /**
   * POST /purchases/:documentId/generate-bill
   * Idempotent: one bill per purchase. Creates the bill Draft then flips it to
   * Received so the acc-bill lifecycle posts Dr Expense/Inventory · Cr AP.
   */
  async generateBill(ctx) {
    // requireAppRole reads the caller's REAL app_roles. The previous guard
    // populated a `permission_roles` relation that has no schema, so it always
    // came back empty and every non-super-admin — the accountants this action
    // exists for — was refused. `domains` are role-key prefixes.
    const user = await requireAppRole(ctx, strapi, {
      domains: ['accounts', 'ap', 'stock'],
      levels: ['admin', 'manager'],
      message: 'Accounts / purchasing access is required',
    });
    if (!user) return;

    const { documentId } = ctx.params;
    const purchase = await strapi.documents(PURCHASE_UID).findOne({
      documentId,
      populate: {
        suppliers: { fields: ['id'] },
        items: { fields: ['received_quantity', 'quantity', 'unit_price', 'price', 'total'] },
      },
    });
    if (!purchase) return ctx.notFound('Purchase not found');

    // Idempotency — one bill per purchase.
    const existing = await strapi.documents(BILL_UID).findMany({
      filters: { purchase: { documentId } },
      fields: ['documentId', 'bill_number', 'status'],
      limit: 1,
    });
    if (existing[0]) return ctx.send({ data: existing[0], meta: { existing: true } });

    // Subtotal from received items; fall back to the purchase total.
    let subtotal = 0;
    for (const it of (purchase.items || [])) {
      const qty = Number(it.received_quantity != null ? it.received_quantity : it.quantity || 0);
      const price = Number(it.unit_price != null ? it.unit_price : it.price || 0);
      if (qty && price) subtotal += qty * price;
      else subtotal += Number(it.total || 0);
    }
    subtotal = Math.round(subtotal * 100) / 100;
    if (subtotal <= 0) subtotal = Math.round(Number(purchase.total || 0) * 100) / 100;
    if (subtotal <= 0) return ctx.badRequest('Purchase has no value to bill');

    const today = new Date();
    const due = new Date(today.getTime() + 30 * 86400000);

    const draft = await strapi.documents(BILL_UID).create({
      data: {
        bill_number: `BILL-${purchase.orderId || purchase.documentId || purchase.id}`,
        date: ymd(today),
        due_date: ymd(due),
        subtotal,
        tax_amount: 0,
        total: subtotal,
        balance_due: subtotal,
        status: 'Draft',
        // A purchase buys goods, so the bill capitalizes into the inventory
        // asset — NOT the acc-bill lifecycle's OPERATING_EXPENSES default.
        // Expensing here would double-count: COGS already credits INVENTORY
        // when the stock sells, against a debit that never happened.
        expense_key: 'INVENTORY',
        purchase: purchase.id,
        ...(purchase.suppliers?.[0]?.id ? { supplier: purchase.suppliers[0].id } : {}),
      },
    });

    const bill = await strapi.documents(BILL_UID).update({
      documentId: draft.documentId,
      data: { status: 'Received' },
    });

    return ctx.send({ data: bill });
  },
}));
