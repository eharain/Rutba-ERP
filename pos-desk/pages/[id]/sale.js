import { useEffect, useReducer, useState } from 'react';
import { useRouter } from 'next/router';
import { authApi } from '../../lib/api';
import { fetchSaleByIdOrInvoice } from '../../lib/pos';

import Layout from '../../components/Layout';
import ProtectedRoute from '../../components/ProtectedRoute';
import PermissionCheck from '../../components/PermissionCheck';
import CustomerSelect from '../../components/CustomerSelect';
import SalesItemsForm from '../../components/form/sales-items-form';
import SalesItemsList from '../../components/lists/sales-items-list';
import CheckoutModal from '../../components/CheckoutModal';

import { useUtil } from '../../context/UtilContext';
import SaleModel from '../../domain/sale/SaleModel';

export default function SalePage() {
    const router = useRouter();
    const { id } = router.query;
    const { currency } = useUtil();

    // single source of truth
    const [saleModel] = useState(() => new SaleModel());
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    const [loading, setLoading] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);

    /* ---------------- Load existing sale ---------------- */
    useEffect(() => {
        if (id) loadSale();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const loadSale = async () => {
        setLoading(true);
        try {
            const sale = await fetchSaleByIdOrInvoice(id);

            // customer
            saleModel.customer = sale.customer || null;

            // existing items (safe fallback as non-stock)
            sale.items?.forEach(item => {
                saleModel.addNonStockItem({
                    name: item.product_name || item.name,
                    price: item.selling_price,
                    costPrice: item.cost_price || 0
                });
            });

            forceUpdate();
        } catch (err) {
            console.error('Failed to load sale', err);
        } finally {
            setLoading(false);
        }
    };

    /* ---------------- Customer ---------------- */
    const handleCustomerChange = async (customer) => {
        
        saleModel.customer = customer;

        forceUpdate();

        try {
            await authApi.put(`/sales/${id}`, {
                data: {
                    customer: customer
                        ? { connect: [customer.documentId] }
                        : null
                }
            });
        } catch (err) {
            console.error('Failed to update customer', err);
        }
    };

    /* ---------------- Checkout ---------------- */
    const handleCheckoutComplete = async () => {
        setLoading(true);
        try {
            await authApi.put(`/sales/${id}`, {
                data: {
                    ...saleModel.toPayload(),
                    payment_status: 'Paid'
                }
            });

            alert('Sale completed successfully');
            setShowCheckout(false);
        } catch (err) {
            console.error('Checkout failed', err);
            alert('Checkout failed');
        } finally {
            setLoading(false);
        }
    };

    /* ---------------- Print ---------------- */
    const handlePrint = () => {
        if (saleModel.items.length === 0) return;

        const storageKey = `print_invoice_${Date.now()}`;

        localStorage.setItem(
            storageKey,
            JSON.stringify({
                sale: {
                    customer: saleModel.customer,
                    totals: {
                        subtotal: saleModel.subtotal,
                        discount: saleModel.discountTotal,
                        tax: saleModel.tax,
                        total: saleModel.total
                    }
                },
                items: saleModel.items.map(i => i.toJSON()),
                timestamp: Date.now()
            })
        );

        window.open(
            `/print-invoice?key=${storageKey}&saleId=${id}`,
            '_blank',
            'width=1000,height=800'
        );
    };

    return (
        <Layout>
            <ProtectedRoute>
                <PermissionCheck required="api::sale.sale.find">
                    <div style={{ padding: 8 }}>

                        {/* Header */}
                        <div className="row align-items-center mb-3">
                            <div className="col-md-8">
                                <h3>Sale #{id}</h3>
                            </div>
                            <div className="col-md-4 text-end">
                                <h4>
                                    Total: {currency}
                                    {saleModel.total.toFixed(2)}
                                </h4>
                            </div>
                        </div>

                        {/* Customer */}
                        <div className="mb-3">
                           
                            <CustomerSelect
                                value={saleModel.customer}
                                onChange={handleCustomerChange}
                                disabled={false}
                            />
                        </div>

                        {/* Add Items */}
                        <SalesItemsForm
                            disabled={false}
                            onAddItem={(stockItem) => {
                                saleModel.addStockItem(stockItem);
                                forceUpdate();
                            }}
                            onAddNonStock={(data) => {
                                saleModel.addNonStockItem(data);
                                forceUpdate();
                            }}
                        />

                        {/* Items List */}
                        <SalesItemsList
                            items={saleModel.items}
                            onUpdate={(index, updater) => {
                                saleModel.updateItem(index, updater);
                                forceUpdate();
                            }}
                            onRemove={(index) => {
                                saleModel.removeItem(index);
                                forceUpdate();
                            }}
                        />

                        {/* Totals */}
                        {saleModel.items.length > 0 && (
                            <div
                                className="mt-4 p-3 bg-dark text-white rounded"
                                style={{ maxWidth: 420, marginLeft: 'auto' }}
                            >
                                <div className="d-flex justify-content-between">
                                    <span>Subtotal</span>
                                    <span>{currency}{saleModel.subtotal.toFixed(2)}</span>
                                </div>

                                <div className="d-flex justify-content-between text-danger">
                                    <span>Discount</span>
                                    <span>-{currency}{saleModel.discountTotal.toFixed(2)}</span>
                                </div>

                                <div className="d-flex justify-content-between">
                                    <span>Tax</span>
                                    <span>{currency}{saleModel.tax.toFixed(2)}</span>
                                </div>

                                <hr />

                                <div className="d-flex justify-content-between fw-bold fs-5">
                                    <span>Total</span>
                                    <span>{currency}{saleModel.total.toFixed(2)}</span>
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="text-end mt-3">
                            <button
                                className="btn btn-secondary me-2"
                                onClick={handlePrint}
                                disabled={saleModel.items.length === 0}
                            >
                                Print
                            </button>

                            <button
                                className="btn btn-success"
                                onClick={() => setShowCheckout(true)}
                                disabled={saleModel.items.length === 0}
                            >
                                Checkout
                            </button>
                        </div>

                        {/* Checkout Modal */}
                        <CheckoutModal
                            isOpen={showCheckout}
                            onClose={() => setShowCheckout(false)}
                            total={saleModel.total}
                            onComplete={handleCheckoutComplete}
                            loading={loading}
                        />
                    </div>
                </PermissionCheck>
            </ProtectedRoute>
        </Layout>
    );
}
