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
        this.offerPrice = offerPrice;
        this.isStockItem = isStockItem;
        
        this.discountPercent = offerPrice
            ? discountFromOffer(sellingPrice, offerPrice)
            : 0;
    }


    setName(name) {
        if (!this.isStockItem) {
            this.name = name;
        }
    }

    setSellingPrice(price) {
        if (!this.isStockItem) {
            this.sellingPrice = Math.max(0, price);
        }
    }


    setQuantity(qty) {
        this.quantity = Math.max(1, qty);
    }

    setDiscountPercent(percent) {
        this.discountPercent = Math.max(0, percent);
    }

    applyOfferPrice(offerPrice) {
        this.offerPrice = offerPrice;
        this.discountPercent = discountFromOffer(
            this.sellingPrice,
            offerPrice
        );
    }

    clearOffer() {
        this.offerPrice = null;
        this.discountPercent = 0;
    }

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
            subtotal: this.subtotal,
            tax: this.tax,
            total: this.total,
            is_stock_item: this.isStockItem
        };
    }
}
