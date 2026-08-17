'use strict';

/**
 * GET /stock-items/stock-health
 *
 * Cohort stock-health report — for stock CREATED within a date range (the
 * cohort's peak at creation), how much is still in stock vs sold, per product,
 * with pct_remaining / pct_sold. Operational analytics → requires an inventory /
 * stock / sale app-role (NOT just any authenticated JWT — a storefront customer
 * must not read catalogue analytics). Auth enforced manually (auth:false route).
 * See api::stock-item.computeCohortStockHealth for the query + dedupe details.
 *
 * Query params:
 *   from, to        — createdAt cohort range (ISO date; optional — omit both for all-time)
 *   branch          — branch documentId (optional)
 *   minPct, maxPct  — filter on pct_remaining (0–100)
 *   minSold, maxSold — filter on pct_sold (0–100)
 *   category, brand, supplier, term, purchase — product-taxonomy / PO documentId filters
 *   search          — product name/sku contains
 *   includeReserved — 1/true to count Reserved units as still in stock
 *   sort            — 'asc' (default, most-depleted first) | 'desc'
 *   page, pageSize
 */

const { requireAppRole } = require('../../../utils/require-admin');

const STOCK_ITEM_UID = 'api::stock-item.stock-item';

const numOrNull = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

module.exports = {
  async getStockHealth(ctx) {
    // Gate to inventory/stock/sale members (mirrors the StockItemsEndpoints
    // descriptor domains). A bare ensureUser would admit a storefront customer JWT.
    const user = await requireAppRole(ctx, strapi, {
      domains: ['inventory', 'stock', 'sale'],
      message: 'Inventory / stock access is required to view stock health',
    });
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
