import { applyDiscount, discountRateFromPrice, calculateTax, ValidNumberOrDefault } from './pricing';

export default class SaleItem {
    constructor({
        id = null,
        documentId = null,
        // name,
        quantity = 1,
        discount = 0,
        price = 0,
        stockItem = null,
        product,
        items = [],
    }) {
        this.id = id;
        this.documentId = documentId;
        this.discount = discount ?? 0;

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
        return this.first()?.name || 'Unnamed Item';
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
        return this.sellingPrice || this._price || this.averagePrice || 0;
    }

    get isDynamicStock() {
        return this.first()?.product != null;
    }

    get offerActive() {
        return this.discount == discountRateFromPrice(this.sellingPrice, this.offerPrice);
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

   //     console.log("before change ", price, change, JSON.stringify(this.first()))
        this.applyOnAll(change);
     //   console.log("after change ", price, change, JSON.stringify(this.first()));
    }

    setDiscountPercent(percent) {
        this.discount = Math.min(Math.max(percent, 0), 40);

        //return this.restPriceToDicount();
    }

    setQuantity(qty) {
        const netQty = Math.max(1, qty);
        const currentQty = this.quantity;

        if (!Array.isArray(this.items)) {
            this.items = [];
        }
        let stockItemWithMore = this.first();
        if (!Array.isArray(stockItemWithMore?.more)) {
            stockItemWithMore.more = [];
        }

        const pool = stockItemWithMore.more;

        // REMOVE
        if (netQty < currentQty) {
            const removeCount = currentQty - netQty;

            for (let i = 0; i < removeCount; i++) {
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
        this._discountBeforeOffer = this.discount;
        let offer = this.offerPrice;
        let sale = this.sellingPrice;
        this.discount = discountRateFromPrice(sale, offer);
    }

    revertOffer() {
        this.discount = this._discountBeforeOffer ?? this.discount ?? 0;
        this._discountBeforeOffer = null;
    }


    /* ---------------- Pricing ---------------- */

    get averagePrice() {
        if (this.items?.length ?? 0 == 0) return 0;
        let sum = this.items.reduce((sum, i) => sum + i.selling_price, 0)
        return sum / this.items.length
    }

    getSubtotal() {
        // If items array length matches quantity, sum per-item (used for tracked stock items).
        if (Array.isArray(this.items) && this.items.length === this.quantity && this.items.length > 0) {
            const dp = this.items.reduce((sum, item) => {
                let costPrice = ValidNumberOrDefault(item.cost_price, item.offer_price ?? (item.selling_price * .75));
                return sum + applyDiscount(item.selling_price, costPrice, this.discount ?? 0);
            }, 0)
            return ValidNumberOrDefault(dp, 0);
        }

        // Fallback: treat first item as representative unit and multiply by quantity (for non-dynamic or aggregated items)
        const firstItem = this.first();
        if (!firstItem) return 0;

        const unitCostPrice = ValidNumberOrDefault(firstItem.cost_price, firstItem.offer_price ?? (firstItem.selling_price * .75));
        const unitPrice = applyDiscount(firstItem.selling_price, unitCostPrice, this.discount ?? 0);
        return ValidNumberOrDefault(unitPrice * (this.quantity || 1), 0);
    }

    get subtotal() {
        let subTotal = this.getSubtotal();
        return subTotal;//- subTotal * this.discount / 100;
    }
    get tax() {
        return calculateTax(this.subtotal);
    }

    get total() {
        return this.subtotal + this.tax;
    }

    /* ---------------- Serialization ---------------- */

    toJSON() {
        return {
            id: this.id,
            documentId: this.documentId,
            name: this.name,
            quantity: this.items.length,
            price: this.averagePrice,
            discount: this.discount,
            subtotal: this.subtotal,
            tax: this.tax,
            total: this.total,
            items: this.items,
            //  product: this.product ?? this.first()?.product
        };
    }
}
