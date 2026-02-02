import { authApi } from './api';
import { fetchSaleByIdOrInvoice, searchStockItems } from './pos';
import SaleModel from '../domain/sale/SaleModel';
import { discountRateFromPrice } from '../domain/sale/pricing';

export default class SaleApi {

    static async searchStockItemsByNameOrBarcode(text) {

        const res = await searchStockItems(text, 0, 300, 'InStock');

        // 🔥 FIX: aggregate by product
        const aggregated = SaleApi.aggregateByProduct(res.data || []);
        return aggregated;
    }



    /* ---------------- Aggregate stock items by product ---------------- */
    static aggregateByProduct = (list = []) => {
        const map = new Map();
        const addByKey = (key, value) => {
            if (!map.has(key)) {
                map.set(key, { ...value, more: [] });
                return;
            }
            map.get(key).more.push(value);
        }
        for (const stockItem of list) {
            const product = stockItem.product;
            if (!product) {
                addByKey(stockItem.name || `null-name-${stockItem.id}`, stockItem);
            } else if (product?.id > 0) {
                addByKey(product.id || `null-product-${stockItem.id}`, stockItem);
            } else {
                addByKey(`${stockItem.id}-stock-id`, stockItem);
            }
        }

        return Array.from(map.values(),);
    };
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
            ...await this.customerPayload(saleModel.customer),
            ...await this.paymentPayload(saleModel.payments),
            ...paid ? { payment_status: 'Paid' } : {},
        };

        // Strapi may reject nested relations for items when creating/updating sale
        // Persist items separately via saveSaleItems. Remove items from payload sent to /sales.
        const payloadNoItems = { ...payload };

        let saleResponse;

        // Determine existing id (documentId preferred)
        let existingId = saleModel.documentId ?? saleModel.id;

        const isNew = !existingId || existingId === 'new' || existingId === 'undefined';

        existingId = isNew ? null : existingId;

        // CREATE
        if (isNew) {
            saleResponse = await authApi.post('/sales', {
                data: {
                    ...payloadNoItems
                }
            });

            // normalize response shape (authApi.post returns res.data)
            const createdSale = saleResponse?.data ?? saleResponse;
            // try several possible shapes
            const createdId = createdSale?.documentId ?? null;

            saleModel.id = createdSale.id;
            saleModel.documentId = createdId;
        }
        // UPDATE
        else {
            const saleIdForUpdate = existingId;
            if (!saleIdForUpdate || saleIdForUpdate === 'new' || saleIdForUpdate === 'undefined') {
                throw new Error('Cannot update sale: missing id/documentId on saleModel');
            }
            saleResponse = await authApi.put(`/sales/${saleIdForUpdate}`, {
                data: payloadNoItems
            });
        }

        // Persist items AFTER sale exists
        await this.saveSaleItems(
            saleModel.id,
            saleModel.items,
            { paid }
        );

        return saleResponse;
    }

    /* =====================================================
       CUSTOMER
    ===================================================== */



    static removeNullAttributes(obj = {}) {

        if (!obj || typeof obj !== 'object') return {};

        return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v != null));
    }

    static async customerPayload(customer) {
        const nullConnect = { customer: [] };
        if (!customer) {
            return nullConnect;
        }
        const { documentId, name, email, phone } = customer;
        const isEmpty = !name && !email && !phone;

        if (isEmpty) {
            return nullConnect;
        }

        const data = this.removeNullAttributes({ name, email, phone });

        console.log('Customer payload data:', documentId, data, customer);

        if (customer) {

            if (documentId) {
                let cs = authApi.post('/customers', { data });
                cs = cs.data || cs;
                customer.documentId = cs.documentId;

            }
            else if (name || phone || email) {
                let cs = await authApi.put(`/customers/${documentId}`, { data });
                cs = cs.data || cs;
                customer.documentId = cs.documentId;
                //   return { connect: [cs.documentId ?? cs.id ?? cs?.attributes?.id] };
            }
        }
        if (documentId) {
            return { customer: { connect: [customer.documentId] } };
        }

        return nullConnect;
    }

    static async paymentPayload(payments = []) {
        if (!Array.isArray(payments) || payments.length === 0) {
            return { payments: [] };
        }
        let connectIds = [];
        for (const p of payments) {
            if (!p.documentId) {
                const res = await authApi.post('/payments', { data: p });
                p.documentId = res?.data?.documentId ?? res?.data?.id ?? res?.documentId ?? res?.id;
            } else {
                const res = await authApi.put(`/payments/${p.documentId}`, { data: p });
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
            // base stock item (if any) to derive product relation
            const baseStockItem = Array.isArray(item.items) && item.items.length ? item.items[0] : null;

            // build payload for sale-item
            const saleItemPayload = {
                quantity: item.quantity || 1,
                price: item.price,
                discount: item.discount || 0,
                tax: item.tax,
                total: item.total,
                sale: { connect: [saleId] },
            };

            if (baseStockItem?.product?.documentId) {
                saleItemPayload.product = { connect: [baseStockItem.product.documentId] };
            }

            if (item.documentId) {
                // update existing sale-item
                const res = await authApi.put(`/sale-items/${item.documentId}`, { data: saleItemPayload });
                const updated = res?.data ?? res;
                results.push(updated);
            } else {
                // create new sale-item
                const res = await authApi.post('/sale-items', { data: saleItemPayload });
                const created = res?.data ?? res;
                // attach returned id to item for later stock-item linking
                item.documentId = created.documentId;
                results.push(created);
            }

            // ensure we have a sale-item id to connect stock-items
            const saleItemId = item.documentId;

            // update/create stock-items and link to sale-item
            if (Array.isArray(item.items)) {
                for (const stockItem of item.items) {
                    if (!stockItem) continue;

                    const stockPayload = {
                        //   selling_price: item.selling_price,
                        ...paid ? { status: 'Sold' } : {},
                        sale_item: { connect: [saleItemId] }
                    };

                    if (stockItem.product) {
                        if (!stockItem.name) {
                            stockItem.name = stockItem.product.name
                        }

                        if (!stockItem.cost_price) {
                            stockItem.cost_price = stockItem.product.cost_price
                        }

                        if (!stockItem.offer_price) {
                            stockItem.offer_price = stockItem.product.offer_price
                        }
                        if (!stockItem.selling_price) {
                            stockItem.selling_price = stockItem.product.selling_price
                        }
                    }


                    if (stockItem.product?.documentId || stockItem.product?.id) {
                        stockPayload.product = { connect: [stockItem.product.documentId || stockItem.product.id] };
                    }

                    if (stockItem.documentId) {
                        // update existing stock-item
                        const res = await authApi.put(`/stock-items/${stockItem.documentId}`, { data: stockPayload });
                        // ignore response
                    } else {
                        // create new stock-item
                        const res = await authApi.post('/stock-items', { data: stockPayload });
                        const createdStock = res?.data ?? res;
                        // set documentId if returned
                        stockItem.documentId = createdStock.documentId ?? createdStock.id ?? createdStock?.attributes?.id;
                    }
                }
            }
        }

        return results;
    }

    /* =====================================================
       CHECKOUT (CONVENIENCE)
    ===================================================== */

    static async checkout(saleModel) {
        return this.saveSale(saleModel, { paid: true });
    }
}
