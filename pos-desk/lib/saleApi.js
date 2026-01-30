import { authApi } from './api';
import { fetchSaleByIdOrInvoice, searchStockItems } from './pos';
import SaleModel from '../domain/sale/SaleModel';
import { discountFromOffer } from '../domain/sale/pricing';

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
        const nullProductIds = [];
        for (const stockItem of list) {
            const product = stockItem.product;
            if (!product) {
                //nullProductIds.push(stockItem.id);
                if (stockItem.name) {

                    if (!map.has(stockItem.name)) {
                        map.set(stockItem.name, { ...stockItem, more: [] });
                    } else {
                        map.get(stockItem.name).more.push(stockItem);
                    }
                }
                continue;
            }

            if (!map.has(product.id)) {
                map.set(product.id, { ...stockItem, more: [] });
            } else {
                map.get(product.id).more.push(stockItem);
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
            customer: this.customerPayload(saleModel.customer),
            payment_status: paid ? 'Paid' : undefined
        };

        // Strapi may reject nested relations for items when creating/updating sale
        // Persist items separately via saveSaleItems. Remove items from payload sent to /sales.
        const payloadNoItems = { ...payload };
        if (payloadNoItems.items) delete payloadNoItems.items;

        let saleResponse;

        // Determine existing id (documentId preferred)
        const existingId = saleModel.documentId ?? saleModel.id;
        const isNew = !existingId || existingId === 'new' || existingId === 'undefined';

        // CREATE
        if (isNew) {
            saleResponse = await authApi.post('/sales', {
                data: {
                    ...payloadNoItems,
                    payment_status: paid ? 'Paid' : 'Pending'
                }
            });

            // normalize response shape (authApi.post returns res.data)
            const createdSale = saleResponse?.data ?? saleResponse;
            // try several possible shapes
            const createdId = createdSale?.documentId
                //?? createdSale?.id
                //?? createdSale?.data?.documentId
                //?? createdSale?.data?.id
                //?? createdSale?.data?.data?.documentId
                //?? createdSale?.data?.data?.id
                //?? createdSale?.attributes?.id
                ?? null;

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

    static async updateCustomer(id, customer) {
        // id may be a raw id or a model object
        const saleId = id?.documentId ?? id?.id ?? id;
        if (!saleId) {
            throw new Error('updateCustomer: missing sale id');
        }

        return authApi.put(`/sales/${saleId}`, {
            data: {
                customer: customer
                    ? { connect: [customer.documentId] }
                    : null
            }
        });
    }

    static customerPayload(customer) {
        if (!customer) {
            return { disconnect: true };
        }

        return { connect: [customer.documentId] };
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
                price: item.unitNetPrice,
                discount: item.discount || 0,
                tax: item.tax,
                total: item.total,
                sale: { connect: [saleId] },
            };

            if (baseStockItem?.product?.documentId || baseStockItem?.product?.id) {
                saleItemPayload.product = { connect: [baseStockItem.product.documentId || baseStockItem.product.id] };
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
                item.documentId = created.documentId ?? created.id ?? created?.attributes?.id;
                results.push(created);
            }

            // ensure we have a sale-item id to connect stock-items
            const saleItemId = item.documentId;

            // update/create stock-items and link to sale-item
            if (Array.isArray(item.items)) {
                for (const sitem of item.items) {
                    if (!sitem) continue;

                    const stockPayload = {
                        selling_price: item.unitNetPrice,
                        ...paid ? { status: 'Sold' } : {},
                        sale_item: { connect: [saleItemId] }
                    };

                    if (sitem.name) stockPayload.name = sitem.name;
                    if (sitem.cost_price || sitem.costPrice) stockPayload.cost_price = sitem.cost_price ?? sitem.costPrice;

                    if (sitem.product?.documentId || sitem.product?.id) {
                        stockPayload.product = { connect: [sitem.product.documentId || sitem.product.id] };
                    }

                    if (sitem.documentId) {
                        // update existing stock-item
                        const res = await authApi.put(`/stock-items/${sitem.documentId}`, { data: stockPayload });
                        // ignore response
                    } else {
                        // create new stock-item
                        const res = await authApi.post('/stock-items', { data: stockPayload });
                        const createdStock = res?.data ?? res;
                        // set documentId if returned
                        sitem.documentId = createdStock.documentId ?? createdStock.id ?? createdStock?.attributes?.id;
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
