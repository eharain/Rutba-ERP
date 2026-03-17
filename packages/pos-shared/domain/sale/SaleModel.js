import SaleItem from './SaleItem';
import { calculateTax } from './pricing';

import { generateNextInvoiceNumber, parseContactLine, parseStockLine } from '../../lib/utils';

/**
 * Resolve the product name for a sale-return-item.
 * Tries: direct product relation, then stock items' product, then stock item name.
 */
function resolveReturnItemProductName(ri) {
    if (ri.product?.name) return ri.product.name;
    const stockItems = ri.items;
    if (Array.isArray(stockItems) && stockItems.length > 0) {
        for (const si of stockItems) {
            if (si.product?.name) return si.product.name;
            if (si.name) return si.name;
        }
    }
    return 'N/A';
}

export default class SaleModel {
    constructor({
        id = null,
        documentId = null,
        invoice_no = null,
        sale_date = new Date(),
        payment_status = "Unpaid",
        status = "Draft",
        canceled_at = null,
        canceled_by = null,
        notes = "",

        customer,
        items = [],
        payments = [],

    }) {
        this.id = id;
        this.documentId = documentId;
        this.invoice_no = invoice_no || generateNextInvoiceNumber();
        this.sale_date = Date.parse(sale_date) > new Date(1, 1, 2025).getTime() ? new Date(sale_date) : new Date();
        this.payment_status = payment_status || 'Unpaid';
        this.status = status || 'Draft';
        this.canceled_at = canceled_at;
        this.canceled_by = canceled_by;
        this.notes = notes || '';
        this.payments = payments || [];
        //  payments?.forEach(p => this.addPayment(p));
        this.customer = customer;
        this.items = items?.map(item => new SaleItem(item)) || [];

        // Tracks sale items removed from the sale that need to be disconnected on save
        this._removedItems = [];

        // Exchange returns: items returned from previous sales applied as credit
        // Array of { sale, returnItems: [...], returnNo?, totalRefund? }
        this.exchangeReturns = [];

        // Sale returns: returns made FROM this sale (refund / exchange)
        // Array of { return_no, type, total_refund, exchange_sale?, items: [...] }
        this.saleReturns = [];

        // Cash register this sale was recorded against (populated from API)
        this.cashRegister = null;
    }

    /* ===============================
       Hydration
    =============================== */

    static fromApi(sale) {
        const model = new SaleModel(sale);

        // Preserve the cash register relation from the API
        if (sale.cash_register) {
            model.cashRegister = sale.cash_register;
        }

        // Hydrate exchange returns from API data if present
        if (sale._exchangeReturns?.length > 0) {
            for (const excReturn of sale._exchangeReturns) {
                const originalSale = excReturn.sale;
                const returnItems = (excReturn.items || []).map(ri => ({
                    productName: resolveReturnItemProductName(ri),
                    price: Number(ri.price || 0),
                    quantity: ri.quantity || 1,
                    total: Number(ri.total || ri.price || 0),
                }));
                if (originalSale && returnItems.length > 0) {
                    model.exchangeReturns.push({
                        sale: originalSale,
                        returnItems,
                        returnNo: excReturn.return_no,
                        totalRefund: Number(excReturn.total_refund || 0),
                    });
                }
            }
        }

        // Hydrate sale returns (returns FROM this sale) if present
        if (Array.isArray(sale.sale_returns) && sale.sale_returns.length > 0) {
            model.saleReturns = sale.sale_returns.map(sr => ({
                returnNo: sr.return_no,
                type: sr.type,
                totalRefund: Number(sr.total_refund || 0),
                returnDate: sr.return_date,
                exchangeSale: sr.exchange_sale || null,
                items: (sr.items || []).map(ri => ({
                    productName: resolveReturnItemProductName(ri),
                    price: Number(ri.price || 0),
                    quantity: ri.quantity || 1,
                    total: Number(ri.total || ri.price || 0),
                })),
            }));
        }

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

    get isCanceled() {
        return this.status === 'Cancelled';
    }

    get isEditable() {
        return !this.isPaid && !this.isCanceled;
    }


    get totalPaid() {
        const sum = this.payments.reduce((sum, p) => sum + p.amount, 0);
        return sum
    }
    removePayment(index) {
        this.payments.splice(index, 1);
    }

    /* ===============================
       Exchange Return (multiple sales)
    =============================== */

    setExchangeReturn(originalSale, returnItems) {
        const saleDocId = originalSale?.documentId || originalSale?.id;
        const idx = this.exchangeReturns.findIndex(er => {
            const id = er.sale?.documentId || er.sale?.id;
            return id && id === saleDocId;
        });
        if (idx >= 0) {
            this.exchangeReturns[idx] = { sale: originalSale, returnItems };
        } else {
            this.exchangeReturns.push({ sale: originalSale, returnItems });
        }
    }

    removeExchangeReturn(saleDocId) {
        this.exchangeReturns = this.exchangeReturns.filter(er => {
            const id = er.sale?.documentId || er.sale?.id;
            return id !== saleDocId;
        });
    }

    clearExchangeReturn() {
        this.exchangeReturns = [];
    }

    /** Backwards-compatible merged view for receipt rendering */
    get exchangeReturn() {
        if (!this.exchangeReturns.length) return null;
        if (this.exchangeReturns.length === 1) return this.exchangeReturns[0];
        const allReturnItems = this.exchangeReturns.flatMap(er => er.returnItems || []);
        const totalRefund = this.exchangeReturns.reduce((s, er) => s + Number(er.totalRefund || 0), 0);
        const invoiceNos = this.exchangeReturns.map(er => er.sale?.invoice_no).filter(Boolean);
        return {
            sale: { ...this.exchangeReturns[0].sale, invoice_no: invoiceNos.join(', ') },
            returnItems: allReturnItems,
            returnNo: this.exchangeReturns.map(er => er.returnNo).filter(Boolean).join(', ') || undefined,
            totalRefund: totalRefund || undefined,
        };
    }

    get exchangeReturnTotal() {
        if (!this.exchangeReturns.length) return 0;
        return this.exchangeReturns.reduce((total, er) => {
            if (er.totalRefund != null) return total + Number(er.totalRefund);
            return total + (er.returnItems || []).reduce((sum, r) => {
                if (r.total != null) return sum + Number(r.total);
                return sum + (r.refundPrice ?? r.price ?? 0);
            }, 0);
        }, 0);
    }

    /* ===============================
       Items
    =============================== */

    addStockItem(stockItem) {
        // Collect all stock-item documentIds already used in this sale
        const usedIds = new Set();
        for (const si of this.items) {
            if (!Array.isArray(si.items)) continue;
            for (const s of si.items) {
                if (s?.documentId) usedIds.add(s.documentId);
            }
        }

        // If the incoming stock item is already in the sale, swap it for the
        // next unused one from the `more` pool.  This is the core fix: the
        // search results always hand us the same "first" aggregated object,
        // so on repeated clicks we must skip it and pull from `more`.
        if (stockItem.documentId && usedIds.has(stockItem.documentId)) {
            const pool = stockItem.more;
            if (!Array.isArray(pool) || pool.length === 0) return; // nothing left to add
            const next = pool.find(s => !usedIds.has(s.documentId));
            if (!next) return; // all stock of this product already added
            pool.splice(pool.indexOf(next), 1);
            stockItem = next;
        }

        // Match by product id so that adding the same product groups into one
        // SaleItem row and pulls the next available stock item from `more`.
        const productId = stockItem.product?.id || stockItem.product?.documentId;

        const existing = productId
            ? this.items.find(i => {
                const firstProduct = i.first()?.product;
                return (firstProduct?.id === productId || firstProduct?.documentId === productId) &&
                    i.costPrice === (stockItem.cost_price || 0) &&
                    i.sellingPrice === stockItem.selling_price;
            })
            : null;

        if (existing) {
            existing.addStockItem(stockItem);
            existing.quantity = existing.items.length;
            return;
        }

        this.items.push(new SaleItem({
            price: stockItem.selling_price,
            stockItem
        }));
    }

    addNonStockItem(input) {
        if (!input) return;

        let { name, price, quantity, discount } = parseStockLine(input);

        let items = [];
        quantity = Math.min(quantity ?? 1, 5);
        discount = Math.min(Math.max(discount ?? 0, 0), 40);

        for (let i = 0; i < (quantity ?? 1); i++) {
            items.push(SaleItem.CreateDynamiStockItem(name, price));
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
        const removed = this.items.splice(index, 1);
        if (removed[0]?.documentId) {
            this._removedItems.push(removed[0]);
        }
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
        // Retry from storage if invoice number was not set at construction time
        if (!this.invoice_no) {
            this.invoice_no = generateNextInvoiceNumber();
        }
        return {
            invoice_no: this.invoice_no,
            sale_date: this.sale_date instanceof Date ? this.sale_date.toISOString() : this.sale_date,
            subtotal: this.subtotal,
            discount: this.discountTotal,
            tax: this.tax,
            total: this.total,
            payment_status: this.payment_status,
            notes: this.notes || '',
        };
    }
}
