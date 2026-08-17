'use strict';

/**
 * `is_active: false` takes a product off sale without unpublishing it: it stays
 * editable in the back office, keeps its history, but must not surface on the
 * storefront or reach a marketplace.
 *
 * Rows that predate the field carry NULL, which counts as active — the same
 * `!== false` semantics the marketplace engine uses. That is why this is an
 * explicit true-or-null test rather than `$ne: false`: in SQL `is_active != false`
 * evaluates to UNKNOWN for NULL and would silently drop every legacy row.
 */
const ACTIVE_PRODUCT_FILTER = {
  $or: [{ is_active: { $eq: true } }, { is_active: { $null: true } }],
};

module.exports = { ACTIVE_PRODUCT_FILTER };
