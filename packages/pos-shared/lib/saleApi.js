import { authApi } from './api';
import { fetchSaleByIdOrInvoice, searchStockItems } from './pos';
import SaleModel from '../domain/sale/SaleModel';
import { getCashRegister, prepareForPut } from "../lib/utils";

export default class SaleApi {

    /* =====================================================
       STOCK SEARCH
    ===================================================== */

    static async searchStockItemsByNameOrBarcode(text) {
        const res = await searchStockItems(text, 0, 300, 'InStock');

        // Aggregate by product
        return SaleApi.aggregateByProduct(res?.data || []);
    }

    /* ---------------- Aggregate stock items by product ---------------- */

    static aggregateByProduct(list = []) {
        const map = new Map();

        const addByKey = (key, value) => {
            if (!map.has(key)) {
                map.set(key, { ...value, more: [] });
            } else {
                map.get(key).more.push(value);
            }
        };

        for (const stockItem of list) {
            const product = stockItem.product;

            if (!product) {
                addByKey(stockItem.name || `null-name-${stockItem.id}`, stockItem);
            } else if (product.id > 0) {
                addByKey(product.id, stockItem);
            } else {
                addByKey(`${stockItem.id}-stock-id`, stockItem);
            }
        }

        return Array.from(map.values());
    }

    /* =====================================================
       LOAD
    ===================================================== */

    static async loadSale(idOrInvoice) {
        const sale = await fetchSaleByIdOrInvoice(idOrInvoice);
        return SaleModel.fromApi(sale);
    }

    /* =====================================================
       SALE SAVE (CREATE / UPDATE)
    ===================================================== */

    static async saveSale(saleModel, { paid = false } = {}) {

        const payload = {
            ...saleModel.toPayload(),
            ...(paid ? { payment_status: 'Paid' } : {})
        };

        const payloadNoItems = { ...payload };

        let documentId = saleModel.documentId ?? saleModel.id;
        //const isNew = !existingId || existingId === 'new' || existingId === 'undefined';

        let saleResponse;

        // CREATE
        if (!documentId) {
            const res = await authApi.post('/sales', { data: payloadNoItems });
            const created = res?.data ?? res;

            saleModel.id = created.id;
            saleModel.documentId = created.documentId;
            documentId = created.documentId
            saleResponse = created;
        }
        // UPDATE
        else {
            const res = await authApi.put(`/sales/${documentId}`, { data: payloadNoItems });
            saleResponse = res?.data ?? res;
            documentId = saleResponse.documentId
        }

        // CUSTOMER + PAYMENTS
        await this.saveCustomer(documentId, saleModel.customer);
        await this.savePayments(documentId, saleModel.payments);

        // SALE ITEMS + STOCK
        await this.saveSaleItems(documentId, saleModel.items, { paid });

        return saleResponse;
    }

    /* =====================================================
       CUSTOMER
    ===================================================== */

    static removeNullAttributes(obj = {}) {
        if (!obj || typeof obj !== 'object') return {};
        return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v != null));
    }

    static async saveCustomer(saleId, customer) {
        const nullConnect = { customer: [] };
        if (!customer) return nullConnect;

        let { documentId, name, email, phone } = customer;

        const isEmpty =
            // !documentId &&
            !name?.trim() &&
            !email?.trim() &&
            !phone?.trim();

        if (isEmpty) return nullConnect;

        const data = this.removeNullAttributes({ name, email, phone });

        if (!documentId) {
            const res = await authApi.post('/customers', {
                data: {
                    ...data,
                    ...saleId ? { sales: { connect: [saleId] } } : {}
                }
            });
            const created = res?.data ?? res;
            customer.documentId = created.documentId;
            customer.id = created.id;
        }
        else {
            await authApi.put(`/customers/${documentId}`, {
                data: {
                    ...data,
                    ...saleId ? { sales: { connect: [saleId] } } : {}
                }
            });
        }

        return customer.documentId
            ? { customer: { connect: [customer.documentId] } }
            : nullConnect;
    }

    /* =====================================================
       PAYMENTS
    ===================================================== */

    static async savePayments(saleId, payments = []) {
        if (!Array.isArray(payments) || payments.length === 0) {
            return { payments: [] };
        }

        const connectIds = [];
        const activeRegister = getCashRegister();
        const activeRegisterId = activeRegister?.documentId ?? activeRegister?.id;

        for (const p of payments) {
            if (!p.documentId) {
                const res = await authApi.post('/payments', {
                    data: {
                        ...p,
                        ...saleId ? { sale: { connect: [saleId] } } : {},
                        ...(activeRegisterId ? { cash_register: { connect: [activeRegisterId] } } : {})
                    }
                });
                const created = res?.data ?? res;
                p.documentId = created.documentId ?? created.id;
            } else {
                await authApi.put(`/payments/${p.documentId}`, {
                    data: {
                        ...prepareForPut(p),
                        ...saleId ? { sale: { connect: [saleId] } } : {},
                        ...(activeRegisterId ? { cash_register: { connect: [activeRegisterId] } } : {})
                    }
                });
            }
            connectIds.push(p.documentId);
        }

        return { payments: { connect: connectIds } };
    }

    /* =====================================================
       SALE ITEMS + STOCK
    ===================================================== */

    static async saveSaleItems(saleId, saleItems, { paid = false } = {}) {
        const results = [];

        for (const item of saleItems) {

            const baseStockItem = item.items?.[0] ?? null;

            const saleItemPayload = {
                ...item.toPayload(),
                sale: { connect: [saleId] }
            };

            if (baseStockItem?.product?.documentId) {
                saleItemPayload.product = {
                    connect: [baseStockItem.product.documentId]
                };
            }

            let saleItemId;

            if (item.documentId) {
                const res = await authApi.put(`/sale-items/${item.documentId}`, { data: saleItemPayload });
                saleItemId = item.documentId;
                results.push(res?.data ?? res);
            } else {
                const res = await authApi.post('/sale-items', { data: saleItemPayload });
                const created = res?.data ?? res;
                item.documentId = created.documentId;
                saleItemId = created.documentId;
                results.push(created);
            }

            // STOCK ITEMS
            if (!Array.isArray(item.items)) continue;

            for (const stockItem of item.items) {
                if (!stockItem) continue;
                const status = paid ? { status: 'Sold' } : {}
                const stockPayload = {
                    ...status,
                    sale_item: { connect: [saleItemId] }
                };

                if (stockItem.product?.documentId || stockItem.product?.id) {
                    stockPayload.product = {
                        connect: [stockItem.product.documentId || stockItem.product.id]
                    };
                }



                if (stockItem.documentId) {
                    await authApi.put(
                        `/stock-items/${stockItem.documentId}`,
                        { data: stockPayload }
                    );
                } else {
                    const res = await authApi.post('/stock-items', {
                        data: {
                            ...prepareForPut(stockItem),
                            ...stockPayload
                        }
                    });
                    const created = res?.data ?? res;
                    stockItem.documentId = created.documentId ?? created.id;
                }
            }
        }

        return results;
    }

    /* =====================================================
       CHECKOUT
    ===================================================== */

    static async checkout(saleModel) {
        return this.saveSale(saleModel, { paid: true });
    }
}
