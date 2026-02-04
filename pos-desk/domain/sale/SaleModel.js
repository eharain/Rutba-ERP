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

        customer ,
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

    parseAndSetCustomer(line){
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
        if (sum >= this.total && this.payments?.length>0) {
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
