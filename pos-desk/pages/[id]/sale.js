`use client`;
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
    const [isDirty, setIsDirty] = useState(false);

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
            setIsDirty(false);
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
            setIsDirty(false);
            //   console.log("model loaded", model)
        } catch (err) {
            console.error('Failed to load sale', err);
        } finally {
            setLoading(false);
        }
    };



    /* ===============================
       Customer
    =============================== */

    const handleCustomerChange = async (customer) => {
        // Prevent changing customer on paid sales
        if (saleModel.isPaid) return;

        // For unsaved/new sales just update local model. Persist only for existing sales.
        saleModel.setCustomer(customer);

        forceUpdate();
        setIsDirty(true);

    };

    /* ===============================
       Checkout
    =============================== */

    const handleCheckoutComplete = async (payments) => {
        const paymentsList = Array.isArray(payments) ? payments : [payments];
        paymentsList.forEach((payment) => saleModel.addPayment(payment));
        setLoading(true);
        await doSave({ paid: true });
        setShowCheckout(false);
    };

    const doSave = async (param) => {
        setLoading(true);
        try {
            setPaid(saleModel.isPaid);

            await SaleApi.saveSale(saleModel,param);
            // alert('Sale completed successfully');
            await loadSale();
            setIsDirty(false);
        } catch (err) {
            console.error('Save failed', err);
            alert('Save failed');
        } finally {
            setLoading(false);
        }

    };

    /* ===============================
       Print
    =============================== */

    const handleSave = async () => {
        await doSave({ paid : false });
    }
    const handlePrint = () => {
        if (saleModel.items.length === 0) return;

        const storageKey = `print_invoice_${Date.now()}`;

        localStorage.setItem(
            storageKey,
            JSON.stringify({
                sale: {
                    customer: saleModel.customer,
                    invoice_no: saleModel.invoice_no,
                    sale_date: saleModel.sale_date,
                    payment_status: saleModel.payment_status,
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

        const saleIdParam = id && id !== 'new' ? `&saleId=${id}` : '';
        window.open(`/print-invoice?key=${storageKey}${saleIdParam}`, '_blank', 'width=1000,height=800');
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

    return (
        <Layout>
            <ProtectedRoute>
                <PermissionCheck required="api::sale.sale.find">
                    <div className="container">

                        <div className="row w-100">

                            <div className="col-5 mb-2">
                                <div>
                                    <h3 className="mb-0" style={{ minHeight: '50px' }}>Invoice #{saleModel.invoice_no} {saleModel.isPaid && <span className="badge bg-success ms-2">Paid</span>}</h3>
                                </div>
                            </div>

                            <div className="col-7 mb-2 ">
                                <CustomerSelect
                                    value={saleModel.customer}
                                    onChange={handleCustomerChange}
                                    disabled={saleModel.isPaid}
                                />
                            </div>


                        </div>
                        {/* Add Items */}
                        <SalesItemsForm
                            disabled={saleModel.isPaid}
                            onAddItem={(stockItem) => {
                                saleModel.addStockItem(stockItem);
                                forceUpdate();
                                setIsDirty(true);
                            }}
                            onAddNonStock={(data) => {
                                saleModel.addNonStockItem(data);
                                forceUpdate();
                                setIsDirty(true);
                            }}
                        />

                        {/* Items List */}
                        <SalesItemsList
                            items={saleModel.items}
                            disabled={saleModel.isPaid}
                            onUpdate={(index, updater) => {
                                saleModel.updateItem(index, updater);
                                forceUpdate();
                                setIsDirty(true);
                            }}
                            onRemove={(index) => {
                                saleModel.removeItem(index);
                                forceUpdate();
                                setIsDirty(true);
                            }}
                        />

                        <div className="row g-2 mt-2">
                            <div className="col-lg-4 ms-lg-auto">
                                {/* Totals summary */}
                                {saleModel.items.length > 0 && (
                                    <div className="p-3 bg-dark text-white rounded">
                                        <div className="d-flex justify-content-between">
                                            <span>Subtotal</span>
                                            <span>{currency}{saleModel.subtotal.toFixed(2)}</span>
                                        </div>

                                        <div className="d-flex justify-content-between text-danger">
                                            <span>Discount</span>
                                            <span>-{currency}{saleModel.discountTotal.toFixed(2)}</span>
                                        </div>
                                        {saleModel.tax > 0 && (
                                            <div className="d-flex justify-content-between">
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
                            </div>

                        </div>
                        <div className="row g-2 mt-2">
                            <div className="col-lg-4 ms-lg-auto">
                                <SaleButtons saleModel={saleModel} handlePrint={handlePrint} handleSave={handleSave} setShowCheckout={setShowCheckout} isDirty={isDirty}></SaleButtons>
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



function SaleButtons({ handlePrint, handleSave, saleModel, setShowCheckout, isDirty }) {
    const itemsCount = saleModel.items.length;
    return (
        <div className="d-grid gap-2">
            <button
                className="btn btn-secondary"
                onClick={handlePrint}
                disabled={itemsCount === 0}
            >
                Print
            </button>
            <button
                className="btn btn-success"
                onClick={() => handleSave(true)}
                disabled={itemsCount === 0 || saleModel.isPaid || !isDirty}
            >
                Save
                {/* {saleModel.isPaid ? 'Save' : 'Saved'}*/}
            </button>
            <PermissionCheck has="api::payment.payment.create">
                <button
                    className="btn btn-success"
                    onClick={() => setShowCheckout(true)}
                    disabled={itemsCount === 0 || saleModel.isPaid}
                >
                    {saleModel.isPaid ? 'Paid' : 'Checkout'}
                </button>
            </PermissionCheck>
        </div>)
}