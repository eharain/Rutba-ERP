`use client`;
import { useEffect, useReducer, useState } from 'react';
import { useRouter } from 'next/router';

import Layout from '../../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import PermissionCheck from '@rutba/pos-shared/components/PermissionCheck';
import CustomerSelect from '../../components/CustomerSelect';
import SalesItemsForm from '../../components/form/sales-items-form';
import SalesItemsList from '../../components/lists/sales-items-list';
import CheckoutModal from '../../components/CheckoutModal';
import ExchangeReturnSection from '../../components/ExchangeReturnSection';
import CashRegisterGuard, { useCashRegister } from '../../components/CashRegisterGuard';
import AddLeadModal from '../../components/AddLeadModal';

import { useUtil } from '@rutba/pos-shared/context/UtilContext';

import SaleModel from '@rutba/pos-shared/domain/sale/SaleModel';
import SaleApi from '@rutba/pos-shared/lib/saleApi';

export default function SalePage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { currency, generateNextInvoiceNumber, ensureBranchDesk } = useUtil();

    // Single source of truth
    const [saleModel, setSaleModel] = useState(null);
    const [paid, setPaid] = useState(false);
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const [isDirty, setIsDirty] = useState(false);

    const [loading, setLoading] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);
    const [notesSaving, setNotesSaving] = useState(false);
    const [showLeadModal, setShowLeadModal] = useState(false);

    /* ===============================
       Load existing sale
    =============================== */

    useEffect(() => {
        if (!documentId) return;
        // If creating a new sale (route uses 'new'), initialize an empty model instead of fetching
        if (documentId === 'new') {
            const model = new SaleModel({ id: 'new' });

            model.documentId = null;
            setSaleModel(model);
            setIsDirty(false);
        } else {
            loadSale();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId]);

    const loadSale = async () => {
        setLoading(true);
        try {
            const model = await SaleApi.loadSale(documentId);
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
        if (loading) return;
        const paymentsList = Array.isArray(payments) ? payments : [payments];
        paymentsList.forEach((payment) => saleModel.addPayment(payment));
        setLoading(true);
        try {
            await doSave({ paid: true });
        } catch {
            // doSave already shows an alert
        }
        setShowCheckout(false);
    };

    const doSave = async (param) => {
        setLoading(true);
        try {
            // Ensure invoice number is set before saving (storage may not have been ready at construction)
            if (!saleModel.invoice_no) {
                saleModel.invoice_no = generateNextInvoiceNumber();
            }
            if (!saleModel.invoice_no) {
                ensureBranchDesk();
                return;
            }
            setPaid(saleModel.isPaid);

            const isNew = !saleModel.documentId;
            await SaleApi.saveSale(saleModel,param);
            // After first save, redirect to the real URL so loadSale works
            if (isNew && saleModel.documentId) {
                router.replace(`/${saleModel.documentId}/sale`);
                return;
            }
            await loadSale();
            setIsDirty(false);
        } catch (err) {
            console.error('Save failed', err);
            alert('Save failed');
            throw err;
        } finally {
            setLoading(false);
        }

    };

    /* ===============================
       Print
    =============================== */

    const handleSave = async () => {
        try {
            await doSave({ paid : false });
        } catch {
            // doSave already shows an alert
        }
    }

    const handleSaveNotes = async () => {
        if (!saleModel?.documentId) return;
        setNotesSaving(true);
        try {
            await SaleApi.saveNotes(saleModel.documentId, saleModel.notes);
        } catch (err) {
            console.error('Failed to save notes', err);
            alert('Failed to save notes.');
        } finally {
            setNotesSaving(false);
        }
    };

    const handlePrint = async () => {
        if (saleModel.items.length === 0) return;

        // Save before printing so the invoice reflects the latest data
        if (isDirty) {
            try {
                await doSave({ paid: false });
            } catch {
                return; // doSave already shows an alert on failure
            }
        }

        const storageKey = `print_invoice_${Date.now()}`;

        localStorage.setItem(
            storageKey,
            JSON.stringify({
                sale: {
                    customer: saleModel.customer,
                    invoice_no: saleModel.invoice_no,
                    sale_date: saleModel.sale_date,
                    payment_status: saleModel.payment_status,
                    payments: saleModel.payments,
                    exchangeReturn: saleModel.exchangeReturn,
                },
                items: saleModel.items.map(i => i.toJSON()),
                totals: {
                    subtotal: saleModel.subtotal,
                    discount: saleModel.discountTotal,
                    tax: saleModel.tax,
                    total: saleModel.total
                },
                timestamp: Date.now()
            })
        );

        const saleIdParam = documentId && documentId !== 'new' ? `&saleId=${documentId}` : '';
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
                    <CashRegisterGuard>
                    <div className="container-fluid px-3 py-2">

                        {/* ── Header row ── */}
                        <div className="d-flex align-items-center justify-content-between mb-2 border-bottom pb-2">
                            <h4 className="mb-0">
                                <i className="fas fa-file-invoice me-2 text-muted"></i>
                                Invoice #{saleModel.invoice_no}
                                {saleModel.isPaid && <span className="badge bg-success ms-2 align-middle">Paid</span>}
                                {saleModel.isCanceled && <span className="badge bg-danger ms-2 align-middle">Cancelled</span>}
                            </h4>
                            <div style={{ minWidth: 320 }}>
                                <CustomerSelect
                                    value={saleModel.customer}
                                    onChange={handleCustomerChange}
                                    disabled={!saleModel.isEditable}
                                />
                            </div>
                            {saleModel.customer?.name && (
                                <button
                                    className="btn btn-sm btn-outline-info ms-2"
                                    title="Create CRM Lead for this customer"
                                    onClick={() => setShowLeadModal(true)}
                                >
                                    <i className="fas fa-bullhorn me-1"></i>Lead
                                </button>
                            )}
                        </div>

                        {/* ── Add Items ── */}
                        <SalesItemsForm
                            disabled={!saleModel.isEditable}
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

                        {/* ── Items List ── */}
                        <SalesItemsList
                            items={saleModel.items}
                            disabled={!saleModel.isEditable}
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

                        {/* ── Bottom section: Totals + Actions ── */}
                        {saleModel.items.length > 0 && (
                            <div className="row g-3 mt-1">
                                {/* Exchange / Return — left side, subtle */}
                                <div className="col-lg-7">
                                    <ExchangeReturnSection
                                        saleModel={saleModel}
                                        disabled={!saleModel.isEditable}
                                        onUpdate={() => {
                                            forceUpdate();
                                            setIsDirty(true);
                                        }}
                                    />
                                </div>

                                {/* Totals + buttons — right side */}
                                <div className="col-lg-5">
                                    <div className="p-3 bg-dark text-white rounded mb-2">
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
                                        {saleModel.exchangeReturnTotal > 0 && (
                                            <div className="d-flex justify-content-between text-warning">
                                                <span>Exchange Return Credit</span>
                                                <span>-{currency}{saleModel.exchangeReturnTotal.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <hr className="my-2" />
                                        <div className="d-flex justify-content-between fw-bold fs-5">
                                            <span>Total</span>
                                            <span>{currency}{saleModel.total.toFixed(2)}</span>
                                        </div>
                                        {saleModel.exchangeReturnTotal > 0 && (
                                            <div className="d-flex justify-content-between fw-bold text-warning">
                                                <span>Amount Due</span>
                                                <span>{currency}{Math.max(0, saleModel.total - saleModel.exchangeReturnTotal).toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>

                                    <SaleButtons saleModel={saleModel} handlePrint={handlePrint} handleSave={handleSave} setShowCheckout={setShowCheckout} isDirty={isDirty} />
                                </div>
                            </div>
                        )}

                        {/* Checkout Modal */}
                        <CheckoutModal
                            isOpen={showCheckout && saleModel.isEditable}
                            onClose={() => setShowCheckout(false)}
                            total={saleModel.total}
                            exchangeReturnCredit={saleModel.exchangeReturnTotal}
                            onComplete={handleCheckoutComplete}
                            loading={loading}
                        />

                        {/* ── Notes ── */}
                        {saleModel.documentId && (
                            <div className="mt-3">
                                <label className="form-label small text-muted mb-1">
                                    <i className="fas fa-sticky-note me-1"></i>Notes
                                </label>
                                <div className="d-flex gap-2">
                                    <textarea
                                        className="form-control form-control-sm"
                                        rows={2}
                                        placeholder="Add notes to this sale…"
                                        value={saleModel.notes}
                                        onChange={(e) => {
                                            saleModel.notes = e.target.value;
                                            forceUpdate();
                                        }}
                                    />
                                    <button
                                        className="btn btn-sm btn-outline-primary align-self-end"
                                        onClick={handleSaveNotes}
                                        disabled={notesSaving}
                                        style={{ whiteSpace: 'nowrap' }}
                                    >
                                        {notesSaving
                                            ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving…</>
                                            : <><i className="fas fa-save me-1"></i>Save Notes</>
                                        }
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Add Lead Modal ── */}
                        <AddLeadModal
                            isOpen={showLeadModal}
                            onClose={() => setShowLeadModal(false)}
                            customer={saleModel.customer}
                        />
                    </div>
                    </CashRegisterGuard>
                </PermissionCheck>
            </ProtectedRoute>
        </Layout>
    );




}



function SaleButtons({ handlePrint, handleSave, saleModel, setShowCheckout, isDirty }) {
    const itemsCount = saleModel.items.length;
    const { canCheckout, deskHasCashRegister, registerStatus, openRegisterModal } = useCashRegister();

    const handleCheckoutClick = () => {
        if (!deskHasCashRegister) return;
        // If desk has register but none is active, prompt to open one
        if (!canCheckout) {
            openRegisterModal();
            return;
        }
        setShowCheckout(true);
    };

    let checkoutTooltip = '';
    if (!deskHasCashRegister) {
        checkoutTooltip = 'This desk is not set up for payments. Save the sale and complete checkout from a payment desk.';
    } else if (registerStatus === 'no-register' || registerStatus === 'expired') {
        checkoutTooltip = 'Open a cash register first to accept payments.';
    }

    return (
        <div className="d-flex gap-2">
            <button
                className="btn btn-outline-secondary flex-fill"
                onClick={handlePrint}
                disabled={itemsCount === 0}
            >
                <i className="fas fa-print me-1" />Print
            </button>
            <button
                className="btn btn-success flex-fill"
                onClick={() => handleSave(true)}
                disabled={itemsCount === 0 || !saleModel.isEditable || !isDirty}
            >
                <i className="fas fa-save me-1" />Save
            </button>
            <PermissionCheck has="api::payment.payment.create">
                <button
                    className={`btn flex-fill ${canCheckout ? 'btn-success' : 'btn-outline-secondary'}`}
                    onClick={handleCheckoutClick}
                    disabled={itemsCount === 0 || !saleModel.isEditable || (!deskHasCashRegister)}
                    title={checkoutTooltip}
                >
                    <i className={`fas ${saleModel.isPaid ? 'fa-check-circle' : saleModel.isCanceled ? 'fa-ban' : 'fa-cash-register'} me-1`} />
                    {saleModel.isPaid ? 'Paid' : saleModel.isCanceled ? 'Cancelled' : !deskHasCashRegister ? 'No Payment Desk' : !canCheckout ? 'Open Register' : 'Checkout'}
                </button>
            </PermissionCheck>
        </div>)
}

export async function getServerSideProps() { return { props: {} }; }
