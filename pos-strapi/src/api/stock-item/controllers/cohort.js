'use strict';

/**
 * GET /stock-items/stock-health
 *
 * Cohort stock-health report — for stock CREATED within a date range (the
 * cohort's peak at creation), how much is still in stock vs sold, per product,
 * with pct_remaining / pct_sold. Operational (not financial) → any authenticated
 * inventory/stock user. Auth enforced manually (auth:false route). See
 * api::stock-item.computeCohortStockHealth for the query + dedupe details.
 *
 * Query params:
 *   from, to        — createdAt cohort range (ISO date; default last 90 days)
 *   branch          — branch documentId (optional)
 *   minPct, maxPct  — filter on pct_remaining (0–100)
 *   includeReserved — 1/true to count Reserved units as still in stock
 *   sort            — 'asc' (default, most-depleted first) | 'desc'
 *   page, pageSize
 */

const { ensureUser } = require('../../../utils/ensure-user');

const STOCK_ITEM_UID = 'api::stock-item.stock-item';

const numOrNull = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

module.exports = {
  async getStockHealth(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const q = ctx.query || {};
    const report = await strapi.service(STOCK_ITEM_UID).computeCohortStockHealth({
      from: q.from || null,
      to: q.to || null,
      branchDocId: q.branch || null,
      minPct: numOrNull(q.minPct),
      maxPct: numOrNull(q.maxPct),
      minSoldPct: numOrNull(q.minSold),
      maxSoldPct: numOrNull(q.maxSold),
      includeReserved: q.includeReserved === '1' || q.includeReserved === 'true',
      sort: q.sort || 'asc',
      categoryDocId: q.category || null,
      brandDocId: q.brand || null,
      supplierDocId: q.supplier || null,
      termDocId: q.term || null,
      purchaseDocId: q.purchase || null,
      search: q.search || null,
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 50,
    });

    return ctx.send({
      success: true,
      asOf: report.asOf,
      from: report.from,
      to: report.to,
      branch: report.branch,
      data: report.rows,
      meta: {
        pagination: {
          page: report.page,
          pageSize: report.pageSize,
          pageCount: report.pageCount,
          total: report.count,
        },
      },
    });
  },
};
