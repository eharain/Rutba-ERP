'use strict';

/**
 * /me/stock-items-search — flat query params → filters + populate.
 *
 * The POS search box fires that route on every keystroke, and spelling the
 * query out client-side made each request a ~700-character URL: the six-way
 * `$or` repeated the search term once per field, and the populate tree was
 * re-sent verbatim every time. Callers now send
 * `?view=search&q=rawat&status=InStock` and the shape is rebuilt here.
 *
 * `view` is the marker for the flat form. Without it the controller falls
 * through to the legacy `filters[…]`/`populate[…]` handling, so callers still
 * on the old contract keep working.
 *
 * Kept in its own module because it is pure — same input, same output, no
 * strapi/ctx — which is what makes it testable on its own.
 */

const STOCK_ITEM_VIEWS = {
    // POS sale-editor dropdown: needs a thumbnail and the brand per row.
    search: {
        product: { populate: { logo: true, gallery: true, brands: true } },
        purchase_item: { populate: { purchase: true } },
    },
    // Product stock-items table: no imagery, just the owning product and the
    // purchase the unit arrived on.
    product: {
        product: true,
        purchase_item: { populate: { purchase: true } },
    },
};

// Fields a typed term is matched against. product.barcode is the manufacturer /
// EAN code shared across every unit, so scanning the maker's label resolves too.
function stockItemSearchOr(term) {
    return {
        $or: [
            { name: { $containsi: term } },
            { barcode: { $containsi: term } },
            { sku: { $containsi: term } },
            { product: { name: { $containsi: term } } },
            { product: { sku: { $containsi: term } } },
            { product: { barcode: { $containsi: term } } },
        ],
    };
}

/**
 * @param {object} query  ctx.query
 * @returns {{filters:object, populate:object, page:any, pageSize:any, sort:string}|null}
 *          null when the request is not in the flat form (legacy caller).
 */
function shapeStockItemsQuery(query) {
    const view = typeof query?.view === 'string' ? query.view : '';
    // hasOwn, not a truthy index: `view` is unvalidated request input, and a
    // plain lookup resolves inherited keys — `?view=constructor` would hand the
    // query layer `Object` as a populate tree.
    if (!view || !Object.hasOwn(STOCK_ITEM_VIEWS, view)) return null;

    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const term = str(query.q);

    const filters = {
        ...(str(query.status) ? { status: str(query.status) } : {}),
        ...(str(query.branch) ? { branch: { documentId: str(query.branch) } } : {}),
        ...(str(query.product) ? { product: { documentId: str(query.product) } } : {}),
        // Only an affirmative value opts in — an `archived=0` left behind by a
        // caller building params conditionally must not flip the filter on.
        // Presence of the key is what makes the controller skip its default
        // "exclude archived" clause, matching the legacy contract.
        ...(query.archived === '1' || query.archived === 'true' ? { archived: true } : {}),
        ...(term ? stockItemSearchOr(term) : {}),
    };

    return {
        filters,
        populate: STOCK_ITEM_VIEWS[view],
        page: query.page,
        pageSize: query.pageSize,
        sort: str(query.sort) || 'createdAt:desc',
    };
}

module.exports = { shapeStockItemsQuery, stockItemSearchOr, STOCK_ITEM_VIEWS };
