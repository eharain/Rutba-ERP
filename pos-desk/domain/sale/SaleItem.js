import { applyDiscount, discountFromOffer, calculateTax } from './pricing';

export default class SaleItem {
    constructor({
        id = null,
        documentId = null,
        // name,
        quantity = 1,
        discount = 0,
        price = 0,
        stockItem = null,
        items = [],
    }) {
        this.id = id;
        this.documentId = documentId;

        this.quantity = quantity;
        this.items = items ?? [];

        if (stockItem) {
            this.items.push(stockItem);
        }
        /* ---------------- Discount / Offer state ---------------- */

        this.price = price;

        this.discount = discount;
        //this.offerPrice ? discountFromOffer(sellingPrice, offerPrice) : 0;


        // saved discount before offer (for revert)
        this._discountBeforeOffer = null;
    }

    /* ---------------- Editable fields ---------------- */

    first() {
        if (this.items?.length > 0) {
            return this.items[0];
        }
        if (this.items == null) {
            this.items = [];
        }
        this.items.push({ name: '', selling_price: 0, cost_price: 0, offer_price: 0 });

        return this.items[0];
    }


    get name() {
        return this.first()?.name || 'Unnamed Item';
    };

    set name(n) {
        this.first().name = n;
    }


    setName(name) {
        if (!this.isStockItem) {
            this.name = name;
        }
    }

    get sellingPrice() {
        return this.first()?.selling_price || 0;
    }
    set sellingPrice(price) {
        return this.first().selling_price = price;
    }

    get costPrice() {
        return this.first()?.cost_price || 0;
    }
    set costPrice(price) {
        return this.first().cost_price = price;
    }

    get offerPrice() {
        return this.first()?.offer_price || this.price;
    }
    set offerPrice(price) {
        return this.first().offer_price = price;
    }

    get isStockItem() {
        return this.first().product == null;
    }

    get offerActive() {
        return this.price == this.offerPrice;
    }
    setSellingPrice(price) {
        if (!this.isStockItem) {
            this.sellingPrice = Math.max(0, price);

            // keep offer price aligned if offer not active
            if (!this.offerActive) {
                this.offerPrice = this.sellingPrice;
            }
        }
    }

    setQuantity(qty) {
        const netQty = Math.max(1, qty);
        const currentQty = this.quantity;

        if (!Array.isArray(this.items)) {
            this.items = [];
        }

        if (!first()?.more) {
            first().more = [];
        }

        const pool = first().more;

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
                //else {
                //    // fallback: clone base item (should not normally happen)
                //    this.items.push({ ...first(), ...{ id: 0, documentId: null } });
                //}
            }
        }

        this.quantity = this.items.length + 1;
    }


    setDiscountPercent(percent) {
        this.discount = Math.max(0, percent);


        this.price = this.sellingPrice - this.sellingPrice * this.discount;

        this.price = Math.min(Math.max(this.price, this.costPrice), this.sellingPrice);

        return this.price;
    }

    /* ---------------- Offer logic (FIXED & SAFE) ---------------- */

    applyOfferPrice(offerPrice) {
        if (this.offerActive) return;

        // remember existing discount
        this._discountBeforeOffer = this.discount;

        // offer price must never go below cost
        //this.price = Math.max(offerPrice, this.costPrice);

        // derive discount from offer price
        this.discount = discountFromOffer(
            this.sellingPrice,
            this.offerPrice
        );

        this.price = this.sellingPrice - this.sellingPrice * this.discount;

        this.price = Math.min(Math.max(this.price, this.costPrice), this.sellingPrice);

        return this.price;
    }

    revertOffer() {
       // if (!this.offerActive) return;

        // restore previous discount
        this.discount = this._discountBeforeOffer ?? this.discount;
        this._discountBeforeOffer = null;


        this.price = this.sellingPrice - this.sellingPrice * this.discount;
        this.price = Math.min(Math.max(this.price, this.costPrice),this.sellingPrice);
        return this.price;
        // keep offerPrice as last known value (do NOT null it)
    }

    /* ---------------- Pricing ---------------- */

    get unitNetPrice() {
        return applyDiscount({
            sellingPrice: this.sellingPrice,
            costPrice: this.costPrice,
            discount: this.discount
        });
    }

    get subtotal() {
        return this.price * this.quantity;
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
            quantity: this.quantity,
            price: this.price,
            discount: this.discount,

            subtotal: this.subtotal,
            tax: this.tax,

            total: this.total,

            selling_price: this.sellingPrice,
            cost_price: this.costPrice,

            offer_price: this.offerPrice,
            offer_active: this.offerActive,

            is_stock_item: this.isStockItem,
            items: this.items
        };
    }
}
