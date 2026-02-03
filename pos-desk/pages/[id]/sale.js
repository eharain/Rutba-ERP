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
        // Prevent changing customer on paid sales
        if (saleModel.isPaid) return;

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

                        {/* Main area: left - items, right - customer/totals/actions */}
                        <div className="row">
                            <div className="col-md-8">
                                <div className="d-flex justify-content-between align-items-start mb-2">
                                    <div>
                                        <h3 className="mb-0" style={{ minHeight: '50px' }}>Invoice #{saleModel.invoice_no} {saleModel.isPaid && <span className="badge bg-success ms-2">Paid</span>}</h3>
                                    </div>
                                    {/*<div className="d-flex gap-2">*/}
                                    {/*    <button*/}
                                    {/*        className="btn btn-secondary"*/}
                                    {/*        onClick={handlePrint}*/}
                                    {/*        disabled={saleModel.items.length === 0}*/}
                                    {/*    >*/}
                                    {/*        Print*/}
                                    {/*    </button>*/}
                                    {/*    <button*/}
                                    {/*        className="btn btn-success"*/}
                                    {/*        onClick={() => setShowCheckout(true)}*/}
                                    {/*        disabled={saleModel.items.length === 0 || saleModel.isPaid}*/}
                                    {/*    >*/}
                                    {/*        {saleModel.isPaid ? 'Paid' : 'Checkout'}*/}
                                    {/*    </button>*/}
                                    {/*</div>*/}
                                </div>

                                {/* Add Items */}
                                <SalesItemsForm
                                    disabled={saleModel.isPaid}
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
                                    disabled={saleModel.isPaid}
                                    onUpdate={(index, updater) => {
                                        saleModel.updateItem(index, updater);
                                        forceUpdate();
                                    }}
                                    onRemove={(index) => {
                                        saleModel.removeItem(index);
                                        forceUpdate();
                                    }}
                                />
                            </div>

                            <div className="col-md-4">
                                {/*<div className="mb-2 text-end">*/}
                                {/*    <h5 className="mb-0">Total: {currency}{saleModel.total.toFixed(2)}</h5>*/}
                                {/*    <small className="text-muted">Invoice: {saleModel.invoice_no || 'N/A'}</small>*/}
                                {/*</div>*/}

                                {/* Customer select moved here */}
                                <div className="mb-3">
                                    <CustomerSelect
                                        value={saleModel.customer}
                                        onChange={handleCustomerChange}
                                        disabled={saleModel.isPaid}
                                    />
                                </div>

                                {/* Totals summary */}
                                {saleModel.items.length > 0 && (
                                    <div className="mt-2 p-3 bg-dark text-white rounded">
                                        <div className="d-flex justify-content-between">
                                            <span>Subtotal</span>
                                            <span>{currency}{saleModel.subtotal.toFixed(2)}</span>
                                        </div>

                                        <div className="d-flex justify-content-between text-danger">
                                            <span>Discount</span>
                                            <span>-{currency}{saleModel.discountTotal.toFixed(2)}</span>
                                        </div>
                                        {saleModel.tax > 0 && (
                                            <div className="d-flex justify-content-between" >
                                                <span>Tax</span>
                                                <span>{currency}{saleModel.tax.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <hr />

                                        <div className="d-flex justify-content-between fw-bold fs-5">
                                            <span>Total</span>
                                            <span>{currency}{saleModel.total.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Actions in right column */}
                                <div className="mt-3 d-grid gap-2">
                                    <button
                                        className="btn btn-secondary"
                                        onClick={handlePrint}
                                        disabled={saleModel.items.length === 0}
                                    >
                                        Print
                                    </button>
                                    <button
                                        className="btn btn-success"
                                        onClick={() => setShowCheckout(true)}
                                        disabled={saleModel.items.length === 0 || saleModel.isPaid}
                                    >
                                        {saleModel.isPaid ? 'Paid' : 'Checkout'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Checkout Modal */}
                        <CheckoutModal
                            isOpen={showCheckout && !saleModel.isPaid}
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
