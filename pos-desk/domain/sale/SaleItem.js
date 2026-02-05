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

    get averagePrice() {
        if (this.items?.length == 0) return 0;
        let sum = this.sumBy('selling_price');
        return sum / this.items.length;
    }
    get row_discount() {
        const dp = this.sumBy('selling_price');
        return dp * (this.discount_percentage / 100);
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
            price: this.averagePrice,
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
