'use strict';

/**
 * cancel controller
 *
 * PUT /sales/:id/cancel
 *
 * Admin-only action that cancels a sale that has not been fully paid.
 *
 *  1. Restores all linked stock items back to "InStock".
 *  2. Creates reversal (negative) payment records.
 *  3. Records an Adjustment transaction on the cash register.
 *  4. Marks the sale status as "Cancelled".
 *
 * Authentication is enforced manually (auth: false on the route)
 * so Strapi doesn't reject the custom action name.
 */

async function ensureUser(ctx, strapi) {
  if (ctx.state?.user) return ctx.state.user;
  try {
    const token = await strapi
      .plugin('users-permissions')
      .service('jwt')
      .getToken(ctx);
    if (token?.id) {
      const user = await strapi
        .plugin('users-permissions')
        .service('user')
        .fetchAuthenticatedUser(token.id);
      if (user && !user.blocked) {
        ctx.state.user = user;
        return user;
      }
    }
  } catch (_) { /* invalid / missing token */ }
  ctx.unauthorized('Authentication required');
  return null;
}

/**
 * Check whether the authenticated user is an admin for the "sale" app.
 */
async function isAdminUser(userId, strapi) {
  const user = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: userId },
    populate: {
      role: { select: ['type'] },
      admin_app_accesses: { select: ['key'] },
    },
  });

  // Super-admin role always passes
  if (user?.role?.type === 'admin') return true;

  // App-level admin for the "sale" app
  const adminKeys = (user?.admin_app_accesses || []).map((a) => a.key);
  return adminKeys.includes('sale');
}

module.exports = {
  async cancel(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    // ── Admin guard ─────────────────────────────────────────
    const admin = await isAdminUser(user.id, strapi);
    if (!admin) {
      return ctx.forbidden('Only administrators can cancel sales');
    }

    const { id } = ctx.params;

    // ── Load the sale with items → stock items, payments, register ──
    const sale = await strapi.documents('api::sale.sale').findOne({
      documentId: id,
      populate: {
        items: {
          populate: {
            items: true,   // stock items linked to each sale item
          },
        },
        payments: true,
        cash_register: true,
      },
    });

    if (!sale) return ctx.notFound('Sale not found');

    if (sale.status === 'Cancelled') {
      return ctx.badRequest('Sale is already cancelled');
    }

    if (sale.payment_status === 'Paid') {
      return ctx.badRequest('Cannot cancel a fully paid sale. Process a return instead.');
    }

    // ── 1) Restore stock items to InStock ────────────────────
    for (const saleItem of (sale.items || [])) {
      for (const stockItem of (saleItem.items || [])) {
        const docId = stockItem.documentId || stockItem.id;
        if (!docId) continue;

        // Only restore items that were marked Sold or Reserved
        if (stockItem.status === 'Sold' || stockItem.status === 'Reserved') {
          await strapi.documents('api::stock-item.stock-item').update({
            documentId: String(docId),
            data: {
              status: 'InStock',
            },
          });
        }
      }
    }

    // ── 2) Reverse payments + cash-register adjustments ─────
    const register = sale.cash_register;
    const registerDocId = register?.documentId || register?.id;
    let totalReversed = 0;

    for (const payment of (sale.payments || [])) {
      const amt = Number(payment.amount || 0);
      if (amt === 0) continue;

      totalReversed += amt;
      const paymentDocId = payment.documentId || payment.id;

      // Create a reversal payment (negative amount)
      await strapi.documents('api::payment.payment').create({
        data: {
          payment_method: payment.payment_method || 'Cash',
          amount: -amt,
          payment_date: new Date().toISOString(),
          transaction_no: `CANCEL-${sale.invoice_no || id}`,
          sale: { connect: [id] },
          ...(registerDocId ? { cash_register: { connect: [String(registerDocId)] } } : {}),
        },
      });
    }

    // Record a single adjustment transaction on the cash register
    if (registerDocId && totalReversed > 0) {
      await strapi.documents('api::cash-register-transaction.cash-register-transaction').create({
        data: {
          type: 'Adjustment',
          amount: -totalReversed,
          description: `Cancel sale ${sale.invoice_no || id} — reversed ${totalReversed.toFixed(2)}`,
          transaction_date: new Date().toISOString(),
          performed_by: user.email || user.username || '',
          cash_register: { connect: [String(registerDocId)] },
        },
      });
    }

    // ── 3) Reverse accounting journal entries ───────────────
    try {
      const accounting = strapi.service('api::acc-journal-entry.accounting');
      await accounting.reverseBySource('POS Sale', sale.id, {
        posted_by: user.email || user.username || '',
      });
    } catch (accountingError) {
      strapi.log.error(
        `Accounting reversal failed for sale ${sale.id || id}: ${accountingError.message}`
      );
    }

    // ── 4) Mark sale as Cancelled ────────────────────────────
    const updated = await strapi.documents('api::sale.sale').update({
      documentId: id,
      data: {
        status: 'Cancelled',
        payment_status: 'Unpaid',
        canceled_at: new Date().toISOString(),
        canceled_by: user.email || user.username || '',
      },
    });

    return ctx.send({ data: updated });
  },
};
