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
 * doesn't explicitly list).  That also skips the api-pro interceptor
 * (it needs a ctx.state.user nothing has populated yet), so these
 * routes have NO authorization layer above the controller: every
 * handler calls `requireAppRole()` to parse the Bearer token AND
 * confirm the caller actually works a POS/accounting desk. Merely
 * being authenticated is not enough — a rutba.pk storefront customer
 * holds a perfectly valid JWT.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { hasAppRole, requireAppRole } = require('../../../utils/require-admin');

const EXPIRY_HOURS = 20;

// The drawer is POS + accounting territory (`accounts` also matches the
// accounts_viewer_* keys by prefix). Level stays open for the everyday
// actions — reading and opening a register is the cashier's own job, so
// pos_staff must pass. `close` re-checks ownership and `expire` narrows to
// manager+ on top of this baseline.
const DRAWER_DOMAINS = ['sale', 'accounts'];

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
    fields: ['cash_left', 'counted_cash', 'expected_cash', 'opening_cash', 'closed_at', 'opened_at', 'status', 'desk_name', 'force_closed'],
  });
  const reg = prev?.[0];
  if (!reg) return null;
  // Prefer what was intentionally LEFT in the drawer; then what was counted;
  // then the computed expected (session never counted).
  const left = reg.cash_left;
  const counted = reg.counted_cash;
  const expected = reg.expected_cash;
  let amount = null, source = 'none';
  if (reg.force_closed) {
    // Force-closed: its expected_cash was written off as unaccounted, so
    // carrying it forward would tell the next shift to expect money that
    // isn't there. The float is genuinely unknown — say so and warn nobody.
    amount = null; source = 'force-closed';
  }
  else if (left != null) { amount = Number(left); source = 'left'; }
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

/**
 * The most recent Expired register that was never closed, for this desk or
 * this user. Closing one is a manager/admin job (see `close`), so it can sit
 * unclosed for a while — long enough that the desk needs to start its next
 * session regardless. Returns null when there is none.
 */
async function findUnclosedExpired(strapi, deskId, userDocId) {
  const base = { status: { $eq: 'Expired' }, closed_at: { $null: true } };
  const query = {
    sort: [{ opened_at: 'desc' }],
    limit: 1,
    fields: ['desk_id', 'desk_name', 'opened_at', 'opened_by', 'opening_cash'],
  };
  if (deskId) {
    const byDesk = await strapi.documents('api::cash-register.cash-register').findMany({
      ...query,
      filters: { ...base, desk_id: { $eq: Number(deskId) } },
    });
    if (byDesk[0]) return byDesk[0];
  }
  if (userDocId) {
    const byUser = await strapi.documents('api::cash-register.cash-register').findMany({
      ...query,
      filters: { ...base, opened_by_user: { documentId: { $eq: userDocId } } },
    });
    if (byUser[0]) return byUser[0];
  }
  return null;
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
 * Does `user` own `register`?
 *
 * Returns true / false, or NULL when the register records no opener at all —
 * a distinct answer, because those registers must stay closable by the desk
 * rather than escalating to an admin. Registers opened before the server
 * started stamping the opener are exactly this case.
 */
function resolveOwnership(register, user) {
  const ownerId = register.opened_by_user?.id ?? register.opened_by_id ?? null;
  if (ownerId != null) return Number(ownerId) === Number(user?.id);

  // No relation and no id — fall back to the display name the POS recorded.
  const openedBy = String(register.opened_by || '').trim().toLowerCase();
  if (openedBy) {
    return openedBy === String(user?.username || '').trim().toLowerCase()
      || openedBy === String(user?.email || '').trim().toLowerCase();
  }
  return null; // ownerless
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
    if (!await requireAppRole(ctx, strapi, {
      domains: DRAWER_DOMAINS,
      message: 'A POS or accounts app role is required to read a cash register',
    })) return;

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
      let carryover = null;
      try { carryover = await getDeskCarryover(strapi, desk_id); } catch (_) { /* best-effort */ }
      return ctx.send({ data: null, meta: { expired: register, carryover } });
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
        let carryover = null;
        try { carryover = await getDeskCarryover(strapi, desk_id); } catch (_) { /* best-effort */ }
        return ctx.send({ data: null, meta: { expired, carryover } });
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
    if (!await requireAppRole(ctx, strapi, {
      domains: DRAWER_DOMAINS,
      message: 'A POS or accounts app role is required to open a cash register',
    })) return;

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

    // ── An expired register may still be sitting unclosed ────────────────
    // Only a manager/admin can close one, and staff must not be stranded
    // until that happens — a desk with an unclosed expired register can
    // still start its next session. The invariant that actually matters is
    // enforced above: one ACTIVE, non-expired register per desk and per
    // user. What the expired register does earn is a note on the new one,
    // so whoever eventually closes it knows the drawer was rolled over and
    // its cash count is not the count for that shift alone.
    let pendingExpired = null;
    try {
      pendingExpired = await findUnclosedExpired(strapi, desk_id, currentUserDocId);
    } catch (e) {
      strapi.log.warn(`cash-register open: pending-expired lookup failed — ${e.message}`);
    }
    let pendingNote = null;
    if (pendingExpired) {
      const detail = [
        pendingExpired.opened_at ? `opened ${new Date(pendingExpired.opened_at).toISOString()}` : null,
        pendingExpired.opened_by ? `by ${pendingExpired.opened_by}` : null,
      ].filter(Boolean).join(' ');
      pendingNote = `ℹ Opened while register #${pendingExpired.id} was still expired and unclosed`
        + `${detail ? ` (${detail})` : ''}. The drawer was handed over to this session — `
        + `reconcile #${pendingExpired.id} against this register's opening cash ${Number(opening_cash || 0).toFixed(2)}.`;
    }

    const combinedNote = [openingNote, pendingNote].filter(Boolean).join('\n') || null;

    // Stamp the opener from the AUTHENTICATED user, not from the request body.
    // The POS client reads its user out of storage once at mount, so it can
    // post an empty `opened_by`/`opened_by_user` — which left registers with no
    // recorded owner, and therefore closable only by an admin. The server
    // always knows who is calling, so it fills these in itself; the client
    // values are only a fallback.
    const openerName = currentUser?.username || currentUser?.email || opened_by || '';
    const openerId = currentUser?.id ?? opened_by_id ?? null;
    // Prefer the documentId; fall back to the numeric id rather than
    // String(id), which would connect nothing.
    const openerRef = currentUser?.documentId ?? currentUser?.id ?? null;
    const openerConnect = openerRef != null ? { connect: [openerRef] } : (userConnect || null);

    const created = await strapi.documents('api::cash-register.cash-register').create({
      data: {
        opening_cash: Number(opening_cash || 0),
        opened_at: new Date().toISOString(),
        status: 'Active',
        desk_id: Number(desk_id),
        desk_name: desk_name || '',
        branch_id: branch_id || null,
        branch_name: branch_name || '',
        opened_by: openerName,
        opened_by_id: openerId,
        ...(carryover && carryover.amount != null ? { carry_over_expected: carryover.amount } : {}),
        ...(combinedNote ? { opening_note: combinedNote } : {}),
        ...(branchConnect ? { branch: branchConnect } : {}),
        ...(openerConnect ? { opened_by_user: openerConnect } : {}),
      },
      populate: ['opened_by_user', 'branch'],
    });

    // Accounting: opening float moves from the safe into the drawer.
    try {
      const oc = Number(created.opening_cash || 0);
      if (oc > 0) {
        const accounting = strapi.service('api::acc-journal-entry.accounting');
        const resolver = strapi.service('api::acc-journal-entry.account-resolver');
        const branchId = created.branch?.id || null;
        const already = await accounting.findBySource('Cash Register Open', created.id);
        if (!already || already.length === 0) {
          await accounting.createAndPost({
            date: new Date(),
            description: `Register opened — desk ${created.desk_name || created.desk_id}`,
            source_type: 'Cash Register Open',
            source_id: created.id,
            source_ref: `REG-${created.id}`,
            lines: [
              { account: await resolver.resolve('CASH_DRAWER', branchId), debit: oc, credit: 0, description: 'Opening float' },
              { account: await resolver.resolve('CASH_SAFE', branchId), debit: 0, credit: oc, description: 'From safe' },
            ],
            branch: branchId,
            posted_by: ctx.state?.user?.email || '',
          });
        }
      }
    } catch (err) {
      strapi.log.error(`[cash-register open] accounting failed: ${err.message}`);
    }

    return ctx.send({ data: created, meta: { carryover, openingNote: combinedNote, pendingExpired } });
  },

  /* ── PUT /cash-registers/:id/close ─────────────────────────── */
  async close(ctx) {
    if (!await requireAppRole(ctx, strapi, {
      domains: DRAWER_DOMAINS,
      message: 'A POS or accounts app role is required to close a cash register',
    })) return;

    const { id } = ctx.params;
    const { counted_cash, closing_cash, cash_left, cash_drawn, notes,
            force, force_reason,
            closed_by, closed_by_id, closed_by_user: closedUserConnect } = ctx.request.body?.data ?? {};

    // Force close: an admin clears a register nobody can produce a cash count
    // for any more — the staff member left, the drawer was emptied by someone
    // else, the shift is weeks old. The count is recorded as UNKNOWN (null)
    // rather than invented as 0, and `force_closed` marks it so the register
    // report can tell "counted nothing" apart from "never counted".
    const forceClose = force === true || force === 'true';

    const register = await strapi.documents('api::cash-register.cash-register').findOne({
      documentId: id,
      populate: ['payments', 'transactions', 'opened_by_user'],
    });

    if (!register) return ctx.notFound('Register not found');
    if (register.status === 'Closed') return ctx.badRequest('Register is already closed');
    if (register.status === 'Cancelled') return ctx.badRequest('Register has been cancelled');

    // ── Who may close this ──────────────────────────────────
    // The gate above only established that the caller works a desk at all;
    // this decides WHICH drawer they may close. The rule matches the POS UI —
    // you close your own live register; someone else's, or an expired one,
    // needs a manager/admin (that's the path the registers list uses).
    const actor = ctx.state.user;
    const actorId = actor.id;
    const ownership = resolveOwnership(register, actor);

    // Ownerless register (opened before the server stamped the opener): anyone
    // working that same desk closes it, provided they hold a POS role. The desk
    // comes from the caller, which is a weak claim — but it only ever widens
    // access to registers that name nobody, and the alternative is a drawer
    // the desk physically holds but cannot close without an admin.
    let isOwner = ownership === true;
    if (ownership === null && !isOwner) {
      const actorDeskId = ctx.request.body?.data?.desk_id;
      const sameDesk = actorDeskId != null && register.desk_id != null
        && Number(actorDeskId) === Number(register.desk_id);
      if (sameDesk) {
        isOwner = await hasAppRole(strapi, actorId, { domains: DRAWER_DOMAINS });
      }
    }

    if (forceClose || !isOwner || register.status === 'Expired') {
      const privileged = await hasAppRole(strapi, actorId, {
        domains: DRAWER_DOMAINS,
        levels: ['admin', 'manager'],
      });
      if (!privileged) {
        const deskLabel = register.desk_name || `desk ${register.desk_id}`;
        return ctx.forbidden(
          forceClose ? 'Only a manager or admin can force-close a register.'
            : isOwner ? 'This register has expired — only a manager or admin can close it.'
            : ownership === null
              ? `This register records no opener — close it from ${deskLabel}, or ask a manager.`
              : "Only a manager or admin can close another user's register."
        );
      }
    }

    const closerRef = actor?.documentId ?? actor?.id ?? null;
    const closerConnect = closerRef != null ? { connect: [closerRef] } : (closedUserConnect || null);

    // A force close writes off whatever the drawer was expected to hold, so it
    // has to say why. That reason is the only audit trail this close leaves.
    const forceReason = String(force_reason ?? notes ?? '').trim();
    if (forceClose && !forceReason) {
      return ctx.badRequest('A reason is required to force-close a register');
    }

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
    // A force close has no count at all: counted/difference stay null so no
    // report ever treats an invented 0 as a real observation.
    const leftVal = !forceClose && cash_left != null ? Number(cash_left) : null;
    const drawnVal = !forceClose && cash_drawn != null ? Number(cash_drawn) : null;
    const countedValue = forceClose
      ? null
      : (leftVal != null || drawnVal != null)
        ? (leftVal || 0) + (drawnVal || 0)
        : Number(counted_cash ?? closing_cash ?? 0);
    const difference = forceClose ? null : countedValue - expectedCash;

    const updated = await strapi.documents('api::cash-register.cash-register').update({
      documentId: id,
      data: {
        closing_cash: countedValue,
        counted_cash: countedValue,
        ...(leftVal != null ? { cash_left: leftVal } : {}),
        ...(drawnVal != null ? { cash_drawn: drawnVal } : {}),
        expected_cash: expectedCash,
        difference,
        short_cash: forceClose ? null : Math.max(-difference, 0),
        closed_at: new Date().toISOString(),
        status: 'Closed',
        // A force close sends no notes — don't blank whatever is already there.
        notes: notes != null ? notes : (register.notes || ''),
        force_closed: forceClose,
        ...(forceClose ? { force_close_reason: forceReason } : {}),
        // Stamped from the authenticated caller for the same reason as the
        // opener — the client's copy of the user can be empty.
        closed_by: actor?.username || actor?.email || closed_by || '',
        closed_by_id: actor?.id ?? closed_by_id ?? null,
        ...(closerConnect ? { closed_by_user: closerConnect } : {}),
      },
      populate: ['opened_by_user', 'closed_by_user', 'branch', 'payments', 'transactions'],
    });

    // Accounting: clear the drawer into the safe, booking the variance to Cash
    // Short/Over. The GL drawer balance excludes manual Adjustments (those are
    // reconciliation markers whose cash effect is booked by their underlying
    // event), so it equals opening + cash sales + top-ups − refunds − expenses −
    // drops — exactly what the per-event JEs have accumulated on the drawer.
    try {
      const accounting = strapi.service('api::acc-journal-entry.accounting');
      const resolver = strapi.service('api::acc-journal-entry.account-resolver');
      const branchId = updated.branch?.id || register.branch?.id || null;
      const already = await accounting.findBySource('Cash Register Close', register.id);
      if (!already || already.length === 0) {
        const glDrawer = Math.round((expectedCash - cashAdjustments) * 100) / 100;
        // Force close: nothing was recovered into the safe, so the whole drawer
        // balance lands on Cash Short/Over. Leaving it on CASH_DRAWER instead
        // would keep an account open against a register nobody can reconcile.
        const counted = Math.round(Number(countedValue || 0) * 100) / 100;
        const variance = Math.round((counted - glDrawer) * 100) / 100;
        const lines = [];
        if (counted > 0) lines.push({ account: await resolver.resolve('CASH_SAFE', branchId), debit: counted, credit: 0, description: 'Counted cash to safe' });
        if (variance < 0) lines.push({ account: await resolver.resolve('CASH_SHORT_OVER', branchId), debit: -variance, credit: 0, description: forceClose ? 'Unaccounted cash (force close)' : 'Cash short' });
        if (glDrawer > 0) lines.push({ account: await resolver.resolve('CASH_DRAWER', branchId), debit: 0, credit: glDrawer, description: 'Clear drawer' });
        if (variance > 0) lines.push({ account: await resolver.resolve('CASH_SHORT_OVER', branchId), debit: 0, credit: variance, description: 'Cash over' });
        if (lines.length >= 2) {
          await accounting.createAndPost({
            date: new Date(),
            description: forceClose
              ? `Register force-closed, no cash count — desk ${register.desk_name || register.desk_id} (${forceReason})`
              : `Register closed — desk ${register.desk_name || register.desk_id}`,
            source_type: 'Cash Register Close',
            source_id: register.id,
            source_ref: `REG-${register.id}`,
            lines,
            branch: branchId,
            posted_by: ctx.state?.user?.email || '',
          });
        }
      }
    } catch (err) {
      strapi.log.error(`[cash-register close] accounting failed: ${err.message}`);
    }

    return ctx.send({ data: updated });
  },

  /* ── PUT /cash-registers/:id/expire ────────────────────────── */
  async expire(ctx) {
    // Expiring is the manual override for the auto-expiry `active`/`open`
    // already apply — it retires a drawer someone else is still holding, so
    // it needs the same manager+ standing that closing a foreign register does.
    if (!await requireAppRole(ctx, strapi, {
      domains: DRAWER_DOMAINS,
      levels: ['admin', 'manager'],
      message: 'Only a manager or admin can expire a cash register',
    })) return;

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
