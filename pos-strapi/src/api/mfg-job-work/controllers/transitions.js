'use strict';

/**
 * Job-work state transitions — dispatch / receive / cancel / close.
 *
 * A job-work order sends serialized stock-items to a third-party vendor
 * (e.g. stitching) and receives them back transformed. On dispatch each unit
 * goes InStock -> AtJobWork (out with the vendor; not counted in any on-hand)
 * and a mfg-job-work-item line is created snapshotting the outgoing
 * product/cost. On receive each line is resolved:
 *   - Returned: the SAME stock-item is transformed in place — product swaps to
 *     the returned product, cost_price = sent cost + service charge +/- manual
 *     adjustment, optional new selling_price, status back to InStock. The line
 *     keeps the before/after snapshot; the stock-item's status_history keeps
 *     the price trail.
 *   - Lost / Damaged: the unit's status flips accordingly (stays out of stock).
 * Close generates the vendor bill (acc-bill, Dr INVENTORY / Cr AP — the charge
 * is capitalized into the returned units' cost, so it must not hit expenses).
 *
 * Every unit mutation is a documents/entity update so the stock-item lifecycle
 * recomputes product.stock_quantity + the per-branch stock-level cache.
 *
 * Auth is manual (auth:false on the routes) so Strapi doesn't reject the custom
 * action names — same pattern as stock-transfer transitions.
 */

const { requireAppRole } = require('../../../utils/require-admin');

const JW_UID = 'api::mfg-job-work.mfg-job-work';
const JW_ITEM_UID = 'api::mfg-job-work-item.mfg-job-work-item';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const PRODUCT_UID = 'api::product.product';
const BILL_UID = 'api::acc-bill.acc-bill';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const requireJobWorkMember = (ctx, strapi, levels = null) => requireAppRole(ctx, strapi, {
  domains: ['manufacturing'],
  ...(levels ? { levels } : {}),
});

async function loadJobWork(strapi, ref) {
  if (ref == null || ref === '') return null;
  const where = (typeof ref === 'number' || /^\d+$/.test(String(ref)))
    ? { id: Number(ref) }
    : { documentId: String(ref) };
  return strapi.db.query(JW_UID).findOne({
    where,
    populate: {
      vendor: { select: ['id', 'documentId', 'name'] },
      branch: { select: ['id', 'documentId', 'name'] },
      bill: { select: ['id', 'documentId', 'bill_number', 'status'] },
      stock_items: {
        select: ['id', 'documentId', 'status', 'barcode', 'cost_price', 'selling_price', 'units_sold'],
        populate: { product: { select: ['id', 'documentId', 'name'] } },
      },
      items: {
        select: ['id', 'documentId', 'status', 'barcode', 'sent_cost', 'service_charge'],
        populate: {
          stock_item: { select: ['id', 'documentId', 'status'] },
          sent_product: { select: ['id', 'documentId', 'name'] },
        },
      },
    },
  });
}

/** Resolve a product documentId to a row, preferring the published edition. */
async function resolveProduct(strapi, documentId) {
  if (!documentId) return null;
  const q = strapi.db.query(PRODUCT_UID);
  const published = await q.findOne({
    where: { documentId: String(documentId), publishedAt: { $notNull: true } },
    select: ['id', 'documentId', 'name', 'sku'],
  });
  if (published) return published;
  return q.findOne({
    where: { documentId: String(documentId) },
    select: ['id', 'documentId', 'name', 'sku'],
  });
}

/** Recompute total_charge and the derived header status from the line states. */
async function syncHeaderFromLines(strapi, jwId) {
  const lines = await strapi.db.query(JW_ITEM_UID).findMany({
    where: { job_work: { id: jwId } },
    select: ['id', 'status', 'service_charge'],
  });
  const resolvedStatuses = ['Returned', 'Lost', 'Damaged'];
  const totalCharge = round2(lines
    .filter((l) => resolvedStatuses.includes(l.status))
    .reduce((sum, l) => sum + (Number(l.service_charge) || 0), 0));
  const anyDispatched = lines.some((l) => l.status === 'Dispatched');
  const anyResolved = lines.some((l) => resolvedStatuses.includes(l.status));
  return { totalCharge, anyDispatched, anyResolved };
}

module.exports = {
  // POST /mfg-job-works/:id/dispatch
  async dispatch(ctx) {
    const user = await requireJobWorkMember(ctx, strapi);
    if (!user) return;

    const jw = await loadJobWork(strapi, ctx.params.id);
    if (!jw) return ctx.notFound('Job work not found');
    if (jw.status !== 'Draft') return ctx.badRequest(`Cannot dispatch a job work in status ${jw.status}`);
    if (!jw.vendor?.id) return ctx.badRequest('Job work has no vendor');

    const units = jw.stock_items || [];
    if (units.length === 0) return ctx.badRequest('Job work has no units to dispatch');

    let dispatched = 0;
    const skipped = [];
    for (const u of units) {
      // Partially-sold divisible units can't leave whole — the stock-item
      // lifecycle guard would reject the status flip anyway.
      if (u.status !== 'InStock' || Number(u.units_sold) > 0) {
        skipped.push({ documentId: u.documentId, barcode: u.barcode, status: u.status });
        continue;
      }
      await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data: { status: 'AtJobWork' } });
      await strapi.entityService.create(JW_ITEM_UID, {
        data: {
          job_work: jw.id,
          stock_item: u.id,
          barcode: u.barcode,
          status: 'Dispatched',
          sent_product: u.product?.id || null,
          sent_cost: u.cost_price,
          sent_selling_price: u.selling_price,
        },
      });
      dispatched += 1;
    }

    if (dispatched === 0) {
      return ctx.badRequest('No eligible units — only whole InStock units can be dispatched', { skipped });
    }

    await strapi.entityService.update(JW_UID, jw.id, {
      data: { status: 'Dispatched', dispatched_at: new Date().toISOString() },
    });

    strapi.log.info(`[mfg-job-work] ${jw.jw_number} dispatched ${dispatched}/${units.length} to ${jw.vendor?.name} by ${user.email || user.id}`);
    return ctx.send({ success: true, status: 'Dispatched', dispatched, skipped });
  },

  // POST /mfg-job-works/:id/receive
  // body: { lines: [{ documentId, outcome: 'Returned'|'Lost'|'Damaged',
  //                   returned_product?, service_charge?, cost_adjustment?,
  //                   returned_selling_price?, notes? }] }
  async receive(ctx) {
    const user = await requireJobWorkMember(ctx, strapi);
    if (!user) return;

    const jw = await loadJobWork(strapi, ctx.params.id);
    if (!jw) return ctx.notFound('Job work not found');
    if (!['Dispatched', 'PartiallyReturned'].includes(jw.status)) {
      return ctx.badRequest(`Cannot receive a job work in status ${jw.status}`);
    }

    // The generated client wraps POST bodies as { data: {...} } — accept both shapes.
    const rawBody = ctx.request.body || {};
    const body = (rawBody.data && typeof rawBody.data === 'object') ? rawBody.data : rawBody;
    const payloadLines = Array.isArray(body?.lines) ? body.lines : [];
    if (payloadLines.length === 0) return ctx.badRequest('No lines to receive');

    const byDocId = new Map((jw.items || []).map((l) => [l.documentId, l]));
    const results = [];
    for (const p of payloadLines) {
      const line = byDocId.get(String(p.documentId));
      if (!line) { results.push({ documentId: p.documentId, error: 'Line not found on this job work' }); continue; }
      if (line.status !== 'Dispatched') { results.push({ documentId: p.documentId, error: `Line already ${line.status}` }); continue; }
      if (!['Returned', 'Lost', 'Damaged'].includes(p.outcome)) {
        results.push({ documentId: p.documentId, error: `Invalid outcome ${p.outcome}` });
        continue;
      }
      if (!line.stock_item?.id) { results.push({ documentId: p.documentId, error: 'Line has no stock item' }); continue; }

      const now = new Date().toISOString();
      if (p.outcome === 'Returned') {
        const charge = round2(p.service_charge != null ? p.service_charge : (jw.agreed_rate || 0));
        const adjustment = round2(p.cost_adjustment != null ? p.cost_adjustment : 0);
        const newCost = round2((Number(line.sent_cost) || 0) + charge + adjustment);

        const product = p.returned_product
          ? await resolveProduct(strapi, p.returned_product)
          : null;
        const targetProduct = product || line.sent_product || null;
        if (p.returned_product && !product) {
          results.push({ documentId: p.documentId, error: `Returned product ${p.returned_product} not found` });
          continue;
        }

        const stockData = {
          status: 'InStock',
          cost_price: newCost,
        };
        if (targetProduct?.id) {
          stockData.product = targetProduct.id;
          if (targetProduct.name) stockData.name = targetProduct.name;
          if (targetProduct.sku) stockData.sku = targetProduct.sku;
        }
        if (p.returned_selling_price != null && p.returned_selling_price !== '') {
          stockData.selling_price = round2(p.returned_selling_price);
        }
        await strapi.entityService.update(STOCK_ITEM_UID, line.stock_item.id, { data: stockData });

        await strapi.entityService.update(JW_ITEM_UID, line.id, {
          data: {
            status: 'Returned',
            returned_product: targetProduct?.id || null,
            service_charge: charge,
            cost_adjustment: adjustment,
            returned_cost: newCost,
            returned_selling_price: stockData.selling_price != null ? stockData.selling_price : null,
            returned_at: now,
            ...(p.notes ? { notes: String(p.notes) } : {}),
          },
        });
        results.push({ documentId: p.documentId, status: 'Returned', returned_cost: newCost });
      } else {
        // Lost / Damaged — the unit stays out of stock; the vendor is normally
        // not paid for it (service_charge defaults to 0, override if agreed).
        const charge = round2(p.service_charge != null ? p.service_charge : 0);
        await strapi.entityService.update(STOCK_ITEM_UID, line.stock_item.id, { data: { status: p.outcome } });
        await strapi.entityService.update(JW_ITEM_UID, line.id, {
          data: {
            status: p.outcome,
            service_charge: charge,
            returned_at: now,
            ...(p.notes ? { notes: String(p.notes) } : {}),
          },
        });
        results.push({ documentId: p.documentId, status: p.outcome });
      }
    }

    const { totalCharge, anyDispatched } = await syncHeaderFromLines(strapi, jw.id);
    const status = anyDispatched ? 'PartiallyReturned' : 'Returned';
    await strapi.entityService.update(JW_UID, jw.id, { data: { status, total_charge: totalCharge } });

    const ok = results.filter((r) => !r.error).length;
    strapi.log.info(`[mfg-job-work] ${jw.jw_number} received ${ok}/${payloadLines.length} -> ${status} by ${user.email || user.id}`);
    return ctx.send({ success: true, status, total_charge: totalCharge, results });
  },

  // POST /mfg-job-works/:id/cancel
  async cancel(ctx) {
    const user = await requireJobWorkMember(ctx, strapi, ['admin', 'manager']);
    if (!user) return;

    const jw = await loadJobWork(strapi, ctx.params.id);
    if (!jw) return ctx.notFound('Job work not found');
    if (!['Draft', 'Dispatched'].includes(jw.status)) {
      return ctx.badRequest(`Cannot cancel a job work in status ${jw.status}`);
    }
    const anyResolved = (jw.items || []).some((l) => ['Returned', 'Lost', 'Damaged'].includes(l.status));
    if (anyResolved) {
      return ctx.badRequest('Cannot cancel — some units are already resolved. Receive the rest instead.');
    }

    let reverted = 0;
    for (const line of (jw.items || [])) {
      if (line.status !== 'Dispatched') continue;
      if (line.stock_item?.id && line.stock_item.status === 'AtJobWork') {
        await strapi.entityService.update(STOCK_ITEM_UID, line.stock_item.id, { data: { status: 'InStock' } });
        reverted += 1;
      }
      await strapi.entityService.update(JW_ITEM_UID, line.id, { data: { status: 'Cancelled' } });
    }

    await strapi.entityService.update(JW_UID, jw.id, { data: { status: 'Cancelled' } });
    strapi.log.info(`[mfg-job-work] ${jw.jw_number} cancelled (reverted ${reverted}) by ${user.email || user.id}`);
    return ctx.send({ success: true, status: 'Cancelled', reverted });
  },

  // POST /mfg-job-works/:id/close
  // Requires all lines resolved. Generates the vendor bill (idempotent) for
  // total_charge - deduction_amount and marks the job work Closed.
  async close(ctx) {
    const user = await requireJobWorkMember(ctx, strapi, ['admin', 'manager']);
    if (!user) return;

    const jw = await loadJobWork(strapi, ctx.params.id);
    if (!jw) return ctx.notFound('Job work not found');
    if (jw.status !== 'Returned') {
      return ctx.badRequest(`Cannot close a job work in status ${jw.status} — all units must be resolved first`);
    }

    const { totalCharge } = await syncHeaderFromLines(strapi, jw.id);
    const payable = round2(totalCharge - (Number(jw.deduction_amount) || 0));

    let bill = jw.bill || null;
    if (!bill && payable > 0) {
      if (!jw.vendor?.id) return ctx.badRequest('Job work has no vendor to bill');
      const today = new Date();
      const due = new Date(today.getTime() + 30 * 86400000);
      const ymd = (d) => d.toISOString().slice(0, 10);

      const draft = await strapi.documents(BILL_UID).create({
        data: {
          bill_number: `BILL-${jw.jw_number}`,
          date: ymd(today),
          due_date: ymd(due),
          subtotal: payable,
          tax_amount: 0,
          total: payable,
          balance_due: payable,
          status: 'Draft',
          supplier: jw.vendor.id,
          ...(jw.branch?.id ? { branch: jw.branch.id } : {}),
          // The stitching charge is capitalized into the returned units'
          // cost_price, so the bill must debit inventory, not expenses.
          expense_key: 'INVENTORY',
          notes: `Job work ${jw.jw_number}${jw.service_description ? ` — ${jw.service_description}` : ''}`,
        },
      });
      bill = await strapi.documents(BILL_UID).update({
        documentId: draft.documentId,
        data: { status: 'Received' },
      });
    }

    await strapi.entityService.update(JW_UID, jw.id, {
      data: {
        status: 'Closed',
        closed_at: new Date().toISOString(),
        total_charge: totalCharge,
        ...(bill?.id ? { bill: bill.id } : {}),
      },
    });

    strapi.log.info(`[mfg-job-work] ${jw.jw_number} closed (payable ${payable}${bill ? `, bill ${bill.bill_number}` : ', no bill'}) by ${user.email || user.id}`);
    return ctx.send({
      success: true,
      status: 'Closed',
      total_charge: totalCharge,
      payable,
      bill: bill ? { documentId: bill.documentId, bill_number: bill.bill_number, status: bill.status } : null,
    });
  },
};
