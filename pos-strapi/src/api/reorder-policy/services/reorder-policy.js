'use strict';

/**
 * reorder-policy service — the replenishment suggestion engine (Epic 4 P1+2).
 *
 * getReorderSuggestions computes, on read, which (product, branch) targets are
 * at/below their reorder trigger and how much to order. It reads available on-hand
 * (per-branch from the stock-level cache F2, else product-level routed by
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
const PURCHASE_UID = 'api::purchase.purchase';
const PURCHASE_ITEM_UID = 'api::purchase-item.purchase-item';
const SUPPLIER_UID = 'api::supplier.supplier';
const BRANCH_UID = 'api::branch.branch';
const WO_UID = 'api::mfg-work-order.mfg-work-order';
const BOM_UID = 'api::mfg-bom.mfg-bom';

// Purchases still contributing to on-order (not received/closed/cancelled).
const OPEN_PURCHASE_STATUSES = ['Draft', 'Pending', 'Submitted', 'Partially Received'];
// Work orders still expected to produce output (not completed/cancelled).
const OPEN_WO_STATUSES = ['Draft', 'Released', 'InProgress'];
const STOCK_BATCH_UID = 'api::stock-batch.stock-batch';

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

  /** open-WO output = Σ quantity_ordered across open work orders → Map<productId, qty>.
   *  A draft/released WO producing a product raises its incoming supply, so
   *  repeatedly generating work-orders for the same deficit no longer duplicates. */
  async _onOrderWOByProduct(productIds) {
    const ids = Array.from(new Set((productIds || []).filter(Boolean)));
    const map = new Map();
    if (ids.length === 0) return map;
    const rows = await strapi.db.query(WO_UID).findMany({
      where: { product: { id: { $in: ids } }, status: { $in: OPEN_WO_STATUSES } },
      select: ['quantity_ordered'],
      populate: { product: { select: ['id'] } },
      limit: 100000,
    });
    for (const r of rows) {
      const pid = r.product?.id;
      if (!pid) continue;
      const q = num(r.quantity_ordered);
      if (q > 0) map.set(pid, (map.get(pid) || 0) + q);
    }
    return map;
  },

  /** per-(product, branch) Active-batch remaining for BULK products → Map<`pid:brid`, qty>. */
  async _bulkLevelByProductBranch(pairs) {
    const map = new Map();
    const productIds = Array.from(new Set(pairs.map((p) => p.productId).filter(Boolean)));
    const branchIds = Array.from(new Set(pairs.map((p) => p.branchId).filter(Boolean)));
    if (productIds.length === 0 || branchIds.length === 0) return map;
    const rows = await strapi.db.query(STOCK_BATCH_UID).findMany({
      where: { product: { id: { $in: productIds } }, branch: { id: { $in: branchIds } }, status: 'Active' },
      select: ['quantity_remaining'],
      populate: { product: { select: ['id'] }, branch: { select: ['id'] } },
      limit: 100000,
    });
    for (const r of rows) {
      const key = `${r.product?.id}:${r.branch?.id}`;
      map.set(key, (map.get(key) || 0) + num(r.quantity_remaining));
    }
    return map;
  },

  /** per-(product, branch) available on-hand from the stock-level cache → Map<`pid:brid`, qty>. */
  async _levelByProductBranch(pairs) {
    const map = new Map();
    const productIds = Array.from(new Set(pairs.map((p) => p.productId).filter(Boolean)));
    const branchIds = Array.from(new Set(pairs.map((p) => p.branchId).filter(Boolean)));
    if (productIds.length === 0 || branchIds.length === 0) return map;
    const rows = await strapi.db.query(STOCK_LEVEL_UID).findMany({
      where: { product: { id: { $in: productIds } }, branch: { id: { $in: branchIds } } },
      select: ['quantity_available', 'quantity_on_hand'],
      populate: { product: { select: ['id'] }, branch: { select: ['id'] } },
      limit: 100000,
    });
    for (const r of rows) {
      const key = `${r.product?.id}:${r.branch?.id}`;
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
   * @param {{ branchId?: number, branchDocId?: string }} opts
   */
  async getReorderSuggestions(opts = {}) {
    let branchId = opts.branchId || null;
    if (!branchId && opts.branchDocId) {
      const br = await strapi.db.query(BRANCH_UID).findOne({ where: { documentId: opts.branchDocId }, select: ['id'] });
      branchId = br?.id || null;
    }

    // 1) active policies (optionally scoped to a branch, incl. product-wide defaults)
    const policyWhere = { is_active: true };
    if (branchId) policyWhere.$or = [{ branch: { id: branchId } }, { branch: { id: { $null: true } } }];
    const policies = await strapi.db.query(POLICY_UID).findMany({
      where: policyWhere,
      populate: {
        product: { select: PROD_FIELDS },
        branch: { select: ['id', 'documentId', 'name'] },
        preferred_supplier: { select: ['id', 'documentId', 'name'] },
      },
      limit: 100000,
    });

    const targets = [];
    const policyProductIds = new Set();
    for (const pol of policies) {
      if (!pol.product?.id) continue;
      policyProductIds.add(pol.product.id);
      targets.push({ policy: pol, product: pol.product, branch: pol.branch || null });
    }

    // 2) legacy fallback: products with reorder_level>0 and NO policy row
    const excludeIds = policyProductIds.size ? Array.from(policyProductIds) : [0];
    const fallbackProducts = await strapi.db.query(PRODUCT_UID).findMany({
      where: { reorder_level: { $gt: 0 }, id: { $notIn: excludeIds } },
      select: PROD_FIELDS,
      limit: 100000,
    });
    for (const product of fallbackProducts) targets.push({ policy: null, product, branch: null });

    if (targets.length === 0) return [];

    // Dedupe by (product, branch) so duplicate active policies can't produce
    // duplicate suggestions (and downstream duplicate orders). First one wins.
    const seenTargets = new Set();
    const dedupedTargets = [];
    for (const t of targets) {
      const key = `${t.product.id}:${t.branch?.id || 'all'}`;
      if (seenTargets.has(key)) continue;
      seenTargets.add(key);
      dedupedTargets.push(t);
    }

    // 3) batch the expensive reads
    const onOrder = await this._onOrderByProduct(dedupedTargets.map((t) => t.product.id));
    const woOnOrder = await this._onOrderWOByProduct(dedupedTargets.map((t) => t.product.id));
    const serializedPairs = dedupedTargets.filter((t) => t.branch?.id && t.product.track_mode !== 'bulk')
      .map((t) => ({ productId: t.product.id, branchId: t.branch.id }));
    const bulkPairs = dedupedTargets.filter((t) => t.branch?.id && t.product.track_mode === 'bulk')
      .map((t) => ({ productId: t.product.id, branchId: t.branch.id }));
    const levels = await this._levelByProductBranch(serializedPairs);
    const bulkLevels = await this._bulkLevelByProductBranch(bulkPairs);

    // 4) compute per target
    const suggestions = [];
    for (const { policy, product, branch } of dedupedTargets) {
      // On-hand: serialized products read the per-branch stock-level cache;
      // bulk products read their Active-batch sum (the stock-level cache is built
      // only from serialized items, so a branch-scoped bulk policy would
      // otherwise read 0 forever and trigger perpetual false suggestions).
      let on_hand;
      if (branch?.id) {
        on_hand = product.track_mode === 'bulk'
          ? (bulkLevels.get(`${product.id}:${branch.id}`) || 0)
          : (levels.get(`${product.id}:${branch.id}`) || 0);
      } else {
        on_hand = this._productOnHand(product);
      }
      const on_order = (onOrder.get(product.id) || 0) + (woOnOrder.get(product.id) || 0);
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
        branch: branch?.documentId || null,
        branch_name: branch?.name || null,
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

  /**
   * One-click replenishment (Epic 4 P3): turn Purchase-source suggestions into
   * draft `purchase`(s) grouped by supplier, ready for the existing purchase
   * approval + receiving flow. Does NOT post GL (that happens at receiving/bill).
   *
   * @param {{ branchDocId?: string, suggestions?: Array, actorId?: number }} opts
   *   suggestions — reviewed rows (product docId, suggested_qty, unit_cost,
   *   preferred_supplier docId). Omitted → compute fresh and take all source=Purchase.
   * @returns {{ created: number, purchases: Array }}
   */
  /** Product docIds that already have an open REORDER-* draft purchase → Set. */
  async _productsWithOpenReorderPurchase(productDocIds) {
    const ids = [...new Set((productDocIds || []).filter(Boolean))];
    const set = new Set();
    if (ids.length === 0) return set;
    const rows = await strapi.db.query(PURCHASE_ITEM_UID).findMany({
      where: {
        product: { documentId: { $in: ids } },
        purchase: { status: { $in: OPEN_PURCHASE_STATUSES }, orderId: { $startsWith: 'REORDER-' } },
      },
      populate: { product: { select: ['documentId'] } },
      select: ['id'],
      limit: 100000,
    });
    for (const r of rows) if (r.product?.documentId) set.add(r.product.documentId);
    return set;
  },

  /** Product docIds that already have an open REORDER-WO-* work order → Set. */
  async _productsWithOpenReorderWO(productDocIds) {
    const ids = [...new Set((productDocIds || []).filter(Boolean))];
    const set = new Set();
    if (ids.length === 0) return set;
    const rows = await strapi.db.query(WO_UID).findMany({
      where: {
        product: { documentId: { $in: ids } },
        status: { $in: OPEN_WO_STATUSES },
        wo_number: { $startsWith: 'REORDER-WO-' },
      },
      populate: { product: { select: ['documentId'] } },
      select: ['id'],
      limit: 100000,
    });
    for (const r of rows) if (r.product?.documentId) set.add(r.product.documentId);
    return set;
  },

  async generatePurchases(opts = {}) {
    let suggestions = Array.isArray(opts.suggestions) && opts.suggestions.length
      ? opts.suggestions
      : (await this.getReorderSuggestions({ branchDocId: opts.branchDocId })).filter((s) => (s.source || 'Purchase') === 'Purchase');
    // keep only rows with a product and a positive qty
    suggestions = suggestions.filter((s) => s && s.product && num(s.suggested_qty) > 0);
    if (suggestions.length === 0) return { created: 0, purchases: [] };

    // Idempotency: skip products that already have an open REORDER-generated
    // draft purchase (guards a double-click / re-submit of the same suggestions).
    const already = await this._productsWithOpenReorderPurchase(suggestions.map((s) => s.product));
    const skipped = suggestions.filter((s) => already.has(s.product)).map((s) => s.product);
    suggestions = suggestions.filter((s) => !already.has(s.product));
    if (skipped.length) strapi.log.info(`[reorder] skipped ${skipped.length} product(s) with an existing open REORDER purchase`);
    if (suggestions.length === 0) return { created: 0, purchases: [], skipped };

    // Resolve preferred_supplier docIds → supplier rows.
    const prefDocIds = [...new Set(suggestions.map((s) => s.preferred_supplier).filter(Boolean))];
    const supByDoc = new Map();
    if (prefDocIds.length) {
      const sups = await strapi.db.query(SUPPLIER_UID).findMany({ where: { documentId: { $in: prefDocIds } }, select: ['id', 'documentId', 'name'] });
      for (const s of sups) supByDoc.set(s.documentId, s);
    }
    // For suggestions with no preferred supplier, fall back to the product's first linked supplier.
    const noPrefProducts = [...new Set(suggestions.filter((s) => !s.preferred_supplier).map((s) => s.product))];
    const supByProduct = new Map();
    if (noPrefProducts.length) {
      const prods = await strapi.db.query(PRODUCT_UID).findMany({
        where: { documentId: { $in: noPrefProducts } },
        select: ['id', 'documentId'],
        populate: { suppliers: { select: ['id', 'documentId', 'name'] } },
      });
      for (const p of prods) { const sup = (p.suppliers || [])[0]; if (sup) supByProduct.set(p.documentId, sup); }
    }

    // Group by supplier (documentId, or 'none' when unresolved).
    const groups = new Map();
    for (const s of suggestions) {
      const supplier = s.preferred_supplier ? supByDoc.get(s.preferred_supplier) : supByProduct.get(s.product);
      const key = supplier?.documentId || 'none';
      if (!groups.has(key)) groups.set(key, { supplier: supplier || null, lines: [] });
      groups.get(key).lines.push(s);
    }

    const batchStamp = opts.stamp || String(Date.now());
    const created = [];
    let seq = 0;
    for (const grp of groups.values()) {
      seq += 1;
      const total = grp.lines.reduce((t, l) => t + num(l.suggested_qty) * num(l.unit_cost), 0);
      const purchase = await strapi.documents(PURCHASE_UID).create({
        data: {
          orderId: `REORDER-${batchStamp}-${seq}`,
          status: 'Draft',
          approval_status: 'Draft',
          order_date: new Date(),
          total: Math.round(total * 100) / 100,
          ...(grp.supplier?.id ? { suppliers: [grp.supplier.id] } : {}),
          ...(opts.actorId ? { owners: [opts.actorId] } : {}),
        },
      });
      for (const l of grp.lines) {
        const qty = Math.round(num(l.suggested_qty));
        const unit = num(l.unit_cost);
        try {
          await strapi.documents(PURCHASE_ITEM_UID).create({
            data: {
              purchase: purchase.documentId,
              product: l.product,
              quantity: qty,
              unit_price: unit,
              total: Math.round(qty * unit * 100) / 100,
              status: 'Draft',
            },
          });
        } catch (err) {
          strapi.log.warn(`[reorder] purchase-item create failed (product=${l.product}): ${err.message}`);
        }
      }
      created.push({
        purchase: purchase.documentId,
        orderId: purchase.orderId,
        supplier: grp.supplier?.documentId || null,
        supplier_name: grp.supplier?.name || null,
        lines: grp.lines.length,
        total: Math.round(total * 100) / 100,
      });
    }

    strapi.log.info(`[reorder] generated ${created.length} draft purchase(s) from ${suggestions.length} suggestion(s)`);
    return { created: created.length, purchases: created };
  },

  /**
   * Manufacture replenishment (Epic 4 P4): turn source=Manufacture suggestions
   * into draft `mfg-work-order`(s) against each product's default active BOM
   * (is_default first, else any Active). One WO per product. The WO still runs
   * off its concrete BOM — this just seeds a Draft to review/release.
   *
   * @param {{ branchDocId?: string, suggestions?: Array, actorId?: number }} opts
   * @returns {{ created: number, work_orders: Array }}
   */
  async generateWorkOrders(opts = {}) {
    let suggestions = Array.isArray(opts.suggestions) && opts.suggestions.length
      ? opts.suggestions.filter((s) => s && s.source === 'Manufacture')
      : (await this.getReorderSuggestions({ branchDocId: opts.branchDocId })).filter((s) => s.source === 'Manufacture');
    suggestions = suggestions.filter((s) => s && s.product && num(s.suggested_qty) > 0);
    if (suggestions.length === 0) return { created: 0, work_orders: [] };

    // Idempotency: skip products that already have an open REORDER-WO draft.
    const already = await this._productsWithOpenReorderWO(suggestions.map((s) => s.product));
    const skipped = suggestions.filter((s) => already.has(s.product)).map((s) => s.product);
    suggestions = suggestions.filter((s) => !already.has(s.product));
    if (skipped.length) strapi.log.info(`[reorder] skipped ${skipped.length} product(s) with an existing open REORDER work-order`);
    if (suggestions.length === 0) return { created: 0, work_orders: [], skipped };

    const stamp = opts.stamp || String(Date.now());
    const created = [];
    let seq = 0;
    for (const s of suggestions) {
      const boms = await strapi.db.query(BOM_UID).findMany({
        where: { product: { documentId: s.product }, status: 'Active' },
        select: ['id', 'documentId', 'is_default'],
        orderBy: [{ is_default: 'desc' }, { id: 'asc' }],
        limit: 1,
      });
      const bom = boms[0];
      const qty = Math.max(1, Math.round(num(s.suggested_qty)));
      seq += 1;
      try {
        const wo = await strapi.documents(WO_UID).create({
          data: {
            wo_number: `REORDER-WO-${stamp}-${seq}`,
            product: s.product,
            ...(bom?.documentId ? { bom: bom.documentId } : {}),
            quantity_ordered: qty,
            status: 'Draft',
          },
        });
        created.push({ work_order: wo.documentId, wo_number: wo.wo_number, product: s.product, quantity: qty, bom: bom?.documentId || null });
      } catch (err) {
        strapi.log.warn(`[reorder] work-order create failed (product=${s.product}): ${err.message}`);
      }
    }

    strapi.log.info(`[reorder] generated ${created.length} draft work-order(s)`);
    return { created: created.length, work_orders: created };
  },
}));
