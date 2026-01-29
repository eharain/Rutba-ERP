import { authApi } from './api';
import { fetchSaleByIdOrInvoice } from './pos';
import SaleModel from '../domain/sale/SaleModel';

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
        const requests = [];

        for (const item of saleItems) {
            for (const stockItem of item.stockItems) {

                // CREATE sale-item
                if (!stockItem.saleItemDocumentId) {
                    requests.push(
                        authApi.post('/sale-items', {
                            data: {
                                sale: saleId,
                                product: stockItem.product.documentId,
                                stock_item: stockItem.documentId,
                                quantity: 1,
                                price: item.unitNetPrice
                            }
                        }).then(res => {
                            stockItem.saleItemDocumentId =
                                res.data.data.documentId;
                        })
                    );
                }
                // UPDATE sale-item
                else {
                    requests.push(
                        authApi.put(
                            `/sale-items/${stockItem.saleItemDocumentId}`,
                            {
                                data: {
                                    price: item.unitNetPrice
                                }
                            }
                        )
                    );
                }

                // MARK STOCK SOLD ONLY IF PAID
                if (paid) {
                    requests.push(
                        authApi.put(`/stock-items/${stockItem.documentId}`, {
                            data: { status: 'Sold' }
                        })
                    );
                }
            }
        }

        return Promise.all(requests);
    }

    /* =====================================================
       CHECKOUT (CONVENIENCE)
    ===================================================== */

    static async checkout(saleModel) {
        return this.saveSale(saleModel, { paid: true });
    }
}
