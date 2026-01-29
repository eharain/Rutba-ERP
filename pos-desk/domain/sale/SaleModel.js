import SaleItem from './SaleItem';
import { calculateTax } from './pricing';

export default class SaleModel {
    constructor({ customer = null } = {}) {
        this.customer = customer;
        this.items = [];
    }

    /* ---------------- Items ---------------- */

    addStockItem(stockItem) {

        ///handle stock items array properly so that it dosent add a different priced item to existing one
        ///rather it adds as a new item. 

        const existing = this.items.find(
            i => {
                    i.id === stockItem.id&&
                    i.costPrice === (stockItem.cost_price || 0)&&
                    i.sellingPrice === stockItem.selling_price&&
                    i.offerPrice === (stockItem.offer_price || null)
                 }
        );

        if (existing) {
            existing.setQuantity(existing.quantity + 1);
            existing.stockItems.push(stockItem);
            return;
        }

        this.items.push(
            new SaleItem({
                id: stockItem.id,
                documentId: stockItem.documentId,
                name: stockItem.product.name,
                sellingPrice: stockItem.selling_price,
                costPrice: stockItem.cost_price || 0,
                offerPrice: stockItem.offer_price || null,
                isStockItem: true,
                stockItem:stockItem
            })
        );
    }

    addNonStockItem({ name, price, costPrice = 0 }) {
        this.items.push(
            new SaleItem({
                name,
                sellingPrice: price,
                costPrice,
                isStockItem: false
            })
        );
    }

    updateItem(index, updater) {
        const item = this.items[index];
        if (!item) return;
        updater(item);
    }

    removeItem(index) {
        this.items.splice(index, 1);
    }

    /* ---------------- Totals ---------------- */

    get subtotal() {
        return this.items.reduce((sum, i) => sum + i.subtotal, 0);
    }

    get tax() {
        return calculateTax(this.subtotal);
    }

    get total() {
        return this.subtotal + this.tax;
    }

    get discountTotal() {
        return this.items.reduce((sum, i) => {
            //const full =Math.max(i.sellingPrice * i.quantity,i.costPrice);
            const full =i.sellingPrice * i.quantity;

            return sum + (full - i.subtotal);
        }, 0);
    }

    /* ---------------- Serialization ---------------- */

    toPayload() {
        return {
            customer: this.customer
                ? { connect: [this.customer.documentId] }
                : null,
            subtotal: this.subtotal,
            discount: this.discountTotal,
            tax: this.tax,
            total: this.total,
            items: this.items.map(i => i.toJSON())
        };
    }
}
