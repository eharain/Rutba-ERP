import { applyDiscount, discountRateFromPrice, calculateTax, ValidNumberOrDefault } from './pricing';

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

        return first?.name || first?.product.name || 'Unnamed Item';
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
        return this.sellingPrice || this._price || this.unitPrice || 0;
    }

    get isDynamicStock() {
        return this.first()?.product != null;
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

        const item = {
            name, selling_price: price,
            get cost_price() {
                item.selling_price * 0.75
            },
            get offer_price() {
                item.selling_price * 0.85
            },
            more: []
        }
        return item;
    }


    setQuantity(qty) {
        const netQty = Math.max(1, qty);
        if (qty < 1) {
            return
        }
        const currentQty = this.quantity;

        if (!Array.isArray(this.items)) {
            this.items = [];
        }

        let stockItemWithMore = this.first();
        if (!stockItemWithMore) {
            this.items.push({ selling_price: 0, cost_price: 0, offer_price: 0, more: [] });
        }
        if (!Array.isArray(stockItemWithMore?.more)) {
            stockItemWithMore.more = [];
        }

        const pool = stockItemWithMore.more;

        // REMOVE
        if (netQty < currentQty) {
            const removeCount = currentQty - netQty;

            for (let i = 0; i < removeCount && this.items.length > 1; i++) {
                const removed = this.items.pop();
                if (removed) pool.push(removed);
            }
        }

        // ADD
        else if (netQty > currentQty) {
            const addCount = netQty - currentQty;

            for (let i = 0; i < addCount; i++) {
                if (pool.length > 0) {
                    this.items.push(pool.shift());
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
        const sp = this.sumBy('selling_price');
        const cp = this.sumBy('cost_price');

        const discount = sp * (this.discount_percentage / 100);
        const maxDiscount = sp - cp;

        return Math.max(0, Math.min(discount, maxDiscount));
    }
        
    get subtotal() {
        if (this.items?.length == 0) return 0;
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
