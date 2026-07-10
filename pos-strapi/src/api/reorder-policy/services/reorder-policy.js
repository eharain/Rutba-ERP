'use strict';

/**
 * reorder-policy service — the replenishment suggestion engine (Epic 4 P1+2).
 *
 * getReorderSuggestions computes, on read, which (product, warehouse) targets are
 * at/below their reorder trigger and how much to order. It reads available on-hand
 * (per-warehouse from the stock-level cache F2, else product-level routed by
 * track_mode — serialized stock_quantity vs bulk bulk_quantity_on_hand F5),
 * subtracts nothing but ADDS open on-order, and applies the policy's min/max/ROP
 * math with supplier-pack rounding. Products with only the legacy
 * `product.reorder_level` and no policy get a ReorderPoint fallback so nothing
 * breaks on day one. Compute-on-read (not persisted) — a reorder-suggestion CT can
 * be layered later for review/coverage tracking.
 */

const { factories } = require('@strapi/strapi');

const POLICY_UID = 'api::reorder-policy.reorder-policy';
const PRODUCT_UID = 'api::product.product';
const STOCK_LEVEL_UID = 'api::stock-level.stock-level';
const PURCHASE_ITEM_UID = 'api::purchase-item.purchase-item';
const WAREHOUSE_UID = 'api::warehouse.warehouse';

// Purchases still contributing to on-order (not received/closed/cancelled).
const OPEN_PURCHASE_STATUSES = ['Draft', 'Pending', 'Submitted', 'Partially Received'];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const roundUpToPack = (qty, pack) => {
  const p = num(pack);
  return p > 1 ? Math.ceil(qty / p) * p : Math.ceil(qty);
};

const PROD_FIELDS = ['id', 'documentId', 'name', 'sku', 'track_mode', 'cost_price', 'bundle_units', 'reorder_level', 'stock_quantity', 'bulk_quantity_on_hand'];

module.exports = factories.createCoreService(POLICY_UID, ({ strapi }) => ({
  /** on-order = Σ(quantity − received_quantity) across OPEN purchase-items → Map<productId, qty>. */
  async _onOrderByProduct(productIds) {
    const ids = Array.from(new Set((productIds || []).filter(Boolean)));
    const map = new Map();
    if (ids.length === 0) return map;
    const rows = await strapi.db.query(PURCHASE_ITEM_UID).findMany({
      where: { product: { id: { $in: ids } }, purchase: { status: { $in: OPEN_PURCHASE_STATUSES } } },
      select: ['quantity', 'received_quantity'],
      populate: { product: { select: ['id'] } },
      limit: 100000,
    });
    for (const r of rows) {
      const pid = r.product?.id;
      if (!pid) continue;
      const open = num(r.quantity) - num(r.received_quantity);
      if (open > 0) map.set(pid, (map.get(pid) || 0) + open);
    }
    return map;
  },

  /** per-(product, warehouse) available on-hand from the stock-level cache → Map<`pid:whid`, qty>. */
  async _levelByProductWarehouse(pairs) {
    const map = new Map();
    const productIds = Array.from(new Set(pairs.map((p) => p.productId).filter(Boolean)));
    const warehouseIds = Array.from(new Set(pairs.map((p) => p.warehouseId).filter(Boolean)));
    if (productIds.length === 0 || warehouseIds.length === 0) return map;
    const rows = await strapi.db.query(STOCK_LEVEL_UID).findMany({
      where: { product: { id: { $in: productIds } }, warehouse: { id: { $in: warehouseIds } } },
      select: ['quantity_available', 'quantity_on_hand'],
      populate: { product: { select: ['id'] }, warehouse: { select: ['id'] } },
      limit: 100000,
    });
    for (const r of rows) {
      const key = `${r.product?.id}:${r.warehouse?.id}`;
      const avail = r.quantity_available != null ? num(r.quantity_available) : num(r.quantity_on_hand);
      map.set(key, (map.get(key) || 0) + avail);
    }
    return map;
  },

  /** product-level available on-hand, routed by track_mode (uses the F5 bulk ledger). */
  _productOnHand(product) {
    return product?.track_mode === 'bulk' ? num(product?.bulk_quantity_on_hand) : num(product?.stock_quantity);
  },

  /**
   * Compute reorder suggestions. Triggered rows only, most-deficient first.
   * @param {{ warehouseId?: number, warehouseDocId?: string }} opts
   */
  async getReorderSuggestions(opts = {}) {
    let warehouseId = opts.warehouseId || null;
    if (!warehouseId && opts.warehouseDocId) {
      const wh = await strapi.db.query(WAREHOUSE_UID).findOne({ where: { documentId: opts.warehouseDocId }, select: ['id'] });
      warehouseId = wh?.id || null;
    }

    // 1) active policies (optionally scoped to a warehouse, incl. product-wide defaults)
    const policyWhere = { is_active: true };
    if (warehouseId) policyWhere.$or = [{ warehouse: { id: warehouseId } }, { warehouse: { id: { $null: true } } }];
    const policies = await strapi.db.query(POLICY_UID).findMany({
      where: policyWhere,
      populate: {
        product: { select: PROD_FIELDS },
        warehouse: { select: ['id', 'documentId', 'name'] },
        preferred_supplier: { select: ['id', 'documentId', 'name'] },
      },
      limit: 100000,
    });

    const targets = [];
    const policyProductIds = new Set();
    for (const pol of policies) {
      if (!pol.product?.id) continue;
      policyProductIds.add(pol.product.id);
      targets.push({ policy: pol, product: pol.product, warehouse: pol.warehouse || null });
    }

    // 2) legacy fallback: products with reorder_level>0 and NO policy row
    const excludeIds = policyProductIds.size ? Array.from(policyProductIds) : [0];
    const fallbackProducts = await strapi.db.query(PRODUCT_UID).findMany({
      where: { reorder_level: { $gt: 0 }, id: { $notIn: excludeIds } },
      select: PROD_FIELDS,
      limit: 100000,
    });
    for (const product of fallbackProducts) targets.push({ policy: null, product, warehouse: null });

    if (targets.length === 0) return [];

    // 3) batch the two expensive reads
    const onOrder = await this._onOrderByProduct(targets.map((t) => t.product.id));
    const levels = await this._levelByProductWarehouse(
      targets.filter((t) => t.warehouse?.id).map((t) => ({ productId: t.product.id, warehouseId: t.warehouse.id })),
    );

    // 4) compute per target
    const suggestions = [];
    for (const { policy, product, warehouse } of targets) {
      const on_hand = warehouse?.id ? (levels.get(`${product.id}:${warehouse.id}`) || 0) : this._productOnHand(product);
      const on_order = onOrder.get(product.id) || 0;
      const projected = on_hand + on_order;

      const method = policy?.method || 'ReorderPoint';
      const min = policy && policy.min_stock != null ? num(policy.min_stock) : num(product.reorder_level);
      const safety = policy ? num(policy.safety_stock) : 0;
      const trigger = min + safety;
      if (!(projected <= trigger)) continue; // healthy — skip

      const max = policy && policy.max_stock != null ? num(policy.max_stock) : 0;
      let raw;
      if (method === 'ReorderPoint') {
        raw = policy && policy.reorder_quantity != null ? num(policy.reorder_quantity) : Math.max(min, 1);
      } else {
        raw = (max > 0 ? max : trigger) - projected; // MinMax / ParLevel / Manual → up to max
      }
      if (!(raw > 0)) continue;

      suggestions.push({
        product: product.documentId,
        product_name: product.name,
        sku: product.sku,
        warehouse: warehouse?.documentId || null,
        warehouse_name: warehouse?.name || null,
        method,
        source: policy?.source || 'Purchase',
        on_hand,
        on_order,
        projected,
        min_stock: min,
        safety_stock: safety,
        max_stock: max || null,
        suggested_qty: roundUpToPack(raw, product.bundle_units),
        deficit: trigger - projected,
        unit_cost: num(product.cost_price),
        preferred_supplier: policy?.preferred_supplier?.documentId || null,
        preferred_supplier_name: policy?.preferred_supplier?.name || null,
        policy: policy?.documentId || null,
        fallback: !policy,
      });
    }

    suggestions.sort((a, b) => b.deficit - a.deficit);
    return suggestions;
  },
}));
