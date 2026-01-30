import SaleItem from './SaleItem';
import { calculateTax } from './pricing';

import { generateNextInvoiceNumber } from '../../lib/utils';

export default class SaleModel {
    constructor({
        id = null,
        documentId = null,
        invoice_no = generateNextInvoiceNumber(),
        sale_date = new Date(),
        payment_status = "Unpaid",

        customer = null,
        items = [],
        payments = [],

    }) {
        this.id = id;
        this.documentId = documentId;
        this.invoice_no = invoice_no;
        this.sale_date = Date.parse(sale_date) > new Date(1, 1, 2025).getTime() ? new Date(sale_date) : new Date();
        this.payment_status = payment_status || 'Unpaid';
        payments?.forEach(p => this.addPayment(p));
        this.customer = customer;
        this.items = items?.map(item => new SaleItem(item));
    }

    /* ===============================
       Hydration
    =============================== */

    static fromApi(sale) {
        const model = new SaleModel(sale);
        // keep both id and documentId for compatibility with API helpers
        return model;
    }

    addPayment({ payment_method = 'Cash', amount = 0, payment_date = new Date() }) {
        this.payments.push({ payment_date, payment_method, amount });

        const sum = this.payments.reduce((sum, p) => sum + p.amount, 0);
        if (sum >= this.total) {
            this.payment_status = 'Paid';
        }
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
            existing.items.push(stockItem);
            existing.setQuantity(existing.items.length);
            return;
        }

        // let name = stockItem.name ?? stockItem?.product?.name;

        this.items.push(new SaleItem({ stockItem }));
    }

    addNonStockItem({ name, price, costPrice = 0 }) {
        this.items.push(
            new SaleItem({
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
