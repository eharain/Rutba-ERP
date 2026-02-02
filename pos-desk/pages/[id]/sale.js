import { useEffect, useReducer, useState } from 'react';
import { useRouter } from 'next/router';

import Layout from '../../components/Layout';
import ProtectedRoute from '../../components/ProtectedRoute';
import PermissionCheck from '../../components/PermissionCheck';
import CustomerSelect from '../../components/CustomerSelect';
import SalesItemsForm from '../../components/form/sales-items-form';
import SalesItemsList from '../../components/lists/sales-items-list';
import CheckoutModal from '../../components/CheckoutModal';

import { useUtil } from '../../context/UtilContext';

import SaleModel from '../../domain/sale/SaleModel';
import SaleApi from '../../lib/saleApi';

export default function SalePage() {
    const router = useRouter();
    const { id } = router.query;
    const { currency } = useUtil();

    // Single source of truth
    const [saleModel, setSaleModel] = useState(null);
    const [paid, setPaid] = useState(false);
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    const [loading, setLoading] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);

    /* ===============================
       Load existing sale
    =============================== */

    useEffect(() => {
        if (!id) return;
        // If creating a new sale (route uses 'new'), initialize an empty model instead of fetching
        if (id === 'new') {
            const model = new SaleModel({ id: 'new' });
           
            model.documentId = null;
            setSaleModel(model);
        } else {
            loadSale();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const loadSale = async () => {
        setLoading(true);
        try {
            const model = await SaleApi.loadSale(id);
            setPaid(model.isPaid);
            setSaleModel(model);
        } catch (err) {
            console.error('Failed to load sale', err);
        } finally {
            setLoading(false);
        }
    };

    if (!saleModel) {
        return (
            <Layout>
                <ProtectedRoute>
                    <div className="p-4">Loading sale...</div>
                </ProtectedRoute>
            </Layout>
        );
    }

    /* ===============================
       Customer
    =============================== */

    const handleCustomerChange = async (customer) => {
        // For unsaved/new sales just update local model. Persist only for existing sales.
        saleModel.setCustomer(customer);
        forceUpdate();

    };

    /* ===============================
       Checkout
    =============================== */

    const handleCheckoutComplete = async (payment) => {
        setLoading(true);
        try {
            saleModel.addPayment(payment);
            setPaid(saleModel.isPaid);
             
            await SaleApi.checkout(saleModel);

            alert('Sale completed successfully');
            setShowCheckout(false);

            loadSale();
        } catch (err) {
            console.error('Checkout failed', err);
            alert('Checkout failed');
        } finally {
            setLoading(false);
        }
    };

    /* ===============================
       Print
    =============================== */

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
