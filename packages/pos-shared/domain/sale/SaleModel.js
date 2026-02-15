import SaleItem from './SaleItem';
import { calculateTax } from './pricing';

import { generateNextInvoiceNumber, parseContactLine, parseStockLine } from '../../lib/utils';

export default class SaleModel {
    constructor({
        id = null,
        documentId = null,
        invoice_no = generateNextInvoiceNumber(),
        sale_date = new Date(),
        payment_status = "Unpaid",

        customer,
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

        // Exchange return: items returned from a previous sale applied as credit
        this.exchangeReturn = null; // { sale, returnItems: [...] }
    }

    /* ===============================
       Hydration
    =============================== */

    static fromApi(sale) {
        const model = new SaleModel(sale);
        // keep both id and documentId for compatibility with API helpers
        return model;
    }

    parseAndSetCustomer(line) {
        if (!line) return this.customer;

        if (typeof line === 'string') {
            const parsed = parseContactLine(line);
            this.setCustomer(parsed);
        } else if (typeof line === 'object') {
            this.setCustomer(line);
        }

        return this.customer;
    }
    setCustomer(customer) {
        this.customer = customer ? Object.assign({}, customer) : null;

    }
    addPayment(payment) {
        if (!payment) return;

        payment = Object.assign({}, { payment_method: 'Cash', amount: 0, payment_date: new Date(),/* cash_received, change, due*/ }, payment)

        this.payments.push(payment);
        this.updatePaymentStatus()
    }

    updatePaymentStatus() {
        const sum = this.totalPaid;
        if (sum >= this.total && this.payments?.length > 0) {
            this.payment_status = 'Paid';
        }
    }
    get isPaid() {
        this.updatePaymentStatus()
        return this.payment_status == 'Paid'
    }


    get totalPaid() {
        const sum = this.payments.reduce((sum, p) => sum + p.amount, 0);
        return sum
    }
    removePayment(index) {
        this.payments.splice(index, 1);
    }

    /* ===============================
       Exchange Return
    =============================== */

    setExchangeReturn(originalSale, returnItems) {
        this.exchangeReturn = { sale: originalSale, returnItems };
    }

    clearExchangeReturn() {
        this.exchangeReturn = null;
    }

    get exchangeReturnTotal() {
        if (!this.exchangeReturn?.returnItems?.length) return 0;
        return this.exchangeReturn.returnItems.reduce((sum, r) => sum + (r.price || 0), 0);
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

        const { name, price, quantity, discount } = parseStockLine(input);

        let items = [];
        for (let i = 0; i < (quantity ?? 1); i++) {
            items.push({ name, selling_price: price, cost_price: price * 0.75, offer_price: price * 0.85, more: [...items] });
        }

        this.items.push(new SaleItem({ discount_percentage: discount, quantity, price, items }));
    }





    updateItem(index, updater) {
        const item = this.items[index];
        if (!item) return;
        updater(item);
        // replace items array reference so React components receiving `items` detect changes
        this.items = [...this.items];
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
        return this.items.reduce((sum, i) => {
            const full = i.total;
            return sum + full;
        }, 0);
    }

    get discountTotal() {
        return this.items.reduce((sum, i) => {
            const full = i.row_discount;
            return sum + full;
        }, 0);
    }

    /* ===============================
       Serialization
    =============================== */

    toPayload() {
        return {
            invoice_no: this.invoice_no,
            sale_date: this.sale_date instanceof Date ? this.sale_date.toISOString() : this.sale_date,
            subtotal: this.subtotal,
            discount: this.discountTotal,
            tax: this.tax,
            total: this.total,
            payment_status: this.payment_status,
        };
    }
}
