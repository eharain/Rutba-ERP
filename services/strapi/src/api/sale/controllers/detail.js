'use strict';

/**
 * detail controller
 *
 * GET /sales/:id/detail
 *
 * One sale with the full POS detail tree — payments, customer, register, line
 * items, and both sides of every exchange. The tree is built here instead of
 * being spelled out by the caller: as a querystring it ran to ~2KB per request
 * (`/api/sales/?filters[$or][0][invoice_no]=…&populate[exchange_returns]…`),
 * which is what the sale page, the receipt print and the post-save reload each
 * sent. `/sales/<id>/detail` carries the same information in ~30 characters.
 *
 * `:id` accepts a documentId, a numeric id, or an invoice_no — the sale page
 * routes on whichever one the user arrived with.
 *
 * Row-level scoping still applies. For CUSTOM actions api-pro's enforce
 * middleware resolves the caller's policy and both stashes the filter fragment
 * on ctx.state.apiProPolicy and injects it into ctx.query.filters (core CRUD
 * gets it at the documents layer instead, after sanitization). We AND that
 * fragment into the lookup — skipping it would let a staff user read any sale
 * by guessing an invoice number, which the previous core-`find` route did not
 * allow. `detail` resolves to the same ownership-only template `findOne` did:
 * the seeder's owner+recency shorthand adds its recency clamp for `find` only.
 */

const DETAIL_POPULATE = {
  payments: {
    populate: {
      sale_return: { fields: ['id', 'documentId', 'return_no', 'type'] },
    },
  },
  customer: true,
  cash_register: {
    fields: ['id', 'documentId', 'desk_id', 'desk_name', 'branch_name', 'opened_by', 'opened_at', 'status'],
  },
  items: { populate: { product: true, items: { populate: ['product'] } } },
  sale_returns: {
    populate: {
      items: { populate: { product: true, items: { populate: ['product'] } } },
      exchange_sale: { fields: ['id', 'documentId', 'invoice_no'] },
    },
  },
  exchange_returns: {
    populate: {
      items: { populate: { product: true, items: { populate: ['product'] } } },
      sale: { fields: ['id', 'documentId', 'invoice_no'] },
    },
  },
};

// documentId / invoice_no are strings; `id` is the numeric row id. Only offer
// the `id` arm for values that could actually be one — handing MySQL a
// documentId to compare against an integer column is a coercion the DB is free
// to resolve surprisingly, and that arm could never match anyway.
function identityFilter(idOrInvoice) {
  const or = [{ invoice_no: idOrInvoice }, { documentId: idOrInvoice }];
  if (/^\d+$/.test(idOrInvoice)) or.push({ id: Number(idOrInvoice) });
  return { $or: or };
}

module.exports = {
  async detail(ctx) {
    const idOrInvoice = ctx.params?.id;
    if (!idOrInvoice) return ctx.badRequest('id is required');

    // Prefer the fragment api-pro stashed on state: it is set whenever a policy
    // resolved, independent of whether the ctx.query rewrite took. Client-sent
    // filters are a safe fallback — a filter can only narrow the match.
    const scoped = ctx.state?.apiProPolicy?.filters ?? ctx.query?.filters;
    const filters = scoped && Object.keys(scoped).length > 0
      ? { $and: [identityFilter(idOrInvoice), scoped] }
      : identityFilter(idOrInvoice);

    const [sale] = await strapi.documents('api::sale.sale').findMany({
      filters,
      populate: DETAIL_POPULATE,
      limit: 1,
    });

    // A miss is indistinguishable from "exists but out of your scope", and
    // deliberately so — the caller renders "sale not found" either way.
    return ctx.send({ data: sale ?? null });
  },
};
