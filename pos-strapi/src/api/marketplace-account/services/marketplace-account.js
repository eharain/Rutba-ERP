'use strict';

// Marketplace data-side service. After the engine moved into the rutba-marketplace
// app, Strapi's only marketplace responsibility is the ORDER-WRITE contract:
// mapping a normalized marketplace order (sent by the app's worker) into a
// sale-order — kept here, server-side, next to the order state machine + stock
// side effects + person dedup it relies on. No adapters, OAuth, scheduling, or
// outbound calls live here anymore.

const { createCoreService } = require('@strapi/strapi').factories;

const ACCOUNT_UID = 'api::marketplace-account.marketplace-account';
const ORDER_UID = 'api::sale-order.sale-order';
const PRODUCT_UID = 'api::product.product';
const ADDRESS_UID = 'api::address.address';

// Ordered SKU candidates for one normalized line item, best first. Every adapter
// puts its best candidate in `sku`; the Daraz adapter additionally carries the
// seller / shop / Daraz-own variants, because only the SELLER's sku can match a
// product here. Ordering IS the safety property: we take the first exact hit, so
// a high-confidence field can never be beaten by a low-confidence one.
const SKU_FIELDS = ['sku', 'sellerSku', 'shopSku', 'externalSku', 'barcode'];

function skuCandidates(it) {
  const out = [];
  const seen = new Set();
  for (const f of SKU_FIELDS) {
    const v = it && it[f];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Resolve a line item's SKU candidates to a product — EXACT matches only.
 *
 * Deliberately not fuzzy: this attaches a product to a real customer's order, and
 * a near-miss would ship the wrong thing rather than raise a flag. A miss is
 * meant to surface (see needs_attention below), not to be guessed away.
 *
 * `sku` is tried across every candidate before `barcode`, because sku is the
 * identity field and barcode only a secondary index — a sku hit on the second
 * candidate still beats a barcode hit on the first. One query per field, not per
 * candidate. Comparison back onto the candidate order is case-insensitive: the
 * database already decided these rows match, so re-deciding it here in a
 * different collation would drop a hit Postgres/MySQL just handed us.
 */
async function matchProduct(strapi, candidates) {
  if (!candidates.length) return null;
  for (const field of ['sku', 'barcode']) {
    const rows = await strapi.db.query(PRODUCT_UID).findMany({
      where: { [field]: { $in: candidates } },
      select: ['id', 'documentId', 'name', 'sku', 'barcode'],
    });
    if (!rows.length) continue;
    const byValue = new Map();
    for (const r of rows) {
      const k = String(r[field] ?? '').trim().toLowerCase();
      if (k && !byValue.has(k)) byValue.set(k, r);
    }
    for (const c of candidates) {
      const hit = byValue.get(c.toLowerCase());
      if (hit) return { product: hit, matchedOn: field, matchedValue: c };
    }
  }
  return null;
}

module.exports = createCoreService(ACCOUNT_UID, ({ strapi }) => ({
  /**
   * Create (or reconcile) the sale-order for one normalized marketplace order.
   * Items are supplied by the caller (the app already pulled them from the
   * marketplace). Idempotent on (channel, external_order_id).
   * Returns { action: 'created' | 'updated' | 'skipped', documentId?, ... }. A
   * 'created' result also reports needs_attention + the unmatched SKUs when any
   * line item resolved to no product, so the caller can tell a clean create from
   * one that landed with dangling line items.
   */
  async ingestOne(account, order) {
    const channel = account.platform;
    const externalOrderId = String(order.externalOrderId);

    // Idempotency guard — match on (channel, external_order_id).
    const existing = await strapi.db.query(ORDER_UID).findOne({
      where: { channel, external_order_id: externalOrderId },
      select: ['id', 'documentId', 'order_status'],
    });

    if (existing) {
      // Best-effort cancel-sync: release a still-open order the marketplace
      // cancelled, so stock side effects (Reserved → InStock) fire via the
      // state machine. Other transitions stay in-house (phase 1).
      const TERMINAL = ['CANCELLED', 'RETURNED', 'REFUND_INITIATED', 'REFUNDED'];
      if (/cancel/i.test(String(order.status || '')) && !TERMINAL.includes(existing.order_status)) {
        try {
          const stateMachine = require('../../sale-order/services/sale-order-state-machine');
          await stateMachine.executeTransition(existing.documentId, 'CANCELLED', {
            rider_notes: `Cancelled on ${channel} (marketplace sync)`,
          });
          return { action: 'updated', documentId: existing.documentId, reason: 'cancelled' };
        } catch (e) {
          strapi.log.warn(`[marketplace] cancel-sync ${externalOrderId} failed: ${e.message}`);
        }
      }
      return { action: 'skipped', documentId: existing.documentId };
    }

    // Build line items, resolving each SKU to a product (variants are their own
    // product rows with their own sku, so a variant SellerSku resolves directly).
    const items = Array.isArray(order.items) ? order.items : [];
    const unmatchedSkus = [];
    // Counted separately from unmatchedSkus: a line that carries NO sku at all is
    // just as unmatched, and has no string to record — it must still raise the flag.
    let unmatchedCount = 0;
    const lineItems = [];
    let computedSubtotal = 0;
    for (const it of items) {
      const qty = Math.max(1, Math.trunc(Number(it.quantity) || 1));
      const unitPrice = Number(it.unitPrice);
      const lineTotal = it.total !== undefined && it.total !== null
        ? Number(it.total)
        : (Number.isFinite(unitPrice) ? unitPrice * qty : 0);
      const price = Number.isFinite(unitPrice) ? unitPrice : (qty ? lineTotal / qty : 0);
      computedSubtotal += Number.isFinite(lineTotal) ? lineTotal : 0;

      const candidates = skuCandidates(it);
      const match = await matchProduct(strapi, candidates);
      const product = match ? match.product : null;
      if (!product) {
        unmatchedCount += 1;
        if (candidates.length) unmatchedSkus.push(candidates[0]);
      }

      lineItems.push({
        ...(product ? { product: { documentId: product.documentId } } : {}),
        quantity: qty,
        price: Number.isFinite(price) ? price : 0,
        total: Number.isFinite(lineTotal) ? lineTotal : 0,
        product_name: it.name || product?.name || (candidates.length ? `SKU ${candidates[0]}` : 'Item'),
        variant: it.variant ? String(it.variant) : undefined,
      });
    }

    // Buyer → provisional person (the dedup job reconciles later).
    const buyerName = order.buyer?.name || order.shipping?.name || 'Marketplace Buyer';
    const buyerPhone = order.buyer?.phone || order.shipping?.phone;
    const person = await strapi.service('api::person.person').createProvisional({
      name: buyerName,
      email: order.buyer?.email,
      phone: buyerPhone,
    });

    let deliveryAddress = null;
    const ship = order.shipping || {};
    if (ship.line1) {
      deliveryAddress = await strapi.documents(ADDRESS_UID).create({
        data: {
          line1: ship.line1,
          line2: ship.line2,
          city: ship.city,
          state: ship.state,
          country: ship.country,
          zip_code: ship.zip_code,
          person: { id: person.id },
        },
      });
    }

    const deliverySnapshot = {
      name: buyerName,
      email: order.buyer?.email,
      phone: buyerPhone,
      line1: ship.line1,
      line2: ship.line2,
      city: ship.city,
      state: ship.state,
      country: ship.country,
      zip_code: ship.zip_code,
      channel,
      external_order_id: externalOrderId,
    };

    const isCod = /cod|cash/i.test(String(order.paymentMethod || ''));
    const subtotal = Number.isFinite(Number(order.totals?.itemsTotal))
      ? Number(order.totals.itemsTotal)
      : computedSubtotal;
    const shippingFee = Number(order.totals?.shippingFee) || 0;
    const total = Number.isFinite(Number(order.totals?.total))
      ? Number(order.totals.total)
      : subtotal + shippingFee;

    // order_id is a uid — sanitize the (provider-supplied) external ref so an
    // exotic order number can't fail uid validation and drop the whole order.
    const extRef = String(order.externalOrderNumber || externalOrderId).replace(/[^A-Za-z0-9_-]/g, '')
      || String(externalOrderId).replace(/[^A-Za-z0-9_-]/g, '')
      || String(externalOrderId);

    let created;
    try {
      created = await strapi.documents(ORDER_UID).create({
        data: {
          order_id: `${channel.toUpperCase()}-${extRef}`,
          order_secret: (Math.floor(Math.random() * 900000) + 100000).toString(),
          channel,
          external_order_id: externalOrderId,
          external_order_number: order.externalOrderNumber || null,
          external_vendor_id: account.seller_id || null,
          marketplace_account: account.documentId,
          products: { items: lineItems },
          customer_person: { id: person.id },
          delivery_address: deliveryAddress ? { id: deliveryAddress.id } : undefined,
          delivery_snapshot: deliverySnapshot,
          subtotal,
          shipping_price: shippingFee,
          delivery_cost: shippingFee,
          total,
          payment_method: isCod ? 'cod' : 'online_gateway',
          payment_status: order.paid ? 'PAID' : 'Ordered',
          order_status: 'PAYMENT_CONFIRMED',
          channel_meta: {
            order: order.raw || null,
            items: items.map((i) => i.raw).filter(Boolean),
            unmatched_skus: unmatchedSkus,
            unmatched_items: unmatchedCount,
            payment_method_raw: order.paymentMethod || null,
            currency: order.currency || null,
          },
        },
      });
    } catch (e) {
      // order_id is a unique uid, so a parallel run (cron vs manual trigger)
      // that already ingested this order makes our create throw — the read-then-
      // create dedupe above can't see an in-flight insert. Treat as skipped.
      const dup = await strapi.db.query(ORDER_UID).findOne({
        where: { channel, external_order_id: externalOrderId },
        select: ['documentId'],
      });
      if (dup) return { action: 'skipped', documentId: dup.documentId, reason: 'duplicate' };
      throw e;
    }

    // The order is still created — dropping a real customer order because our
    // catalog is missing a SKU would be the worse failure, and channel_meta keeps
    // the record. But it must not read as a clean success either: the result
    // carries needs_attention so the sync log can count it and the marketplace UI
    // can show it. An order where NOTHING matched used to be indistinguishable
    // from a perfect one outside of a log line.
    if (unmatchedCount) {
      const shown = unmatchedSkus.length ? unmatchedSkus.join(', ') : '(line items carry no SKU)';
      strapi.log.warn(`[marketplace] order ${externalOrderId}: ${unmatchedCount}/${items.length} line item(s) matched no product: ${shown}`);
    }
    return {
      action: 'created',
      documentId: created.documentId,
      items: items.length,
      matched_items: items.length - unmatchedCount,
      unmatched_items: unmatchedCount,
      unmatched_skus: unmatchedSkus,
      needs_attention: unmatchedCount > 0,
    };
  },
}));
