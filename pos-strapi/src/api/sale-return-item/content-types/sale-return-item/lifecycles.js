'use strict';

/**
 * sale-return-item lifecycle — the missing "stock reset on return" path.
 *
 * Returning a sale-return-item links stock-item rows via the manyToMany
 * `items` relation. Without this hook those stock-items kept their `Sold`
 * status forever, so the product's InStock count never recovered after a
 * refund. We flip each linked stock-item back to status='InStock'; the
 * stock-item lifecycle then refreshes `product.stock_quantity`.
 *
 * Damaged-return semantics (status='ReturnedDamaged') are deferred until a
 * per-line "restockable" flag exists — the default Return flow treats every
 * returned unit as resellable.
 *
 * DIVISIBLE items are deliberately NOT whole-roll-flipped here: a roll sold in
 * portions (units_sold > 0) still holds remaining sub-units, so flipping its
 * status Sold→InStock without decrementing units_sold would leave it counted in
 * stock_quantity (+1) but with zero sellable remaining — permanent cache drift.
 * Divisible returns restore sub-units via stock-item.releaseSellableUnits against
 * the sale-item's recorded allocations (the order-management return path); the
 * POS divisible-return wiring is a follow-up.
 */

const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const RETURN_ITEM_UID = 'api::sale-return-item.sale-return-item';

async function restockLinkedItems(event) {
  const itemId = event.result?.id || event.params?.where?.id;
  if (!itemId) return;

  const row = await strapi.db.query(RETURN_ITEM_UID).findOne({
    where: { id: itemId },
    populate: { items: { select: ['id', 'status', 'sellable_units', 'units_sold'] } },
  });

  const linked = Array.isArray(row?.items) ? row.items : [];
  for (const stockItem of linked) {
    if (stockItem.status === 'InStock') continue;
    // Divisible roll: never whole-flip — that corrupts the sellable cache.
    const isDivisible = (Number(stockItem.sellable_units) || 1) > 1;
    if (isDivisible) {
      strapi.log.warn(
        `[sale-return-item] skipping whole-roll restock of divisible stock-item=${stockItem.id} ` +
        `(sellable_units=${stockItem.sellable_units}, units_sold=${stockItem.units_sold}); ` +
        `divisible returns must go through releaseSellableUnits`
      );
      continue;
    }
    try {
      await strapi.entityService.update(
        STOCK_ITEM_UID,
        stockItem.id,
        { data: { status: 'InStock' } }
      );
      // The stock-item lifecycle picks up the status change and recomputes
      // the parent product's stock_quantity — nothing else to do here.
    } catch (err) {
      strapi.log.warn(
        `[sale-return-item] restock failed for stock-item=${stockItem.id}: ${err.message}`
      );
    }
  }
}

module.exports = {
  async afterCreate(event) {
    await restockLinkedItems(event);
  },
  async afterUpdate(event) {
    await restockLinkedItems(event);
  },
};
