import { authApi } from './api';
import { fetchSaleByIdOrInvoice, searchStockItems } from './pos';
import SaleModel from '../domain/sale/SaleModel';
import { getCashRegister, getBranch, getBranchDesk, getUser, prepareForPut } from "../lib/utils";

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

        let saleResponse;

        // CREATE
        if (!documentId || documentId === 'new') {
            const activeRegister = getCashRegister();
            const activeRegisterId = activeRegister?.documentId ?? activeRegister?.id;
            const createPayload = {
                ...payloadNoItems,
                ...(activeRegisterId ? { cash_register: { connect: [activeRegisterId] } } : {}),
            };
            const res = await authApi.post('/sales', { data: createPayload });
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

        // EXCHANGE RETURN (create sale-return + update stock items)
        // Save whenever return items exist and haven't been persisted yet (no returnNo).
        // Once saved, the return stays linked regardless of payment status.
        if (saleModel.exchangeReturn?.returnItems?.length > 0 && !saleModel.exchangeReturn.returnNo) {
            await this.saveExchangeReturn(documentId, saleModel.exchangeReturn);
        }

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
       EXCHANGE RETURN
    ===================================================== */

    static async saveExchangeReturn(newSaleDocId, exchangeReturn) {
        const { sale: originalSale, returnItems } = exchangeReturn;
        if (!returnItems?.length) return;

        // Already persisted — nothing to do
        if (exchangeReturn.returnNo) return;

        const originalSaleDocId = originalSale.documentId || originalSale.id;
        if (!originalSaleDocId) throw new Error('Exchange return: original sale has no documentId');

        const returnNo = 'EXC-' + Date.now().toString(36).toUpperCase();
        const returnTotal = returnItems.reduce((sum, r) => sum + (r.refundPrice ?? r.price ?? 0), 0);
        const activeRegister = getCashRegister();
        const registerDocId = activeRegister?.documentId || activeRegister?.id;
        const user = getUser();
        const desk = getBranchDesk();
        const branch = getBranch();
        const branchDocId = branch?.documentId || branch?.id;
        const userId = user?.documentId ?? user?.id;

        // 1) Create sale-return header linked to the original sale
        //    NOTE: `branches` on sale-return is mappedBy (inverse side) —
        //    Strapi v5 rejects connect on the inverse side, so we link
        //    from the owning side (branch) in step 1b.
        const retRes = await authApi.post('/sale-returns', {
            data: {
                return_no: returnNo,
                return_date: new Date().toISOString(),
                total_refund: returnTotal,
                type: 'Exchange',
                refund_method: 'Exchange Return',
                refund_status: 'Credited',
                desk_id: desk?.id ?? null,
                desk_name: desk?.name || '',
                returned_by: user?.username || user?.email || '',
                sale: { connect: [originalSaleDocId] },
                ...(registerDocId ? { cash_register: { connect: [registerDocId] } } : {}),
            }
        });
        const saleReturn = retRes?.data ?? retRes;
        const saleReturnDocId = saleReturn.documentId || saleReturn.id;

        // 1b) Link exchange_sale and branch from the owning side via PUT
        if (saleReturnDocId) {
            const updates = {};
            if (newSaleDocId) updates.exchange_sale = { connect: [newSaleDocId] };
            if (Object.keys(updates).length > 0) {
                await authApi.put(`/sale-returns/${saleReturnDocId}`, { data: updates });
            }
            if (branchDocId) {
                await authApi.put(`/branches/${branchDocId}`, {
                    data: { sale_returns: { connect: [saleReturnDocId] } }
                });
            }
        }

        // 2) Group return items by original sale-item
        const bySaleItem = {};
        for (const ri of returnItems) {
            if (!bySaleItem[ri.saleItemDocId]) bySaleItem[ri.saleItemDocId] = [];
            bySaleItem[ri.saleItemDocId].push(ri);
        }

        // 3) Create sale-return-items and update stock item statuses
        for (const [saleItemDocId, items] of Object.entries(bySaleItem)) {
            const quantity = items.length;
            const price = items[0].refundPrice ?? items[0].price;
            const total = items.reduce((s, i) => s + (i.refundPrice ?? i.price), 0);
            const productDocId = items[0].productDocId;

            const returnItemRes = await authApi.post('/sale-return-items', {
                data: {
                    quantity,
                    price,
                    total,
                    sale_return: { connect: [saleReturnDocId] },
                    ...(productDocId ? { product: { connect: [productDocId] } } : {})
                }
            });
            const returnItem = returnItemRes?.data ?? returnItemRes;
            const returnItemDocId = returnItem.documentId || returnItem.id;

            for (const ri of items) {
                await authApi.put(`/stock-items/${ri.stockItemDocId}`, {
                    data: {
                        status: ri.status,
                        ...(returnItemDocId ? { sale_return_item: { connect: [returnItemDocId] } } : {})
                    }
                });
            }
        }

        // 4) Create payout payment linked to the return, original sale, and cash register
        await authApi.post('/payments', {
            data: {
                payment_method: 'Exchange Return',
                amount: -returnTotal,
                payment_date: new Date().toISOString(),
                transaction_no: returnNo,
                sale: { connect: [originalSaleDocId] },
                sale_return: { connect: [saleReturnDocId] },
                ...(registerDocId ? { cash_register: { connect: [registerDocId] } } : {}),
            }
        });

        // 5) Record refund transaction on the active cash register
        if (registerDocId) {
            await authApi.post('/cash-register-transactions', {
                data: {
                    type: 'Refund',
                    amount: returnTotal,
                    description: `Exchange ${returnNo} — credit applied to new sale`,
                    transaction_date: new Date().toISOString(),
                    performed_by: user?.email || user?.username || '',
                    cash_register: { connect: [registerDocId] },
                }
            });
        }

        // 6) Mark the exchange return as persisted so subsequent saves skip it
        exchangeReturn.returnNo = returnNo;
        exchangeReturn.totalRefund = returnTotal;
    }

    /* =====================================================
       CHECKOUT
    ===================================================== */

    static async checkout(saleModel) {
        return this.saveSale(saleModel, { paid: true });
    }
}
