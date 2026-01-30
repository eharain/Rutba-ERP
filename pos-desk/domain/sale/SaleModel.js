import SaleItem from './SaleItem';
import { calculateTax } from './pricing';

export default class SaleModel {
    constructor({ customer = null, id = null, payments } = {}) {
        this.id = id;
        this.customer = customer;
        this.items = [];
        this.payments = [];
    }

    /* ===============================
       Hydration
    =============================== */

    static fromApi(sale) {
        const model = new SaleModel({
            id: sale.documentId,
            customer: sale.customer || null,
            payments: sale.payments || []
        });

        sale.items?.forEach(item => {
            item.items.forEach(stockItem => {
                model.addStockItem(stockItem);
            }
        });

        return model;
    }

    addPayment({ payment_method = 'Cash', amount = 0, payment_date = new Date() }) {
        this.payments.push({ payment_date, payment_method, amount });
    }
    removePayment(index) {
        this.payments.splice(index, 1);
    }
    /* ===============================
       Items
    =============================== */

    addStockItem(stockItem) {
        const existing = this.items.find(i =>
            i.id === stockItem.id &&
            i.costPrice === (stockItem.cost_price || 0) &&
            i.sellingPrice === stockItem.selling_price &&
            i.offerPrice === (stockItem.offer_price || null)
        );

        if (existing) {
            existing.stockItems.push(stockItem);
            existing.setQuantity(existing.stockItems.length);
            return;
        }

        let name = stockItem.name ?? stockItem?.product?.name;

        this.items.push(
            new SaleItem({
                id: stockItem.id,
                documentId: stockItem.documentId,
                name,
                sellingPrice: stockItem.selling_price,
                costPrice: stockItem.cost_price || 0,
                offerPrice: stockItem.offer_price || null,
                isStockItem: true,
                stockItem
            })
        );
    }

    addNonStockItem({ name, price, costPrice = 0 }) {
        this.items.push(
            new SaleItem({
                name,
                sellingPrice: price,
                costPrice,
                isStockItem: false,
                stockItem: { name, selling_price: price, cost_price: price * 0.75, offer_price: price * 0.85 }
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

    /* ===============================
       Totals
    =============================== */

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

    /* ===============================
       Serialization
    =============================== */

    toPayload() {
        return {
            customer: this.customer ? { connect: [this.customer.documentId] } : null,
            payments: { connect: this.payments.map(p => p.documentId) },//.map(p => ({ payment_date:p.payment_date, payment_method: p.payment_method, amount: p.amount })),
            subtotal: this.subtotal,
            discount: this.discountTotal,
            tax: this.tax,
            total: this.total,
            items: this.items.map(i => i.toJSON())
        };
    }
}
