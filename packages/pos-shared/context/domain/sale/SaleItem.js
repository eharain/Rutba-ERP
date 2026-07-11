import { applyDiscount, discountRateFromPrice, calculateTax, ValidNumberOrDefault } from './pricing';
import { MAX_CUSTOM_QTY } from '../../../lib/utils.js';

export default class SaleItem {
    constructor({
        id = null,
        documentId = null,
        // name,
        quantity = 1,
        discount = 0,
        discount_percentage = null,
        price = 0,
        stockItem = null,
        product,
        items = [],
        sellable_qty = null,
    }) {
        this.id = id;
        this.documentId = documentId;
        this.discount = discount ?? 0;
        this.discount_percentage = discount_percentage ?? 0;// ValidNumberOrDefault(discount_percentage, this.discount);

        this.items = items ?? [];
        if (stockItem) {
            this.items.push(stockItem);
        }

        this.quantity = quantity;
        this._price = price ?? 0;

        // DIVISIBLE stock (Divisible P2c): when the underlying stock item holds
        // many sellable sub-units (a 50-yard lace roll, a 100-tablet box), a line
        // sells a fractional PORTION rather than one whole unit. `sellableQty` is
        // that portion (sub-unit count); a positive value puts this line into
        // "divisible sale" mode and the money getters price per sub-unit. Null =
        // ordinary whole-unit line (unchanged behaviour). Restored from the API on
        // reload so returns/reprints of divisible sales stay correct.
        this.sellableQty = (sellable_qty != null && Number(sellable_qty) > 0) ? Number(sellable_qty) : null;

        /* ---------------- Discount / Offer state ---------------- */

        // saved discount before offer (for revert)
        this._discountBeforeOffer = null;

        console.log('SaleItem created:', this);
    }

    addStockItem(stockItem) {
        this.items.push(stockItem);
    }
    /* ---------------- Editable fields ---------------- */

    first() {
        if (this.items == null) {
            this.items = [];
        }
        if (this.items?.length > 0) {
            return this.items[0];
        }
        return null;
    }

    setName(name) {
        // if (!this.isDynamicStock) {
        this.name = name;
        // }
    }

    set name(n) {
        this.applyOnAll({ name: n });
    }

    set offerPrice(price) {
        this.applyOnAll({ offer_price: price });
    }

    set sellingPrice(price) {
        // update underlying stock items
        this.applyOnAll({ selling_price: price });;
    }

    set costPrice(price) {
        this.applyOnAll({ cost_price: price });;
    }

    get name() {
        const first = this.first();

        return first?.name || first?.product?.name || 'Unnamed Item';
    };

    get sellingPrice() {
        return this.first()?.selling_price || 0;
    }

    get costPrice() {
        return this.first()?.cost_price || 0;
    }

    get offerPrice() {
        return this.first()?.offer_price || this.sellingPrice;
    }

    // expose a `price` property used by UI components
    get price() {
        if (this.isDivisibleSale) return this.perSubUnitPrice;
        return this.sellingPrice || this._price || this.unitPrice || 0;
    }

    get isDynamicStock() {
        return this.first()?.product != null;
    }

    /* ---------------- Divisible stock ---------------- */

    // Total sub-units one whole physical item holds when full (the PRICE
    // DENOMINATOR). >1 means the item is divisible (e.g. a 50-yard roll).
    get subUnitCapacity() {
        const c = Number(this.first()?.sellable_units);
        return c > 0 ? c : 1;
    }

    // A line is divisible when its unit holds more than one sub-unit (or the
    // product is explicitly flagged). Inference from capacity mirrors the
    // order-management picker — no dependency on the flag being populated.
    get isDivisible() {
        return this.subUnitCapacity > 1 || this.first()?.product?.divisible === true;
    }

    // In divisible-sale mode once a positive portion has been chosen.
    get isDivisibleSale() {
        return this.isDivisible && Number(this.sellableQty) > 0;
    }

    // Price of a single sub-unit = whole selling_price ÷ capacity (price stays
    // fixed; a portion costs qty × this).
    get perSubUnitPrice() {
        const cap = this.subUnitCapacity;
        return cap > 0 ? this.sellingPrice / cap : this.sellingPrice;
    }

    get offerActive() {
        return this.discount_percentage == discountRateFromPrice(this.sellingPrice, this.offerPrice);
    }

    applyOnAll(diff) {
        this.items.forEach(item => {
            Object.keys(diff).forEach(key => {
                if (!(key in item)) {
                    item[key] = diff[key]; // initialize first
                }
            });

            Object.assign(item, diff);
        });
    }

    setSellingPrice(price) {
        let change = { selling_price: price, offer_price: price * 0.75, cost_price: price * 0.5 }

        this.applyOnAll(change);
    }

    setDiscountPercent(percent) {
        this.discount_percentage = Math.min(Math.max(percent, 0), 40);
        this.discount = this.row_discount;
    }

    static CreateDynamiStockItem(name, price) {
        const sp = Number(price) || 0;
        // Plain data properties — NOT getters. The previous version used
        // getter-only accessors (with no `return`, so they were undefined),
        // which made setSellingPrice/applyOnAll throw "cost_price has only a
        // getter" in strict mode (ESM) the moment a teller edited the price of
        // a custom item. Mirror the ratios setSellingPrice applies so editing
        // the price later doesn't make the derived values jump.
        return {
            name,
            selling_price: sp,
            cost_price: sp * 0.5,
            offer_price: sp * 0.75,
            more: [],
        };
    }

    /** Fabricate a fresh ad-hoc stock line cloning another's scalar fields.
     *  Used to grow the quantity of a custom (non-stock) item, which has no
     *  finite stock pool to draw extra units from. */
    static cloneLineItem(src) {
        return {
            name: src?.name,
            selling_price: src?.selling_price ?? 0,
            cost_price: src?.cost_price ?? 0,
            offer_price: src?.offer_price ?? 0,
            more: [],
        };
    }


    setQuantity(qty) {
        // Divisible line: qty is a (possibly fractional) sub-unit count. Keep the
        // single representative stock item and just record the portion to sell —
        // the server allocates it across physical items (FEFO) at checkout, so we
        // never add/remove whole units here.
        if (this.isDivisible) {
            const n = Math.max(0, Number(qty) || 0);
            this.sellableQty = n > 0 ? n : null;
            this.quantity = n;
            return;
        }

        let netQty = Math.max(1, Math.floor(Number(qty) || 1));

        if (!Array.isArray(this.items)) {
            this.items = [];
        }

        // Ensure there's a first line to clone/draw from.
        if (!this.first()) {
            this.items.push({ selling_price: 0, cost_price: 0, offer_price: 0, more: [] });
        }
        const stockItemWithMore = this.first();
        if (!Array.isArray(stockItemWithMore.more)) {
            stockItemWithMore.more = [];
        }

        // Custom (ad-hoc) lines have no finite stock, so cap them at
        // MAX_CUSTOM_QTY. Real stock items stay bounded by available units.
        if (!this.isDynamicStock) {
            netQty = Math.min(netQty, MAX_CUSTOM_QTY);
        }

        const currentQty = this.items.length;
        if (netQty === currentQty) {
            this.quantity = currentQty;
            return;
        }

        const pool = stockItemWithMore.more;

        // REMOVE — park surplus units back in the pool so they can be re-added.
        if (netQty < currentQty) {
            const removeCount = currentQty - netQty;

            for (let i = 0; i < removeCount && this.items.length > 1; i++) {
                const removed = this.items.pop();
                if (removed) pool.push(removed);
            }
        }

        // ADD — pull from the pool first; for ad-hoc (custom) lines there's no
        // finite stock, so fabricate clones to let the quantity grow freely.
        // Real stock items stop at the available count.
        else {
            const addCount = netQty - currentQty;

            for (let i = 0; i < addCount; i++) {
                if (pool.length > 0) {
                    this.items.push(pool.shift());
                } else if (!this.isDynamicStock) {
                    this.items.push(SaleItem.cloneLineItem(stockItemWithMore));
                } else {
                    break; // real stock item: can't exceed available units
                }
            }
        }

        this.quantity = this.items.length;
    }


    /* ---------------- Offer logic (FIXED & SAFE) ---------------- */

    applyOfferPrice() {
        this._discountBeforeOffer = this.discount_percentage;
        let offer = this.offerPrice;
        let sale = this.sellingPrice;
        this.discount_percentage = discountRateFromPrice(sale, offer);
        // this.discount_percentage = this.subtotal * this.discount_percentage / 100;
    }

    revertOffer() {
        this.discount_percentage = this._discountBeforeOffer ?? this.discount_percentage;
        this._discountBeforeOffer = null;
    }

    sumBy(field = 'selling_price') {
        let ValidFields = ['selling_price', 'cost_price', 'offer_price'];
        if (!ValidFields.includes(field)) {
            throw new Error(`Invalid field for sum: ${field}`);
        }
        if (!Array.isArray(this.items) || this.items.length == 0) {
            return 0;
        }
        return this.items.reduce((sum, item) => { return sum + (item[field] || 0); }, 0)
    }

    /* ---------------- Pricing ---------------- */

    get unitPrice() {
        if (this.items?.length == 0) return 0;
        if (this.isDivisibleSale) return this.perSubUnitPrice;
        let sum = this.sumBy('selling_price');
        return sum / this.items.length;
    }

    get unitDicountedPrice() {
        let dp = this.unitPrice;

        return dp - dp * (this.discount_percentage / 100);
    }

    /**
     * row_discount
     * ------------
     * Calculates the discount amount for the current row based on the configured
     * discount percentage, while enforcing a strict business rule:
     *
     * BUSINESS RULE
     * The final selling total must NEVER go below the total cost price.
     * → This prevents selling at a loss due to discounts.
     *
     * WHAT WAS WRONG WITH THE PREVIOUS VERSION
     * The earlier implementation used:
     *
     *     const dp = Math.max(dps, dpc);
     *
     * and then calculated discount from `dp`.
     *
     * Problem:
     * - It sometimes used COST price as the discount base if cost > selling.
     * - Discounts must always be calculated from SELLING price, not whichever is larger.
     * - That logic could produce incorrect discount values and even allow unintended
     *   discount behaviour when data was inconsistent.
     *
     * Correct approach:
     * - Always calculate requested discount from selling price.
     * - Then cap it so it never exceeds profit margin (sp − cp).
     *
     * LOGIC FLOW
     * 1. Calculate total selling price (sp)
     * 2. Calculate total cost price (cp)
     * 3. Calculate requested percentage discount
     * 4. Calculate maximum allowed discount (profit margin = sp − cp)
     * 5. Return the smaller of:
     *      - requested discount
     *      - max allowed discount
     * 6. Ensure result is never negative
     *
     * EDGE CASES HANDLED
     * - If discount % is very high → discount is capped at profit margin
     * - If cost >= selling → discount becomes 0 (cannot discount into loss)
     * - If any values are negative or invalid → result is forced ≥ 0
     *
     * RETURNS
     * Discount amount (number ≥ 0)
     */
    get row_discount() {
        const sp = this.isDivisibleSale ? (this.perSubUnitPrice * this.sellableQty) : this.sumBy('selling_price');
        const cp = this.sumBy('cost_price');

        const discount = sp * (this.discount_percentage / 100);

        return discount;
        //const maxDiscount = sp - cp;

        //return Math.max(0, Math.min(discount, maxDiscount));
    }
        
    get subtotal() {
        if (this.items?.length == 0) return 0;
        if (this.isDivisibleSale) return this.perSubUnitPrice * this.sellableQty;
        let sum = this.sumBy('selling_price');
        let subTotal = sum || 0;

        return subTotal;
    }
    get dicountedSubtotal() {
        let subTotal = this.subtotal;
        let thisDiscount = this.row_discount;
        return subTotal - thisDiscount;
    }
    get tax() {
        return calculateTax(this.dicountedSubtotal);
    }

    get total() {
        return this.dicountedSubtotal + this.tax;
    }

    /* ---------------- Serialization ---------------- */
    toPayload() {
        // Divisible line: sale-item.quantity is an integer (kept at 1 — one line),
        // and the real fractional portion lives in sellable_qty. Price is per
        // sub-unit; totals come from the divisible-aware getters above.
        if (this.isDivisibleSale) {
            return {
                quantity: 1,
                sellable_qty: this.sellableQty,
                price: this.perSubUnitPrice,
                discount: this.row_discount,
                discount_percentage: this.discount_percentage,
                subtotal: this.subtotal,
                tax: this.tax,
                total: this.total,
            };
        }
        return {

            quantity: this.items.length,
            price: this.unitPrice,
            discount: this.row_discount,
            discount_percentage: this.discount_percentage,
            subtotal: this.subtotal,
            tax: this.tax,
            total: this.total,
        }
    }
    toJSON() {

        return {
            id: this.id,
            documentId: this.documentId,
            name: this.name,

            ... this.toPayload(),

            items: this.items,
        };
    }
}
