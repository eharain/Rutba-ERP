'use strict';

/**
 * cash-register controller
 *
 * Extended with custom actions:
 *  - POST /cash-registers/open   → open a new register (validates one-per-desk)
 *  - PUT  /cash-registers/:id/close  → close an active register
 *  - GET  /cash-registers/active → get the active register for a desk
 *  - PUT  /cash-registers/:id/expire → mark as Expired (called by cron or guard)
 */

const { createCoreController } = require('@strapi/strapi').factories;

const EXPIRY_HOURS = 20;

/** Returns true when the register has been open longer than EXPIRY_HOURS */
function isExpired(register) {
  if (!register || !register.opened_at) return false;
  const openedMs = new Date(register.opened_at).getTime();
  return Date.now() - openedMs > EXPIRY_HOURS * 60 * 60 * 1000;
}

module.exports = createCoreController('api::cash-register.cash-register', ({ strapi }) => ({

  /* ── GET /cash-registers/active?desk_id=X ──────────────────── */
  async active(ctx) {
    const { desk_id } = ctx.query;
    if (!desk_id) return ctx.badRequest('desk_id is required');

    const registers = await strapi.documents('api::cash-register.cash-register').findMany({
      filters: {
        desk_id: { $eq: Number(desk_id) },
        status: { $eq: 'Active' },
      },
      sort: [{ opened_at: 'desc' }],
      limit: 1,
      populate: ['opened_by_user', 'branch', 'payments', 'transactions'],
    });

    const register = registers[0] ?? null;

    // Auto-expire if over 20 hours
    if (register && isExpired(register)) {
      await strapi.documents('api::cash-register.cash-register').update({
        documentId: register.documentId,
        data: { status: 'Expired' },
      });
      register.status = 'Expired';
      return ctx.send({ data: null, meta: { expired: register } });
    }

    return ctx.send({ data: register });
  },

  /* ── POST /cash-registers/open ─────────────────────────────── */
  async open(ctx) {
    const { desk_id, desk_name, branch_id, branch_name, opening_cash,
            opened_by, opened_by_id, branch: branchConnect,
            opened_by_user: userConnect } = ctx.request.body?.data ?? {};

    if (!desk_id) return ctx.badRequest('desk_id is required');

    // Expire any stale active registers for this desk
    const existing = await strapi.documents('api::cash-register.cash-register').findMany({
      filters: { desk_id: { $eq: Number(desk_id) }, status: { $eq: 'Active' } },
      limit: 10,
    });

    for (const reg of existing) {
      if (isExpired(reg)) {
        await strapi.documents('api::cash-register.cash-register').update({
          documentId: reg.documentId,
          data: { status: 'Expired' },
        });
      } else {
        return ctx.conflict('An active register already exists for this desk. Close it first.');
      }
    }

    const created = await strapi.documents('api::cash-register.cash-register').create({
      data: {
        opening_cash: Number(opening_cash || 0),
        opened_at: new Date().toISOString(),
        status: 'Active',
        desk_id: Number(desk_id),
        desk_name: desk_name || '',
        branch_id: branch_id || null,
        branch_name: branch_name || '',
        opened_by: opened_by || '',
        opened_by_id: opened_by_id || null,
        ...(branchConnect ? { branch: branchConnect } : {}),
        ...(userConnect ? { opened_by_user: userConnect } : {}),
      },
      populate: ['opened_by_user', 'branch'],
    });

    return ctx.send({ data: created });
  },

  /* ── PUT /cash-registers/:id/close ─────────────────────────── */
  async close(ctx) {
    const { id } = ctx.params;
    const { counted_cash, closing_cash, notes,
            closed_by, closed_by_id, closed_by_user: closedUserConnect } = ctx.request.body?.data ?? {};

    const register = await strapi.documents('api::cash-register.cash-register').findFirst({
      documentId: id,
      populate: ['payments', 'transactions'],
    });

    if (!register) return ctx.notFound('Register not found');
    if (register.status === 'Closed') return ctx.badRequest('Register is already closed');
    if (register.status === 'Cancelled') return ctx.badRequest('Register has been cancelled');

    // Compute expected cash
    const openingCash = Number(register.opening_cash || 0);
    let cashSales = 0;
    let cashRefunds = 0;
    for (const p of (register.payments || [])) {
      const amt = Number(p.amount || 0);
      if (p.payment_method === 'Cash') {
        const received = Number(p.cash_received || amt);
        const change = Number(p.change || 0);
        cashSales += received - change;
      }
    }
    let cashDrops = 0;
    let cashExpenses = 0;
    let cashAdjustments = 0;
    for (const t of (register.transactions || [])) {
      const amt = Number(t.amount || 0);
      switch (t.type) {
        case 'CashDrop':   cashDrops += amt; break;
        case 'Expense':    cashExpenses += amt; break;
        case 'Refund':     cashRefunds += amt; break;
        case 'Adjustment': cashAdjustments += amt; break;
      }
    }

    const expectedCash = openingCash + cashSales - cashRefunds - cashExpenses - cashDrops + cashAdjustments;
    const countedValue = Number(counted_cash ?? closing_cash ?? 0);
    const difference = countedValue - expectedCash;

    const updated = await strapi.documents('api::cash-register.cash-register').update({
      documentId: id,
      data: {
        closing_cash: countedValue,
        counted_cash: countedValue,
        expected_cash: expectedCash,
        difference,
        short_cash: Math.max(-difference, 0),
        closed_at: new Date().toISOString(),
        status: 'Closed',
        notes: notes || '',
        closed_by: closed_by || '',
        closed_by_id: closed_by_id || null,
        ...(closedUserConnect ? { closed_by_user: closedUserConnect } : {}),
      },
      populate: ['opened_by_user', 'closed_by_user', 'branch', 'payments', 'transactions'],
    });

    return ctx.send({ data: updated });
  },

  /* ── PUT /cash-registers/:id/expire ────────────────────────── */
  async expire(ctx) {
    const { id } = ctx.params;
    const register = await strapi.documents('api::cash-register.cash-register').findFirst({
      documentId: id,
    });

    if (!register) return ctx.notFound('Register not found');
    if (register.status !== 'Active') return ctx.badRequest('Only active registers can be expired');

    const updated = await strapi.documents('api::cash-register.cash-register').update({
      documentId: id,
      data: { status: 'Expired' },
    });

    return ctx.send({ data: updated });
  },
}));
