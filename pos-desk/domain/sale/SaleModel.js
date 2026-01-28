import SaleItem from './SaleItem';
import { calculateTax } from './pricing';

export default class SaleModel {
    constructor({ customer = null } = {}) {
        this.customer = customer;
        this.items = [];
    }

    /* ---------------- Items ---------------- */

    addStockItem(stockItem) {
        const existing = this.items.find(
            i => i.id === stockItem.id
        );

        if (existing) {
            existing.setQuantity(existing.quantity + 1);
            return;
        }

        this.items.push(
            new SaleItem({
                id: stockItem.id,
                name: stockItem.product.name,
                sellingPrice: stockItem.selling_price,
                costPrice: stockItem.cost_price || 0,
                offerPrice: stockItem.offer_price || null,
                isStockItem: true
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
            const full = i.sellingPrice * i.quantity;
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
