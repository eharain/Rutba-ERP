import { applyDiscount, discountFromOffer, calculateTax } from './pricing';

export default class SaleItem {
    constructor({
        id = null,
        documentId = null,
        name,
        quantity = 1,
        sellingPrice,
        costPrice = 0,
        offerPrice = null,
        isStockItem = true
    }) {
        this.id = id;
        this.documentId = documentId;
        this.name = name;
        this.quantity = quantity;
        this.sellingPrice = sellingPrice;
        this.costPrice = costPrice;
        this.isStockItem = isStockItem;

        /* ---------------- Discount / Offer state ---------------- */

        // active discount percent (cashier-visible)
        this.discountPercent = offerPrice
            ? discountFromOffer(sellingPrice, offerPrice)
            : 0;

        // offer bookkeeping (NON-DESTRUCTIVE)
        this.offerPrice = offerPrice ?? sellingPrice;
        this.offerActive = !!offerPrice;

        // saved discount before offer (for revert)
        this._discountBeforeOffer = null;
    }

    /* ---------------- Editable fields ---------------- */

    setName(name) {
        if (!this.isStockItem) {
            this.name = name;
        }
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
        this.quantity = Math.max(1, qty);
    }

    setDiscountPercent(percent) {
        this.discountPercent = Math.max(0, percent);
    }

    /* ---------------- Offer logic (FIXED & SAFE) ---------------- */

    applyOfferPrice(offerPrice) {
        if (this.offerActive) return;

        // remember existing discount
        this._discountBeforeOffer = this.discountPercent;

        // offer price must never go below cost
        this.offerPrice = Math.max(offerPrice, this.costPrice);

        // derive discount from offer price
        this.discountPercent = discountFromOffer(
            this.sellingPrice,
            this.offerPrice
        );

        this.offerActive = true;
    }

    revertOffer() {
        if (!this.offerActive) return;

        // restore previous discount
        this.discountPercent =
            this._discountBeforeOffer ?? this.discountPercent;

        this.offerActive = false;
        this._discountBeforeOffer = null;

        // keep offerPrice as last known value (do NOT null it)
    }

    /* ---------------- Pricing ---------------- */

    get unitNetPrice() {
        return applyDiscount({
            sellingPrice: this.sellingPrice,
            costPrice: this.costPrice,
            discountPercent: this.discountPercent
        });
    }

    get subtotal() {
        return this.unitNetPrice * this.quantity;
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
            selling_price: this.sellingPrice,
            cost_price: this.costPrice,
            discount: this.discountPercent,
            offer_price: this.offerPrice,
            offer_active: this.offerActive,
            subtotal: this.subtotal,
            tax: this.tax,
            total: this.total,
            is_stock_item: this.isStockItem
        };
    }
}
