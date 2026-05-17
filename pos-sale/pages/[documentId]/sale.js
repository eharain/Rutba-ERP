`use client`;
import { useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

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
import CashDrawTopUpModal from '../../components/CashDrawTopUpModal';
import RecentProductsPanel, { recordRecentFromStockItem } from '../../components/RecentProductsPanel';

import { useUtil } from '@rutba/pos-shared/context/UtilContext';

import SaleModel from '@rutba/pos-shared/context/domain/sale/SaleModel';
import SaleApi from '@rutba/pos-shared/lib/saleApi';
import { recordSaleAudit, fetchSaleAudit, SALE_AUDIT_EVENT } from '@rutba/pos-shared/lib/saleAudit';
import { useAuth } from '@rutba/pos-shared/context/AuthContext';
import { isAppAdmin } from '@rutba/pos-shared/lib/roles';
import { AppContextEndpoints } from '@rutba/api-provider/endpoints';

const ACTION_BADGE_CLASSES = {
    Created: 'bg-primary',
    Viewed: 'bg-light text-dark border',
    ItemAdded: 'bg-success',
    ItemUpdated: 'bg-info text-dark',
    ItemRemoved: 'bg-danger',
    CustomerSet: 'bg-info text-dark',
    CustomerCleared: 'bg-secondary',
    NoteSaved: 'bg-secondary',
    Saved: 'bg-secondary',
    ReceiptPrintedDraft: 'bg-warning text-dark',
    ReceiptPrintedPaid: 'bg-warning text-dark',
    CheckedOut: 'bg-success',
    PaymentRecorded: 'bg-success',
    ExchangeReturnLinked: 'bg-info text-dark',
    ExchangeReturnRemoved: 'bg-secondary',
    Cancelled: 'bg-danger',
};
function actionBadgeClass(action) {
    return ACTION_BADGE_CLASSES[action] || 'bg-light text-dark';
}

export default function SalePage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { currency, generateNextInvoiceNumber, ensureBranchDesk, branch, desk } = useUtil();
    const { adminAppAccess } = useAuth();
    const userIsAdmin = isAppAdmin(adminAppAccess, AppContextEndpoints.getAppName());
    const [auditEntries, setAuditEntries] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [showAudit, setShowAudit] = useState(false);
    const auditFetchedRef = useRef(false);
    // Exchange/Return panel is collapsed by default — most sales don't need
    // it. Auto-open once if the loaded sale already has saved returns so
    // they're not invisible to the teller.
    const [showExchange, setShowExchange] = useState(false);

    // Single source of truth
    const [saleModel, setSaleModel] = useState(null);
    const [paid, setPaid] = useState(false);
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const [isDirty, setIsDirty] = useState(false);

    const [loading, setLoading] = useState(false);
    const savingRef = useRef(false);
    const [showCheckout, setShowCheckout] = useState(false);
    const [notesSaving, setNotesSaving] = useState(false);
    const [showLeadModal, setShowLeadModal] = useState(false);
    const [showCashDrawModal, setShowCashDrawModal] = useState(false);

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

    // Append newly-recorded audit entries to the panel in real time so the
    // admin sees actions land as the teller performs them. We accept any
    // entry whose saleDocId matches the current sale OR is null (audit was
    // fired before the first save persisted a documentId).
    useEffect(() => {
        if (!userIsAdmin) return;
        const currentDocId = saleModel?.documentId || (documentId !== 'new' ? documentId : null);
        const handler = (e) => {
            const { saleDocId, entry } = e.detail || {};
            if (!entry) return;
            if (saleDocId && currentDocId && saleDocId !== currentDocId) return;
            setAuditEntries(prev => [...prev, entry]);
        };
        window.addEventListener(SALE_AUDIT_EVENT, handler);
        return () => window.removeEventListener(SALE_AUDIT_EVENT, handler);
    }, [userIsAdmin, documentId, saleModel?.documentId]);

    const loadSale = async () => {
        setLoading(true);
        try {
            const model = await SaleApi.loadSale(documentId);
            setPaid(model.isPaid);
            setSaleModel(model);
            setIsDirty(false);
            recordSaleAudit(documentId, 'Viewed', `Opened invoice ${model.invoice_no || ''}`.trim());
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
        // Allow adding a customer to a paid sale when none was set
        if (saleModel.isPaid && saleModel.customer?.name) return;

        saleModel.setCustomer(customer);
        forceUpdate();
        setIsDirty(true);
        recordSaleAudit(
            saleModel.documentId,
            customer ? 'CustomerSet' : 'CustomerCleared',
            customer ? [customer.name, customer.phone, customer.email].filter(Boolean).join(' · ') : null,
        );

        // For paid/completed sales, persist customer directly without full re-save
        if (saleModel.isPaid && saleModel.documentId && customer) {
            try {
                await SaleApi.saveCustomer(saleModel.documentId, customer);
            } catch (err) {
                console.error('Failed to save customer', err);
            }
        }
    };

    /* ===============================
       Checkout
    =============================== */

    const handleCheckoutComplete = async (payments) => {
        if (savingRef.current) return;
        const paymentsList = Array.isArray(payments) ? payments : [payments];
        paymentsList.forEach((payment) => {
            saleModel.addPayment(payment);
            recordSaleAudit(
                saleModel.documentId,
                'PaymentRecorded',
                `${payment.payment_method || 'Payment'} ${currency}${Number(payment.amount || 0).toFixed(2)}${payment.transaction_no ? ` (${payment.transaction_no})` : ''}`,
            );
        });
        try {
            await doSave({ paid: true });
            recordSaleAudit(
                saleModel.documentId,
                'CheckedOut',
                `Total ${currency}${Number(saleModel.total || 0).toFixed(2)} · ${paymentsList.length} payment(s)`,
            );
        } catch {
            // doSave already shows an alert
        }
        setShowCheckout(false);
    };

    const handleSavePayments = async (payments) => {
        if (savingRef.current) return;
        const paymentsList = Array.isArray(payments) ? payments : [payments];
        paymentsList.forEach((payment) => {
            saleModel.addPayment(payment);
            recordSaleAudit(
                saleModel.documentId,
                'PaymentRecorded',
                `${payment.payment_method || 'Payment'} ${currency}${Number(payment.amount || 0).toFixed(2)}${payment.transaction_no ? ` (${payment.transaction_no})` : ''}`,
            );
        });
        try {
            await doSave({ paid: false });
        } catch {
            // doSave already shows an alert
        }
        setShowCheckout(false);
    };

    const doSave = async (param) => {
        if (savingRef.current) return;
        savingRef.current = true;
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
            recordSaleAudit(
                saleModel.documentId,
                isNew ? 'Created' : 'Saved',
                `${saleModel.items.length} item(s) · ${currency}${Number(saleModel.total || 0).toFixed(2)}${param?.paid ? ' · paid' : ' · draft'}`,
            );
            // After first save, redirect to the real URL so loadSale works
            if (isNew && saleModel.documentId) {
                await router.replace(`/${saleModel.documentId}/sale`);
                return;
            }
            await loadSale();
            setIsDirty(false);
        } catch (err) {
            console.error('Save failed', err);
            alert('Save failed');
            throw err;
        } finally {
            savingRef.current = false;
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
            const noteText = (saleModel.notes || '').trim();
            const preview = noteText.length > 60 ? `${noteText.slice(0, 60)}…` : noteText;
            recordSaleAudit(
                saleModel.documentId,
                'NoteSaved',
                noteText ? `Note: "${preview}"` : 'Note cleared',
            );
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
                    exchangeReturns: saleModel.exchangeReturns,
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

        const resolvedDocId = saleModel.documentId || (documentId !== 'new' ? documentId : null);
        const saleIdParam = resolvedDocId ? `&saleId=${resolvedDocId}` : '';
        window.open(`/print-invoice?key=${storageKey}${saleIdParam}`, '_blank', 'width=1000,height=800');
        // Track whether the receipt was printed before or after checkout
        // so admins can spot misuse (e.g. printing a "paid" receipt that
        // was never actually checked out, or repeated draft prints).
        recordSaleAudit(
            resolvedDocId,
            saleModel.isPaid ? 'ReceiptPrintedPaid' : 'ReceiptPrintedDraft',
            `Invoice ${saleModel.invoice_no || ''} · total ${currency}${Number(saleModel.total || 0).toFixed(2)}`.trim(),
        );
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

    // Collect stock-item documentIds already added to the sale so the recent
    // panel can grey-out items that have no remaining stock to attach.
    const usedStockIds = new Set();
    for (const saleItem of saleModel.items || []) {
        for (const si of saleItem.items || []) {
            if (si?.documentId) usedStockIds.add(si.documentId);
        }
    }

    const addStockItem = (stockItem) => {
        saleModel.addStockItem(stockItem);
        recordRecentFromStockItem(branch, desk, stockItem);
        forceUpdate();
        setIsDirty(true);
        const name = stockItem?.product?.name || stockItem?.name || 'item';
        const price = Number(stockItem?.selling_price || 0).toFixed(2);
        recordSaleAudit(saleModel.documentId, 'ItemAdded', `${name} @ ${currency}${price}`);
    };

    return (
        <Layout fullWidth>
            <ProtectedRoute>
                <PermissionCheck required="sale">
                    <CashRegisterGuard>
                    <div className="d-flex align-items-start" style={{ minHeight: '100vh' }}>
                        {/* Main content column — everything that was the page */}
                        <div className="flex-grow-1 px-3 py-2" style={{ minWidth: 0 }}>

                        {/* ── Compact header strip ── */}
                        <div className="d-flex align-items-center gap-2 mb-2 border-bottom pb-2">
                            <span className="small text-muted text-nowrap">
                                <i className="fas fa-file-invoice me-1"></i>{saleModel.invoice_no || 'New Sale'}
                            </span>
                            {saleModel.isPaid && <span className="badge bg-success">Paid</span>}
                            {saleModel.isCanceled && <span className="badge bg-danger">Cancelled</span>}
                            {!saleModel.isPaid && !saleModel.isCanceled && saleModel.items.length > 0 && (
                                <span className="badge bg-secondary">Draft</span>
                            )}
                            <div className="ms-auto d-flex gap-2">
                                {userIsAdmin && saleModel.documentId && (
                                    <button
                                        className="btn btn-sm btn-outline-secondary"
                                        title="View audit trail (admin)"
                                        onClick={async () => {
                                            const next = !showAudit;
                                            setShowAudit(next);
                                            // Fetch only on first open per page-lifetime; subsequent
                                            // toggles keep live-appended entries instead of clobbering.
                                            if (next && !auditFetchedRef.current) {
                                                auditFetchedRef.current = true;
                                                setAuditLoading(true);
                                                const entries = await fetchSaleAudit(saleModel.documentId);
                                                // Merge: server entries + any local entries already
                                                // accumulated, de-duped by (action + performed_at).
                                                setAuditEntries((prevLocal) => {
                                                    const key = (e) => `${e.action}::${e.performed_at}`;
                                                    const seen = new Set(entries.map(key));
                                                    const tail = prevLocal.filter(e => !seen.has(key(e)));
                                                    return [...entries, ...tail];
                                                });
                                                setAuditLoading(false);
                                            }
                                        }}
                                    >
                                        <i className="fas fa-history me-1"></i>Audit
                                    </button>
                                )}
                                {saleModel.customer?.name && (
                                    <button
                                        className="btn btn-sm btn-outline-info"
                                        title="Create CRM Lead for this customer"
                                        onClick={() => setShowLeadModal(true)}
                                    >
                                        <i className="fas fa-bullhorn me-1"></i>Lead
                                    </button>
                                )}
                                <button
                                    className="btn btn-sm btn-outline-warning"
                                    title="Cash Draw / Top-Up"
                                    onClick={() => setShowCashDrawModal(true)}
                                >
                                    <i className="fas fa-coins me-1"></i>Cash
                                </button>
                            </div>
                        </div>

                        {/* ── Customer row (compact, single line) ── */}
                        <div className="mb-2">
                            <CustomerSelect
                                value={saleModel.customer}
                                onChange={handleCustomerChange}
                                disabled={!saleModel.isEditable && !(saleModel.isPaid && !saleModel.customer?.name)}
                            />
                        </div>

                        {/* ── Audit trail panel (admin only, toggled from header) ── */}
                        {showAudit && userIsAdmin && (
                            <div className="card mb-2">
                                <div className="card-header py-2 d-flex justify-content-between align-items-center">
                                    <span className="small">
                                        <i className="fas fa-history me-1"></i>
                                        {'Audit trail'} <span className="badge bg-secondary ms-1">{auditEntries.length}</span>
                                    </span>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-link p-0 text-muted"
                                        onClick={() => setShowAudit(false)}
                                        title="Close"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                                <div className="card-body p-0">
                                    {auditLoading ? (
                                        <div className="text-muted small p-3">
                                            <span className="spinner-border spinner-border-sm me-2" />Loading…
                                        </div>
                                    ) : auditEntries.length === 0 ? (
                                        <div className="text-muted small p-3">No audit entries yet.</div>
                                    ) : (
                                        <div className="table-responsive" style={{ maxHeight: 300, overflowY: 'auto' }}>
                                            <table className="table table-sm align-middle mb-0">
                                                <thead className="table-light sticky-top">
                                                    <tr>
                                                        <th>Time</th>
                                                        <th>Action</th>
                                                        <th>By</th>
                                                        <th>Where</th>
                                                        <th>Details</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {auditEntries.map((e, i) => (
                                                        <tr key={e.documentId || e.id || i}>
                                                            <td className="small text-nowrap">
                                                                {e.performed_at ? new Date(e.performed_at).toLocaleString() : '-'}
                                                            </td>
                                                            <td>
                                                                <span className={`badge ${actionBadgeClass(e.action)}`}>
                                                                    {e.action || '-'}
                                                                </span>
                                                            </td>
                                                            <td className="small">{e.performed_by || '-'}</td>
                                                            <td className="small text-muted">
                                                                {[e.branch_name, e.desk_name, e.role_key].filter(Boolean).join(' · ') || '-'}
                                                            </td>
                                                            <td className="small">{e.description || ''}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Items area: search + list (full width — Quick Add is the right rail) ── */}
                        <SalesItemsForm
                            disabled={!saleModel.isEditable}
                            currentItems={saleModel.items}
                            onAddItem={addStockItem}
                            onAddNonStock={(data) => {
                                saleModel.addNonStockItem(data);
                                forceUpdate();
                                setIsDirty(true);
                            }}
                        />

                        <SalesItemsList
                            items={saleModel.items}
                            disabled={!saleModel.isEditable}
                            onUpdate={(index, updater) => {
                                const before = saleModel.items[index];
                                const beforeName = before?.name;
                                const beforeQty = before?.quantity;
                                const beforePrice = before?.unitPrice;
                                saleModel.updateItem(index, updater);
                                forceUpdate();
                                setIsDirty(true);
                                const after = saleModel.items[index];
                                const diffs = [];
                                if (after?.name !== beforeName) diffs.push(`name: ${beforeName} → ${after?.name}`);
                                if (after?.quantity !== beforeQty) diffs.push(`qty: ${beforeQty} → ${after?.quantity}`);
                                if (after?.unitPrice !== beforePrice) diffs.push(`price: ${beforePrice} → ${after?.unitPrice}`);
                                recordSaleAudit(
                                    saleModel.documentId,
                                    'ItemUpdated',
                                    `${after?.name || 'item'} (${diffs.join(', ') || 'edited'})`,
                                );
                            }}
                            onRemove={(index) => {
                                const removedName = saleModel.items[index]?.name || 'item';
                                saleModel.removeItem(index);
                                forceUpdate();
                                setIsDirty(true);
                                recordSaleAudit(saleModel.documentId, 'ItemRemoved', removedName);
                            }}
                        />

                        {/* ── Bottom section: full-width stack ── */}
                        {saleModel.items.length > 0 && (() => {
                            const amountDue = Math.max(0, saleModel.total - saleModel.exchangeReturnTotal);
                            // "Paid" means actual money taken from the customer. Exchange-return
                            // tenders are credit applied (already shown as Exchange Credit above)
                            // — they must not double-count here.
                            const isExchangeTender = (p) => !!p?.sale_return || p?.payment_method === 'Exchange Return';
                            const totalPaid = (saleModel.payments || [])
                                .filter(p => !isExchangeTender(p))
                                .reduce((s, p) => s + Number(p.amount || 0), 0);
                            const change = Math.max(0, totalPaid - amountDue);
                            const registerDocId = saleModel.cash_register?.documentId;
                            return (
                                <div className="mt-3">
                                    {/* Exchange Returns — collapsed-by-default toggle. Most
                                        sales never use this. When there's already a credit
                                        applied, a small pill shows it; clicking the chevron
                                        opens the full picker. Hidden entirely for paid sales
                                        with no saved returns to keep the closed-out view clean. */}
                                    {(() => {
                                        const savedCount = (saleModel.exchangeReturns || []).filter(er => er.returnNo).length;
                                        const savedTotal = saleModel.exchangeReturnTotal || 0;
                                        // For paid sales with no exchange credit, don't even show the toggle.
                                        if (!saleModel.isEditable && savedCount === 0) return null;
                                        return (
                                            <div className={`mb-2 ${!showExchange ? 'd-flex justify-content-end' : ''}`}>
                                                {!showExchange ? (
                                                    <button
                                                        type="button"
                                                        className={`btn btn-sm ${savedCount > 0 ? 'btn-outline-warning' : 'btn-outline-secondary'} d-inline-flex align-items-center gap-2`}
                                                        onClick={() => setShowExchange(true)}
                                                        title={savedCount > 0 ? 'Manage applied exchange returns' : 'Add an exchange return / credit from a previous sale'}
                                                        style={{ minWidth: savedCount > 0 ? 260 : 200 }}
                                                    >
                                                        <i className="fas fa-exchange-alt"></i>
                                                        {savedCount > 0 ? (
                                                            <span>
                                                                {savedCount} exchange {savedCount === 1 ? 'return' : 'returns'} ·
                                                                <span className="ms-1 fw-semibold text-warning">−{currency}{Number(savedTotal).toFixed(2)}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="small">{'Exchange / Return'}</span>
                                                        )}
                                                        <i className="fas fa-chevron-down ms-auto small"></i>
                                                    </button>
                                                ) : (
                                                    <>
                                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                                            <span className="small text-muted">
                                                                <i className="fas fa-exchange-alt me-1"></i>{'Exchange / Return'}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-link text-muted p-0"
                                                                onClick={() => setShowExchange(false)}
                                                                title="Collapse"
                                                            >
                                                                <i className="fas fa-chevron-up"></i>
                                                            </button>
                                                        </div>
                                                        <ExchangeReturnSection
                                                            saleModel={saleModel}
                                                            disabled={!saleModel.isEditable}
                                                            onUpdate={() => {
                                                                forceUpdate();
                                                                setIsDirty(true);
                                                            }}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* ── Unified summary: single vertical receipt-style column ── */}
                                    <div className="card mt-2 ms-auto" style={{ maxWidth: 480, fontVariantNumeric: 'tabular-nums' }}>
                                        <div className="card-body py-3 px-3">
                                            <SummaryRow label="Subtotal" value={`${currency}${saleModel.subtotal.toFixed(2)}`} />
                                            {saleModel.discountTotal > 0 && (
                                                <SummaryRow label="Discount" value={`−${currency}${saleModel.discountTotal.toFixed(2)}`} valueClass="text-danger" />
                                            )}
                                            {saleModel.tax > 0 && (
                                                <SummaryRow label="Tax" value={`${currency}${saleModel.tax.toFixed(2)}`} />
                                            )}
                                            {(saleModel.discountTotal > 0 || saleModel.tax > 0) && (
                                                <SummaryRow label="Sale Total" value={`${currency}${saleModel.total.toFixed(2)}`} divider bold />
                                            )}
                                            {saleModel.exchangeReturnTotal > 0 && (
                                                <SummaryRow label="Exchange Credit" value={`−${currency}${saleModel.exchangeReturnTotal.toFixed(2)}`} valueClass="text-warning" />
                                            )}
                                            {saleModel.saleReturns?.length > 0 && saleModel.saleReturns.map((sr, i) => {
                                                const srDocId = sr.documentId || sr.id;
                                                const labelNode = (
                                                    <span className="d-inline-flex align-items-center gap-1">
                                                        <i className="fas fa-undo text-muted small"></i>
                                                        {srDocId ? (
                                                            <Link href={`/${srDocId}/sale-return`} className="text-decoration-none">
                                                                {sr.returnNo || 'Return'}
                                                            </Link>
                                                        ) : (sr.returnNo || 'Return')}
                                                        <span className="text-muted small">({sr.type || 'Return'})</span>
                                                    </span>
                                                );
                                                return (
                                                    <SummaryRow
                                                        key={`sr-${i}`}
                                                        label={labelNode}
                                                        value={`−${currency}${Number(sr.totalRefund || 0).toFixed(2)}`}
                                                        valueClass="text-danger"
                                                    />
                                                );
                                            })}
                                            <SummaryRow
                                                label={saleModel.exchangeReturnTotal > 0 ? 'Amount Due' : 'Total'}
                                                value={`${currency}${amountDue.toFixed(2)}`}
                                                divider
                                                bold
                                                size="lg"
                                            />

                                            {/* Payments — same column, same alignment */}
                                            {(saleModel.payments || []).length > 0 && (
                                                <>
                                                    <div className="text-muted text-uppercase mt-3 mb-1" style={{ fontSize: 11, letterSpacing: 0.5 }}>
                                                        Payments
                                                    </div>
                                                    {saleModel.payments.map((p, i) => {
                                                        const pDocId = p.documentId;
                                                        const returnDocId = p.sale_return?.documentId;
                                                        const labelNode = (
                                                            <span className="d-inline-flex align-items-center gap-1">
                                                                {pDocId ? (
                                                                    <Link href={`/${pDocId}/payment`} className="text-decoration-none">
                                                                        {p.payment_method || 'Payment'}
                                                                    </Link>
                                                                ) : (
                                                                    <span>{p.payment_method || 'Payment'}</span>
                                                                )}
                                                                {p.transaction_no && <span className="text-muted small">({p.transaction_no})</span>}
                                                                {returnDocId && (
                                                                    <Link href={`/${returnDocId}/sale-return`} className="badge bg-warning text-dark text-decoration-none">
                                                                        <i className="fas fa-undo me-1"></i>{p.sale_return?.return_no || 'Return'}
                                                                    </Link>
                                                                )}
                                                            </span>
                                                        );
                                                        return (
                                                            <SummaryRow
                                                                key={`p-${i}`}
                                                                label={labelNode}
                                                                value={`${currency}${Number(p.amount || 0).toFixed(2)}`}
                                                            />
                                                        );
                                                    })}
                                                    <SummaryRow label="Paid" value={`${currency}${totalPaid.toFixed(2)}`} divider bold />
                                                    {change > 0 && (
                                                        <SummaryRow label="Change" value={`${currency}${change.toFixed(2)}`} valueClass="text-info" />
                                                    )}
                                                    {registerDocId && (
                                                        <div className="mt-2 text-end">
                                                            <Link href={`/${registerDocId}/cash-register-detail`} className="badge bg-primary text-decoration-none">
                                                                <i className="fas fa-cash-register me-1"></i>Register
                                                            </Link>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Action buttons sit at the end of the natural flow */}
                                            <div className="mt-3 pt-3 border-top d-flex justify-content-end">
                                                <SaleButtons
                                                    saleModel={saleModel}
                                                    handlePrint={handlePrint}
                                                    handleSave={handleSave}
                                                    setShowCheckout={setShowCheckout}
                                                    isDirty={isDirty}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Checkout Modal */}
                        <CheckoutModal
                            isOpen={showCheckout && saleModel.isEditable}
                            onClose={() => setShowCheckout(false)}
                            total={saleModel.total}
                            exchangeReturnCredit={saleModel.exchangeReturnTotal}
                            existingPayments={saleModel.payments}
                            onComplete={handleCheckoutComplete}
                            onSavePayments={handleSavePayments}
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

                        {/* ── Sale Returns (returns FROM this sale) ── */}
                        {saleModel.saleReturns?.length > 0 && (
                            <div className="mt-3 border rounded">
                                <div className="px-3 py-2 bg-light border-bottom">
                                    <span className="small text-muted"><i className="fas fa-undo me-1"></i>Returns From This Sale</span>
                                </div>
                                <div className="p-2">
                                    {saleModel.saleReturns.map((sr, idx) => (
                                        <div key={idx} className={idx > 0 ? 'mt-2 pt-2 border-top' : ''}>
                                            <div className="small text-muted mb-1">
                                                {sr.returnNo && <><strong>#{sr.returnNo}</strong> — </>}
                                                {sr.type || 'Return'}
                                                {' • '}{currency}{Number(sr.totalRefund || 0).toFixed(2)}
                                                {sr.exchangeSale && (
                                                    <> — Exchange Sale{' '}
                                                        <a href={`/${sr.exchangeSale.documentId || sr.exchangeSale.id}/sale`}
                                                           className="text-primary">
                                                            #{sr.exchangeSale.invoice_no || sr.exchangeSale.documentId || sr.exchangeSale.id}
                                                        </a>
                                                    </>
                                                )}
                                            </div>
                                            <table className="table table-sm small mb-0">
                                                <thead><tr><th>Product</th><th className="text-end">Qty</th><th className="text-end">Price</th></tr></thead>
                                                <tbody>
                                                    {(sr.items || []).map((ri, i) => (
                                                        <tr key={i}>
                                                            <td>{ri.productName}</td>
                                                            <td className="text-end">{ri.quantity}</td>
                                                            <td className="text-end">{currency}{Number(ri.price || 0).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Add Lead Modal ── */}
                        <AddLeadModal
                            isOpen={showLeadModal}
                            onClose={() => setShowLeadModal(false)}
                            customer={saleModel.customer}
                        />

                        {/* ── Cash Draw / Top-Up Modal ── */}
                        <CashDrawTopUpModal
                            isOpen={showCashDrawModal}
                            onClose={() => setShowCashDrawModal(false)}
                            saleRegister={saleModel.cashRegister}
                        />
                        </div>{/* /flex-grow-1 main content */}

                        {/* ── Right-rail Quick Add (sticky, collapsible) ── */}
                        <RecentProductsPanel
                            disabled={!saleModel.isEditable}
                            usedStockIds={usedStockIds}
                            onAddStockItem={addStockItem}
                        />
                    </div>{/* /d-flex outer wrapper */}
                    </CashRegisterGuard>
                </PermissionCheck>
            </ProtectedRoute>
        </Layout>
    );




}



function SummaryRow({ label, value, valueClass = '', bold = false, divider = false, size }) {
    const isLg = size === 'lg';
    const labelClass = [
        'me-3',
        bold ? 'fw-semibold' : 'text-muted',
        isLg ? 'text-uppercase' : '',
    ].filter(Boolean).join(' ');
    const valueCls = [
        bold ? 'fw-bold' : 'fw-normal',
        valueClass,
    ].filter(Boolean).join(' ');
    return (
        <div
            className={`d-flex justify-content-between align-items-baseline ${divider ? 'border-top pt-2 mt-2' : ''}`}
            style={isLg ? { letterSpacing: 0.3 } : undefined}
        >
            <span className={labelClass} style={isLg ? { fontSize: 13 } : undefined}>{label}</span>
            <span className={valueCls} style={isLg ? { fontSize: '1.5rem', lineHeight: 1.1 } : undefined}>{value}</span>
        </div>
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
        <div className="d-flex gap-2 align-items-stretch">
            <button
                className="btn btn-outline-secondary"
                onClick={handlePrint}
                disabled={itemsCount === 0}
                title="Print receipt"
            >
                <i className="fas fa-print me-1" />Print
            </button>
            <button
                className="btn btn-outline-primary"
                onClick={() => handleSave(true)}
                disabled={itemsCount === 0 || !saleModel.isEditable || !isDirty}
                title="Save draft"
            >
                <i className="fas fa-save me-1" />Save
            </button>
            <PermissionCheck has="sale">
                <button
                    className={`btn ${canCheckout ? 'btn-success' : 'btn-outline-secondary'}`}
                    onClick={handleCheckoutClick}
                    disabled={itemsCount === 0 || !saleModel.isEditable || (!deskHasCashRegister)}
                    title={checkoutTooltip}
                    style={{ minWidth: 160 }}
                >
                    <i className={`fas ${saleModel.isPaid ? 'fa-check-circle' : saleModel.isCanceled ? 'fa-ban' : 'fa-cash-register'} me-1`} />
                    {saleModel.isPaid ? 'Paid' : saleModel.isCanceled ? 'Cancelled' : !deskHasCashRegister ? 'No Payment Desk' : !canCheckout ? 'Open Register' : 'Checkout'}
                </button>
            </PermissionCheck>
        </div>)
}

