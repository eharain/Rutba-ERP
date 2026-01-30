import { authApi } from './api';
import { fetchSaleByIdOrInvoice } from './pos';
import SaleModel from '../domain/sale/SaleModel';
import { discountFromOffer } from '../domain/sale/pricing';

export default class SaleApi {

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

        let saleResponse;

        // CREATE
        if (!saleModel.id) {
            saleResponse = await authApi.post('/sales', {
                data: {
                    ...payload,
                    payment_status: paid ? 'Paid' : 'Pending'
                }
            });

            saleModel.id = saleResponse.data.documentId;
            saleModel.documentId = saleResponse.data.documentId;
        }
        // UPDATE
        else {
            saleResponse = await authApi.put(`/sales/${saleModel.documentId}`, {
                data: payload
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
        return authApi.put(`/sales/${id}`, {
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
            const baseStockItem = Array.isArray(item.stockItems) && item.stockItems.length ? item.stockItems[0] : null;

            // build payload for sale-item
            const saleItemPayload = {
                quantity: item.quantity || 1,
                price: item.unitNetPrice,
                discount: item.discountPercent || 0,
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
                results.push(res.data);
            } else {
                // create new sale-item
                const res = await authApi.post('/sale-items', { data: saleItemPayload });
                const created = res.data;
                // attach returned id to item for later stock-item linking
                item.documentId = created.documentId ?? created.id;
                results.push(created);
            }

            // ensure we have a sale-item id to connect stock-items
            const saleItemId = item.documentId;

            // update/create stock-items and link to sale-item
            if (Array.isArray(item.stockItems)) {
                for (const sitem of item.stockItems) {
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
                        await authApi.put(`/stock-items/${sitem.documentId}`, { data: stockPayload });
                    } else {
                        // create new stock-item
                        await authApi.post('/stock-items', { data: stockPayload });
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
