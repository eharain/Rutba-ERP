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
        items = [],
    }) {
        this.id = id;
        this.documentId = documentId;
        this.quantity = quantity;
        this.items = items ?? [];

        this.price = price ?? 0;

        this.discount = discount ?? 0;


        if (stockItem) {
            this.items.push(stockItem);
        }

        /* ---------------- Discount / Offer state ---------------- */

        // saved discount before offer (for revert)
        this._discountBeforeOffer = null;

        console.log('SaleItem created:', this);
    }

    /* ---------------- Editable fields ---------------- */

    first() {
        if (this.items == null) {
            this.items = [];
        }
        if (this.items?.length > 0) {
            return this.items[0];
        }


        // this.items.push({ name: '', selling_price: 0, cost_price: 0, offer_price: 0 });

        return null;
    }


    get name() {
        return this.first()?.name || 'Unnamed Item';
    };

    set name(n) {
        this.first().name = n;
    }


    setName(name) {
        // if (!this.isStockItem) {
        this.name = name;
        // }
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

        return this.first()?.product != null;
    }

    get offerActive() {
        return this.price == this.offerPrice;
    }

    setSellingPrice(price) {
        price = ValidNumberOrDefault(price, 0);
        this.sellingPrice = price;

        if (!this.costPrice) {
            this.costPrice = price * 0.75;
        }
        if (this.offerPrice == null || this.offerPrice == 0) {
            this.offerPrice = price * 0.85;
        }

        const actualPrice = this.sellingPrice ?? price ?? 0;

        const discount = discountRateFromPrice(actualPrice, price);

        console.log('setSellingPrice:', { price, actualPrice, discount });

        this.setDiscountPercent(discount);
        //if (!this.isStockItem) {
        //    this.price = Math.max(0, price);

        //    // keep offer price aligned if offer not active
        //    if (!this.offerActive) {
        //        this.offerPrice = this.sellingPrice;
        //    }
        //}
    }

    //get unitNetPrice() {
    //    return applyDiscount({
    //        sellingPrice: this.sellingPrice,
    //        costPrice: this.costPrice,
    //        discount: this.discount
    //    });
    //}


    setDiscountPercent(percent) {
        this.discount = Math.min(Math.max(percent, 0), 100);
        return this.restPriceToDicount();
    }

    setQuantity(qty) {
        const netQty = Math.max(1, qty);
        const currentQty = this.quantity;

        if (!Array.isArray(this.items)) {
            this.items = [];
        }
        let stockItemWithMore = this.first();
        if (!stockItemWithMore?.more) {
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
                //else {
                //    // fallback: clone base item (should not normally happen)
                //    this.items.push({ ...first(), ...{ id: 0, documentId: null } });
                //}
            }
        }

        this.quantity = this.items.length;
    }




    /* ---------------- Offer logic (FIXED & SAFE) ---------------- */

    applyOfferPrice() {
        //if (this.offerActive) return;

        // remember existing discount
        this._discountBeforeOffer = this.discount;

        // offer price must never go below cost

        this.price = Math.max(this.offerPrice, this.costPrice);

        // derive discount from offer price
        this.discount = discountRateFromPrice(this.price, this.offerPrice);

        return this.restPriceToDicount();
    }

    revertOffer() {
        // if (!this.offerActive) return;

        // restore previous discount
        this.discount = this._discountBeforeOffer ?? this.discount;
        this._discountBeforeOffer = null;
        this.restPriceToDicount();


        // keep offerPrice as last known value (do NOT null it)
    }

    restPriceToDicount() {
        this.price = (this.sellingPrice - this.sellingPrice * this.discount);
        this.price = Math.min(Math.max(this.price, this.costPrice), this.sellingPrice);
        return this.price;
    }
    /* ---------------- Pricing ---------------- */



    get subtotal() {

        const dp = this.items.reduce((sum, item) => {
            let costPrice = ValidNumberOrDefault(item.cost_price, item.offer_price ?? (item.selling_price * .75));
            return sum + applyDiscount(item.selling_price, costPrice, this.discount ?? 0);
        }, 0)
        let total = ValidNumberOrDefault(dp, 0);
     //   console.log('SaleItem.subtotal:', { dp, total, itemCount: this.items.length, discount: this.discount, items: this.items });
        return total
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

            items: this.items
        };
    }
}
