'use strict';

/**
 * cash-register controller
 *
 * Extended with custom actions:
 *  - POST /cash-registers/open   → open a new register (or reuse the user's existing one)
 *  - PUT  /cash-registers/:id/close  → close an active register
 *  - GET  /cash-registers/active → get the active register for a desk or user
 *  - PUT  /cash-registers/:id/expire → mark as Expired (called by cron or guard)
 *
 * Custom routes use `auth: false` to bypass Strapi's scope-based
 * permission check (which rejects custom action names the role
 * doesn't explicitly list).  Because `auth: false` also skips JWT
 * parsing, every handler calls `ensureUser()` first to manually
 * extract the authenticated user from the Bearer token.
 */

const { createCoreController } = require('@strapi/strapi').factories;

const EXPIRY_HOURS = 20;

/** Returns true when the register has been open longer than EXPIRY_HOURS */
function isExpired(register) {
  if (!register || !register.opened_at) return false;
  const openedMs = new Date(register.opened_at).getTime();
  return Date.now() - openedMs > EXPIRY_HOURS * 60 * 60 * 1000;
}

/**
 * The cash a desk's previous session left behind — i.e. what a new register's
 * opening cash should match. Looks at the most recent Closed/Expired register
 * for the desk and prefers the physically counted_cash; falls back to the
 * computed expected_cash when the session was never counted.
 * Returns null when the desk has no prior register.
 */
async function getDeskCarryover(strapi, deskId) {
  if (!deskId) return null;
  const prev = await strapi.documents('api::cash-register.cash-register').findMany({
    filters: {
      desk_id: { $eq: Number(deskId) },
      status: { $in: ['Closed', 'Expired'] },
    },
    sort: [{ closed_at: 'desc' }, { opened_at: 'desc' }],
    limit: 1,
    fields: ['cash_left', 'counted_cash', 'expected_cash', 'opening_cash', 'closed_at', 'opened_at', 'status', 'desk_name'],
  });
  const reg = prev?.[0];
  if (!reg) return null;
  // Prefer what was intentionally LEFT in the drawer; then what was counted;
  // then the computed expected (session never counted).
  const left = reg.cash_left;
  const counted = reg.counted_cash;
  const expected = reg.expected_cash;
  let amount = null, source = 'none';
  if (left != null) { amount = Number(left); source = 'left'; }
  else if (counted != null) { amount = Number(counted); source = 'counted'; }
  else if (expected != null) { amount = Number(expected); source = 'expected'; }
  return {
    amount,
    source,
    registerId: reg.id,
    registerDocId: reg.documentId,
    status: reg.status,
    closedAt: reg.closed_at || null,
  };
}

/** Build the opening mismatch warning string, or null when opening matches carryover. */
function buildOpeningNote(opening, carryover) {
  if (!carryover || carryover.amount == null) return null;
  const diff = Math.round((Number(opening || 0) - carryover.amount) * 100) / 100;
  if (Math.abs(diff) < 0.01) return null;
  const srcLabel = carryover.source === 'left' ? 'left-in-drawer'
    : carryover.source === 'counted' ? 'counted'
    : 'expected (uncounted)';
  return `⚠ Opening cash ${Number(opening || 0).toFixed(2)} does not match previous register #${carryover.registerId}'s ${srcLabel} cash ${carryover.amount.toFixed(2)} `
    + `(${diff > 0 ? 'over by' : 'short by'} ${Math.abs(diff).toFixed(2)}). Verify the float before continuing.`;
}

/**
 * Manually parse the JWT and populate ctx.state.user.
 * Returns the user object, or null (after sending 401) if invalid.
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

module.exports = createCoreController('api::cash-register.cash-register', ({ strapi }) => ({

  /* ── GET /cash-registers/active?desk_id=X&user_id=Y ────────
   *
   * Lookup order:
   *  1. If desk_id is given, look for an active register on that desk.
   *  2. If nothing found (or desk_id omitted) and user_id is given,
   *     look for any active register opened by this user (any desk).
   *  3. Auto-expire stale registers.
   * ──────────────────────────────────────────────────────────── */
  async active(ctx) {
    if (!await ensureUser(ctx, strapi)) return;

    const { desk_id, user_id } = ctx.query;
    if (!desk_id && !user_id) return ctx.badRequest('desk_id or user_id is required');

    let register = null;

    // 1. Try desk-specific lookup
    if (desk_id) {
      const byDesk = await strapi.documents('api::cash-register.cash-register').findMany({
        filters: {
          desk_id: { $eq: Number(desk_id) },
          status: { $in: ['Active', 'Open'] },
        },
        sort: [{ opened_at: 'desc' }],
        limit: 1,
        populate: ['opened_by_user', 'branch', 'payments', 'transactions'],
      });
      register = byDesk[0] ?? null;
    }

    // 2. Fall back to user-level lookup (any desk)
    if (!register && user_id) {
      const byUser = await strapi.documents('api::cash-register.cash-register').findMany({
        filters: {
          opened_by_user: { documentId: { $eq: user_id } },
          status: { $in: ['Active', 'Open'] },
        },
        sort: [{ opened_at: 'desc' }],
        limit: 1,
        populate: ['opened_by_user', 'branch', 'payments', 'transactions'],
      });
      register = byUser[0] ?? null;
    }

    // Auto-expire if over EXPIRY_HOURS
    if (register && isExpired(register)) {
      await strapi.documents('api::cash-register.cash-register').update({
        documentId: register.documentId,
        data: { status: 'Expired' },
      });
      register.status = 'Expired';
      return ctx.send({ data: null, meta: { expired: register } });
    }

    // If no active register, look for unclosed expired registers
    // so the user can still close them properly
    if (!register) {
      let expired = null;
      if (desk_id) {
        const byDesk = await strapi.documents('api::cash-register.cash-register').findMany({
          filters: {
            desk_id: { $eq: Number(desk_id) },
            status: { $eq: 'Expired' },
            closed_at: { $null: true },
          },
          sort: [{ opened_at: 'desc' }],
          limit: 1,
          populate: ['opened_by_user', 'branch', 'payments', 'transactions'],
        });
        expired = byDesk[0] ?? null;
      }
      if (!expired && user_id) {
        const byUser = await strapi.documents('api::cash-register.cash-register').findMany({
          filters: {
            opened_by_user: { documentId: { $eq: user_id } },
            status: { $eq: 'Expired' },
            closed_at: { $null: true },
          },
          sort: [{ opened_at: 'desc' }],
          limit: 1,
          populate: ['opened_by_user', 'branch', 'payments', 'transactions'],
        });
        expired = byUser[0] ?? null;
      }
      if (expired) {
        return ctx.send({ data: null, meta: { expired } });
      }
    }

    // No active register → the client will show the "Open Register" form.
    // Surface the desk's carry-over so it can pre-warn on a float mismatch.
    if (!register) {
      let carryover = null;
      try { carryover = await getDeskCarryover(strapi, desk_id); } catch (_) { /* best-effort */ }
      return ctx.send({ data: null, meta: { carryover } });
    }

    return ctx.send({ data: register });
  },

  /* ── POST /cash-registers/open ─────────────────────────────
   *
   * If the user already has an active register (on any desk) that
   * register is returned instead of creating a duplicate.
   * ──────────────────────────────────────────────────────────── */
  async open(ctx) {
    if (!await ensureUser(ctx, strapi)) return;

    const { desk_id, desk_name, branch_id, branch_name, opening_cash,
            opened_by, opened_by_id, branch: branchConnect,
            opened_by_user: userConnect } = ctx.request.body?.data ?? {};

    if (!desk_id) return ctx.badRequest('desk_id is required');

    const currentUser = ctx.state.user;
    const currentUserDocId = currentUser?.documentId || String(currentUser?.id);

    // ── Check if this user already owns an active register (any desk) ──
    if (currentUserDocId) {
      const userRegisters = await strapi.documents('api::cash-register.cash-register').findMany({
        filters: {
          opened_by_user: { documentId: { $eq: currentUserDocId } },
          status: { $in: ['Active', 'Open'] },
        },
        sort: [{ opened_at: 'desc' }],
        limit: 5,
        populate: ['opened_by_user', 'branch'],
      });

      for (const reg of userRegisters) {
        if (isExpired(reg)) {
          await strapi.documents('api::cash-register.cash-register').update({
            documentId: reg.documentId,
            data: { status: 'Expired' },
          });
        } else {
          // User already has a live register — return it
          return ctx.send({ data: reg });
        }
      }
    }

    // ── Expire any stale active/open registers for this desk ──
    const existing = await strapi.documents('api::cash-register.cash-register').findMany({
      filters: { desk_id: { $eq: Number(desk_id) }, status: { $in: ['Active', 'Open'] } },
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

    // ── Carry-over check: does this float match what the last session left? ──
    // Never let this block opening a register — degrade to "no warning" on error.
    let carryover = null;
    let openingNote = null;
    try {
      carryover = await getDeskCarryover(strapi, desk_id);
      openingNote = buildOpeningNote(opening_cash, carryover);
    } catch (e) {
      strapi.log.warn(`cash-register open: carryover lookup failed — ${e.message}`);
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
        ...(carryover && carryover.amount != null ? { carry_over_expected: carryover.amount } : {}),
        ...(openingNote ? { opening_note: openingNote } : {}),
        ...(branchConnect ? { branch: branchConnect } : {}),
        ...(userConnect ? { opened_by_user: userConnect } : {}),
      },
      populate: ['opened_by_user', 'branch'],
    });

    return ctx.send({ data: created, meta: { carryover, openingNote } });
  },

  /* ── PUT /cash-registers/:id/close ─────────────────────────── */
  async close(ctx) {
    if (!await ensureUser(ctx, strapi)) return;

    const { id } = ctx.params;
    const { counted_cash, closing_cash, cash_left, cash_drawn, notes,
            closed_by, closed_by_id, closed_by_user: closedUserConnect } = ctx.request.body?.data ?? {};

    const register = await strapi.documents('api::cash-register.cash-register').findOne({
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
      // Only positive Cash tenders are cash IN. Refund payouts are stored as
      // negative Cash payments AND a matching 'Refund' transaction — counting the
      // negative payment here too would double-subtract the refund (this is what
      // pushed many historical registers to negative expected cash).
      if (p.payment_method === 'Cash' && amt >= 0) {
        const received = Number(p.cash_received || amt);
        const change = Number(p.change || 0);
        cashSales += received - change;
      }
    }
    let cashDrops = 0;
    let cashTopups = 0;
    let cashExpenses = 0;
    let cashAdjustments = 0;
    for (const t of (register.transactions || [])) {
      const amt = Number(t.amount || 0);
      switch (t.type) {
        case 'CashDrop':   cashDrops += amt; break;
        case 'CashTopUp':  cashTopups += amt; break;
        case 'Expense':    cashExpenses += amt; break;
        case 'Refund':     cashRefunds += amt; break;
        case 'Adjustment': cashAdjustments += amt; break;
      }
    }

    // Mirror the POS dashboard's reconciliation exactly:
    // opening + net cash sales + top-ups + adjustments − refunds − expenses − drops.
    // Only genuine cash refunds reach `cashRefunds` (exchange returns no longer
    // create a 'Refund' transaction; non-cash returns are gated client-side).
    const expectedCash = openingCash + cashSales + cashTopups - cashRefunds - cashExpenses - cashDrops + cashAdjustments;

    // Counted total = cash left in the drawer + cash drawn out. Fall back to the
    // legacy single counted_cash/closing_cash field for older clients.
    const leftVal = cash_left != null ? Number(cash_left) : null;
    const drawnVal = cash_drawn != null ? Number(cash_drawn) : null;
    const countedValue = (leftVal != null || drawnVal != null)
      ? (leftVal || 0) + (drawnVal || 0)
      : Number(counted_cash ?? closing_cash ?? 0);
    const difference = countedValue - expectedCash;

    const updated = await strapi.documents('api::cash-register.cash-register').update({
      documentId: id,
      data: {
        closing_cash: countedValue,
        counted_cash: countedValue,
        ...(leftVal != null ? { cash_left: leftVal } : {}),
        ...(drawnVal != null ? { cash_drawn: drawnVal } : {}),
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
    if (!await ensureUser(ctx, strapi)) return;

    const { id } = ctx.params;
    const register = await strapi.documents('api::cash-register.cash-register').findOne({
      documentId: id,
    });

    if (!register) return ctx.notFound('Register not found');
    if (register.status !== 'Active' && register.status !== 'Open') return ctx.badRequest('Only active registers can be expired');

    const updated = await strapi.documents('api::cash-register.cash-register').update({
      documentId: id,
      data: { status: 'Expired' },
    });

    return ctx.send({ data: updated });
  },
}));
