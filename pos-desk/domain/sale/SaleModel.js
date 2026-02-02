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
        this.payments = payments || [];
        //  payments?.forEach(p => this.addPayment(p));
        this.customer = customer;
        this.items = items?.map(item => new SaleItem(item)) || [];
    }

    /* ===============================
       Hydration
    =============================== */

    static fromApi(sale) {
        const model = new SaleModel(sale);
        // keep both id and documentId for compatibility with API helpers
        return model;
    }

    setCustomer(customer) {
        this.customer = customer;
    }
    addPayment(payment) {
        if (!payment) return;

        payment = Object.assign({}, { payment_method: 'Cash', amount: 0, payment_date: new Date(),/* cash_received, change, due*/ }, payment)

        this.payments.push(payment);

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
            i.documentId === stockItem.documentId &&
            i.costPrice === (stockItem.cost_price || 0) &&
            i.sellingPrice === stockItem.selling_price &&
            i.offerPrice === (stockItem.offer_price || null)
        );

        if (existing) {
            existing.addStockItem(stockItem);

            //   existing.setQuantity(existing.items.length);
            return;
        }

        // let name = stockItem.name ?? stockItem?.product?.name;

        this.items.push(new SaleItem({
            price: stockItem.selling_price,
            stockItem
        }));
    }

    addNonStockItem(input) {
        if (!input) return;
        const { name, price, quantity, discount } = this.parseLine(input);
        this.items.push(
            new SaleItem(
                {
                    discount,
                    quantity,
                    price,
                    stockItem: { name, selling_price: price, cost_price: price * 0.75, offer_price: price * 0.85 }
                }
            )
        );
    }

    parseLine(input) {
        const match = input.trim().match(
            /^(?<name>[a-zA-Z\s]+)(?:\s+(?<price>\d+(?:\.\d+)?))?(?:\s+(?<qty>\d+))?(?:\s+(?<discount>\d+)%?)?$/
        );

        if (!match) return null;

        const { name, price, qty, discount } = match.groups;

        return {
            name: name.trim(),
            price: price ? Number(price) : 0,
            quantity: qty ? Number(qty) : 0,
            discount: discount ? Number(discount) : 0
        };
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
        return this.items.reduce((sum, i) => {
            const full = i.tax;
            return sum + full;
        }, 0);
    }

    get total() {
        return this.subtotal + this.tax;
    }

    get discountTotal() {
        return this.items.reduce((sum, i) => {
            const full = i.sellingPrice - i.discount;
            return sum + full;
        }, 0);
    }

    /* ===============================
       Serialization
    =============================== */

    toPayload() {
        return {
            subtotal: this.subtotal,
            discount: this.discountTotal,
            tax: this.tax,
            total: this.total,
            payment_status: this.payment_status,
        };
    }
}
