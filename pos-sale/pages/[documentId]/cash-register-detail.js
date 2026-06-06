import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { AppContextEndpoints, CashRegistersEndpoints, PaymentsEndpoints, CashRegisterTransactionEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin } from "@rutba/pos-shared/lib/roles";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

export default function CashRegisterDetailPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { currency } = useUtil();
    const { adminAppAccess } = useAuth();
    const userIsAdmin = isAppAdmin(adminAppAccess, AppContextEndpoints.getAppName());
    const [register, setRegister] = useState(null);
    const [payments, setPayments] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("ledger");

    useEffect(() => {
        if (!documentId) return;
        loadRegister();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId]);

    const loadRegister = async () => {
        setLoading(true);
        try {
            const res = await CashRegistersEndpoints.byId(documentId, { populate: ["opened_by_user", "closed_by_user", "branch"] });
            const reg = res?.data ?? res;
            setRegister(reg);

            const paymentsRes = await PaymentsEndpoints.fetchByRegister(documentId, {
                populate: { sale: { fields: ["documentId", "invoice_no"] }, sale_return: { fields: ["documentId", "return_no"] } },
            });
            setPayments(paymentsRes?.data ?? []);

            // Load transactions
            const txnRes = await CashRegisterTransactionEndpoints.fetchByRegister(documentId);
            setTransactions(txnRes?.data ?? []);
        } catch (err) {
            console.error("Failed to load register detail", err);
        } finally {
            setLoading(false);
        }
    };

    /* ── Computed values ─────────────────────────────────── */
    const paymentSummary = useMemo(() => {
        const s = { total: 0, cash: 0, card: 0, bank: 0, mobile: 0, exchangeReturn: 0, cashReceived: 0, cashChange: 0, count: payments.length };
        for (const p of payments) {
            const amt = Number(p.amount || 0);
            s.total += amt;
            switch (p.payment_method) {
                case "Cash":
                    s.cash += amt;
                    // Only positive cash tenders feed net cash; refund payouts are
                    // negative payments tracked via 'Refund' transactions (avoid
                    // double-counting against txnTotals.refunds below).
                    if (amt >= 0) {
                        s.cashReceived += Number(p.cash_received || amt);
                        s.cashChange += Number(p.change || 0);
                    }
                    break;
                case "Card": s.card += amt; break;
                case "Bank": s.bank += amt; break;
                case "Mobile Wallet": s.mobile += amt; break;
                case "Exchange Return": s.exchangeReturn += amt; break;
            }
        }
        s.cashNet = s.cashReceived - s.cashChange;
        return s;
    }, [payments]);

    const txnTotals = useMemo(() => {
        const t = { cashDrops: 0, topups: 0, expenses: 0, refunds: 0, adjustments: 0 };
        for (const tx of transactions) {
            const amt = Number(tx.amount || 0);
            switch (tx.type) {
                case "CashDrop": t.cashDrops += amt; break;
                case "CashTopUp": t.topups += amt; break;
                case "Expense": t.expenses += amt; break;
                case "Refund": t.refunds += amt; break;
                case "Adjustment": t.adjustments += amt; break;
            }
        }
        return t;
    }, [transactions]);

    const computedExpectedCash = useMemo(() => {
        const opening = Number(register?.opening_cash || 0);
        return opening + paymentSummary.cashNet - txnTotals.refunds - txnTotals.expenses - txnTotals.cashDrops + txnTotals.topups + txnTotals.adjustments;
    }, [register, paymentSummary.cashNet, txnTotals]);

    /* ── Ledger: every cash-impacting + non-cash event, in chronological order with running cash balance ── */
    const ledger = useMemo(() => {
        const rows = [];

        if (register?.opened_at) {
            rows.push({
                date: register.opened_at,
                kind: 'Open',
                method: '',
                description: `Opened by ${register.opened_by || '—'}`,
                inAmt: Number(register.opening_cash || 0),
                outAmt: 0,
                cashImpact: Number(register.opening_cash || 0),
                refSale: null,
                refReturn: null,
            });
        }

        for (const p of payments) {
            const isCash = p.payment_method === 'Cash';
            const amt = Number(p.amount || 0);
            const cashReceived = Number(p.cash_received || 0);
            const change = Number(p.change || 0);
            // Cash impact: only positive Cash tenders move physical cash.
            // Net = cash_received - change. Refund payouts are negative payments
            // paired with a 'Refund' transaction (which carries the cash-out), so
            // negative payments contribute 0 here to avoid double-counting.
            const cashFlow = (isCash && amt >= 0)
                ? (cashReceived || change ? cashReceived - change : amt)
                : 0;
            rows.push({
                date: p.payment_date,
                kind: 'Payment',
                method: p.payment_method || '',
                description: p.transaction_no || (p.sale_return?.return_no ? `Return ${p.sale_return.return_no}` : ''),
                inAmt: cashFlow > 0 ? cashFlow : 0,
                outAmt: cashFlow < 0 ? -cashFlow : 0,
                cashImpact: cashFlow,
                tenderAmount: amt,
                refSale: p.sale || null,
                refReturn: p.sale_return || null,
            });
        }

        for (const tx of transactions) {
            const amt = Number(tx.amount || 0);
            // CashTopUp + Adjustment(positive) → cash in. CashDrop/Expense/Refund/Adjustment(negative) → cash out.
            let cashFlow;
            switch (tx.type) {
                case 'CashTopUp': cashFlow = amt; break;
                case 'Adjustment': cashFlow = amt; break;
                case 'CashDrop': cashFlow = -amt; break;
                case 'Expense':  cashFlow = -amt; break;
                case 'Refund':   cashFlow = -amt; break;
                default:         cashFlow = amt;
            }
            rows.push({
                date: tx.transaction_date,
                kind: tx.type,
                method: '',
                description: tx.description || '',
                inAmt: cashFlow > 0 ? cashFlow : 0,
                outAmt: cashFlow < 0 ? -cashFlow : 0,
                cashImpact: cashFlow,
                performedBy: tx.performed_by || '',
                refSale: null,
                refReturn: null,
            });
        }

        rows.sort((a, b) => new Date(a.date) - new Date(b.date));

        let balance = 0;
        for (const r of rows) {
            balance += Number(r.cashImpact || 0);
            r.balance = balance;
        }

        if (register?.closed_at) {
            rows.push({
                date: register.closed_at,
                kind: 'Close',
                method: '',
                description: `Closed by ${register.closed_by || '—'} • Counted ${register.counted_cash != null ? `${currency}${Number(register.counted_cash).toFixed(2)}` : '—'}`,
                inAmt: 0,
                outAmt: 0,
                cashImpact: 0,
                balance,
                refSale: null,
                refReturn: null,
            });
        }

        return rows;
    }, [register, payments, transactions, currency]);

    /* ── Timeline: merge payments + transactions sorted by date ── */
    const timeline = useMemo(() => {
        const items = [];
        for (const p of payments) {
            items.push({
                date: p.payment_date,
                type: 'payment',
                label: `Payment (${p.payment_method})`,
                amount: Number(p.amount || 0),
                icon: 'fa-credit-card',
                color: 'text-success'
            });
        }
        for (const tx of transactions) {
            items.push({
                date: tx.transaction_date,
                type: 'transaction',
                label: tx.type + (tx.description ? `: ${tx.description}` : ''),
                amount: Number(tx.amount || 0),
                icon: tx.type === 'CashDrop' ? 'fa-piggy-bank' : tx.type === 'Expense' ? 'fa-receipt' : tx.type === 'Refund' ? 'fa-undo' : 'fa-sliders-h',
                color: tx.type === 'Adjustment' ? 'text-info' : 'text-danger'
            });
        }
        if (register?.opened_at) {
            items.push({ date: register.opened_at, type: 'event', label: `Register opened by ${register.opened_by || 'Unknown'}`, amount: Number(register.opening_cash || 0), icon: 'fa-play-circle', color: 'text-primary' });
        }
        if (register?.closed_at) {
            items.push({ date: register.closed_at, type: 'event', label: `Register closed by ${register.closed_by || 'Unknown'}`, amount: null, icon: 'fa-lock', color: 'text-secondary' });
        }
        items.sort((a, b) => new Date(a.date) - new Date(b.date));
        return items;
    }, [payments, transactions, register]);

    const fmt = (v) => `${currency}${Number(v || 0).toFixed(2)}`;

    const statusBadge = (status) => {
        const cls = { Active: 'bg-success', Open: 'bg-success', Closed: 'bg-secondary', Expired: 'bg-warning text-dark', Cancelled: 'bg-danger' }[status] || 'bg-light';
        return <span className={`badge ${cls}`}>{status}</span>;
    };

    if (loading) {
        return (
            <ProtectedRoute><Layout>
                <div className="text-center p-5 text-muted"><span className="spinner-border spinner-border-sm me-2"></span>Loading register...</div>
            </Layout></ProtectedRoute>
        );
    }

    if (!register) {
        return (
            <ProtectedRoute><Layout>
                <div className="p-3"><div className="alert alert-warning">Register not found.</div></div>
            </Layout></ProtectedRoute>
        );
    }

    // Non-admin users can only view registers from the last 7 days
    if (!userIsAdmin && register.opened_at) {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        if (new Date(register.opened_at) < oneWeekAgo) {
            return (
                <ProtectedRoute><Layout>
                    <div className="p-3">
                        <div className="alert alert-danger">
                            <i className="fas fa-lock me-2"></i>
                            This register is older than 7 days. Only administrators can view older registers.
                            <button className="btn btn-outline-secondary btn-sm ms-3" onClick={() => window.history.back()}>Back</button>
                        </div>
                    </div>
                </Layout></ProtectedRoute>
            );
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    {/* Header */}
                    <div className="d-flex align-items-center justify-content-between mb-3">
                        <div>
                            <h4 className="mb-0">
                                <i className="fas fa-cash-register me-2"></i>
                                Register #{register.id}
                                <span className="ms-2">{statusBadge(register.status)}</span>
                            </h4>
                            <div className="text-muted small">
                                {register.branch_name} — {register.desk_name || `Desk ${register.desk_id}`}
                            </div>
                        </div>
                        <Link href="/cash-register-history" className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-arrow-left me-1"></i>All Registers
                        </Link>
                    </div>

                    {/* Opening float mismatch recorded at open time */}
                    {register.opening_note && (
                        <div className="alert alert-warning py-2 d-flex align-items-start mb-3">
                            <i className="fas fa-exclamation-triangle me-2 mt-1"></i>
                            <span>{register.opening_note}</span>
                        </div>
                    )}

                    {/* Summary cards */}
                    <div className="row g-2 mb-3">
                        <div className="col-6 col-md-3 col-xl-2">
                            <div className="card text-center h-100"><div className="card-body py-2">
                                <div className="text-muted small">Opening</div>
                                <div className="fw-bold">{fmt(register.opening_cash)}</div>
                            </div></div>
                        </div>
                        <div className="col-6 col-md-3 col-xl-2">
                            <div className="card text-center h-100"><div className="card-body py-2">
                                <div className="text-muted small">Cash Sales (net)</div>
                                <div className="fw-bold text-success">{fmt(paymentSummary.cashNet)}</div>
                            </div></div>
                        </div>
                        <div className="col-6 col-md-3 col-xl-2">
                            <div className="card text-center h-100"><div className="card-body py-2">
                                <div className="text-muted small">Drops/Exp/Ref</div>
                                <div className="fw-bold text-danger">{fmt(txnTotals.cashDrops + txnTotals.expenses + txnTotals.refunds)}</div>
                            </div></div>
                        </div>
                        <div className="col-6 col-md-3 col-xl-2">
                            <div className="card text-center h-100 border-primary"><div className="card-body py-2">
                                <div className="text-muted small">Expected Cash</div>
                                <div className="fw-bold text-primary fs-5">{fmt(register.expected_cash ?? computedExpectedCash)}</div>
                            </div></div>
                        </div>
                        <div className="col-6 col-md-3 col-xl-2">
                            <div className="card text-center h-100"><div className="card-body py-2">
                                <div className="text-muted small">Counted Cash</div>
                                <div className="fw-bold">{register.counted_cash != null ? fmt(register.counted_cash) : '-'}</div>
                                {(register.cash_left != null || register.cash_drawn != null) && (
                                    <div className="text-muted" style={{ fontSize: 11 }}>
                                        Left {fmt(register.cash_left)} · Drawn {fmt(register.cash_drawn)}
                                    </div>
                                )}
                            </div></div>
                        </div>
                        <div className="col-6 col-md-3 col-xl-2">
                            <div className="card text-center h-100"><div className="card-body py-2">
                                <div className="text-muted small">Difference</div>
                                <div className={`fw-bold ${(register.difference ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {register.difference != null ? ((register.difference >= 0 ? '+' : '') + fmt(register.difference)) : '-'}
                                </div>
                            </div></div>
                        </div>
                    </div>

                    {/* Info row */}
                    <div className="row g-2 mb-3">
                        <div className="col-md-6">
                            <div className="card"><div className="card-body py-2">
                                <div className="row small">
                                    <div className="col-4 text-muted">Opened At</div>
                                    <div className="col-8">{register.opened_at ? new Date(register.opened_at).toLocaleString() : '-'}</div>
                                    <div className="col-4 text-muted">Opened By</div>
                                    <div className="col-8">{register.opened_by || '-'}</div>
                                </div>
                            </div></div>
                        </div>
                        <div className="col-md-6">
                            <div className="card"><div className="card-body py-2">
                                <div className="row small">
                                    <div className="col-4 text-muted">Closed At</div>
                                    <div className="col-8">{register.closed_at ? new Date(register.closed_at).toLocaleString() : '-'}</div>
                                    <div className="col-4 text-muted">Closed By</div>
                                    <div className="col-8">{register.closed_by || '-'}</div>
                                </div>
                            </div></div>
                        </div>
                    </div>
                    {register.notes && (
                        <div className="alert alert-light py-2 mb-3"><strong>Notes:</strong> {register.notes}</div>
                    )}

                    {/* Tabs */}
                    <ul className="nav nav-tabs mb-3">
                        {["ledger", "summary", "payments", "transactions", "timeline"].map((tab) => (
                            <li className="nav-item" key={tab}>
                                <button className={`nav-link ${activeTab === tab ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab)}>
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    {tab === 'ledger' && <span className="badge bg-secondary ms-1">{ledger.length}</span>}
                                    {tab === 'payments' && <span className="badge bg-secondary ms-1">{payments.length}</span>}
                                    {tab === 'transactions' && <span className="badge bg-secondary ms-1">{transactions.length}</span>}
                                </button>
                            </li>
                        ))}
                    </ul>

                    {/* Ledger tab — chronological cash-impact view with running balance */}
                    {activeTab === "ledger" && (
                        <div className="card">
                            <div className="card-body p-0">
                                {ledger.length === 0 ? (
                                    <div className="text-muted p-3">No activity for this register.</div>
                                ) : (
                                    <div className="table-responsive">
                                        <table className="table table-sm table-striped mb-0">
                                            <thead className="table-light">
                                                <tr>
                                                    <th>Date / Time</th>
                                                    <th>Kind</th>
                                                    <th>Method</th>
                                                    <th>Description</th>
                                                    <th>Linked</th>
                                                    <th className="text-end text-success">Cash In</th>
                                                    <th className="text-end text-danger">Cash Out</th>
                                                    <th className="text-end">Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ledger.map((r, i) => {
                                                    const kindClass = {
                                                        Open: 'bg-primary',
                                                        Close: 'bg-secondary',
                                                        Payment: r.cashImpact > 0 ? 'bg-success' : r.cashImpact < 0 ? 'bg-danger' : 'bg-light text-dark',
                                                        CashTopUp: 'bg-success',
                                                        CashDrop: 'bg-warning text-dark',
                                                        Expense: 'bg-danger',
                                                        Refund: 'bg-danger',
                                                        Adjustment: 'bg-info',
                                                    }[r.kind] || 'bg-secondary';
                                                    const saleDocId = r.refSale?.documentId;
                                                    const returnDocId = r.refReturn?.documentId;
                                                    return (
                                                        <tr key={i}>
                                                            <td className="small text-nowrap">{r.date ? new Date(r.date).toLocaleString() : '-'}</td>
                                                            <td><span className={`badge ${kindClass}`}>{r.kind}</span></td>
                                                            <td className="small">{r.method || '—'}</td>
                                                            <td className="small">
                                                                {r.description || '—'}
                                                                {r.kind === 'Payment' && r.method !== 'Cash' && r.tenderAmount != null && (
                                                                    <span className="text-muted ms-2">(tender {fmt(r.tenderAmount)})</span>
                                                                )}
                                                                {r.performedBy && <span className="text-muted ms-2">• {r.performedBy}</span>}
                                                            </td>
                                                            <td>
                                                                {saleDocId && (
                                                                    <Link href={`/${saleDocId}/sale`} className="badge bg-success text-decoration-none me-1">
                                                                        <i className="fas fa-receipt me-1"></i>{r.refSale.invoice_no || 'Sale'}
                                                                    </Link>
                                                                )}
                                                                {returnDocId && (
                                                                    <Link href={`/${returnDocId}/sale-return`} className="badge bg-warning text-dark text-decoration-none">
                                                                        <i className="fas fa-undo me-1"></i>{r.refReturn.return_no || 'Return'}
                                                                    </Link>
                                                                )}
                                                                {!saleDocId && !returnDocId && <span className="text-muted small">—</span>}
                                                            </td>
                                                            <td className="text-end text-success">{r.inAmt > 0 ? fmt(r.inAmt) : ''}</td>
                                                            <td className="text-end text-danger">{r.outAmt > 0 ? fmt(r.outAmt) : ''}</td>
                                                            <td className="text-end fw-bold">{fmt(r.balance)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="table-light">
                                                <tr className="fw-bold">
                                                    <td colSpan={5} className="text-end">Totals:</td>
                                                    <td className="text-end text-success">{fmt(ledger.reduce((s, r) => s + r.inAmt, 0))}</td>
                                                    <td className="text-end text-danger">{fmt(ledger.reduce((s, r) => s + r.outAmt, 0))}</td>
                                                    <td className="text-end">{fmt(ledger.length ? ledger[ledger.length - 1].balance : 0)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Summary tab */}
                    {activeTab === "summary" && (
                        <div className="row g-3">
                            <div className="col-md-6">
                                <div className="card"><div className="card-header">Payment Breakdown</div>
                                    <div className="card-body p-0">
                                        <table className="table table-sm mb-0">
                                            <tbody>
                                                <tr><td>Total Sales</td><td className="text-end fw-bold">{fmt(paymentSummary.total)}</td></tr>
                                                <tr><td className="ps-4">Cash</td><td className="text-end">{fmt(paymentSummary.cash)}</td></tr>
                                                <tr><td className="ps-4">Card</td><td className="text-end">{fmt(paymentSummary.card)}</td></tr>
                                                <tr><td className="ps-4">Bank</td><td className="text-end">{fmt(paymentSummary.bank)}</td></tr>
                                                <tr><td className="ps-4">Mobile Wallet</td><td className="text-end">{fmt(paymentSummary.mobile)}</td></tr>
                                                {paymentSummary.exchangeReturn > 0 && (
                                                    <tr><td className="ps-4">Exchange Return</td><td className="text-end">{fmt(paymentSummary.exchangeReturn)}</td></tr>
                                                )}
                                                <tr className="table-light"><td>Cash Received</td><td className="text-end">{fmt(paymentSummary.cashReceived)}</td></tr>
                                                <tr className="table-light"><td>Cash Change Given</td><td className="text-end">{fmt(paymentSummary.cashChange)}</td></tr>
                                                <tr className="table-primary"><td className="fw-bold">Net Cash</td><td className="text-end fw-bold">{fmt(paymentSummary.cashNet)}</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            <div className="col-md-6">
                                <div className="card"><div className="card-header">Cash Reconciliation</div>
                                    <div className="card-body p-0">
                                        <table className="table table-sm mb-0">
                                            <tbody>
                                                <tr><td>Opening Cash</td><td className="text-end">{fmt(register.opening_cash)}</td></tr>
                                                <tr><td>(+) Net Cash Sales</td><td className="text-end text-success">{fmt(paymentSummary.cashNet)}</td></tr>
                                                {txnTotals.topups > 0 && (
                                                    <tr><td>(+) Cash Top-Ups</td><td className="text-end text-success">{fmt(txnTotals.topups)}</td></tr>
                                                )}
                                                <tr><td>(−) Cash Refunds</td><td className="text-end text-danger">{fmt(txnTotals.refunds)}</td></tr>
                                                <tr><td>(−) Cash Expenses</td><td className="text-end text-danger">{fmt(txnTotals.expenses)}</td></tr>
                                                <tr><td>(−) Cash Drops</td><td className="text-end text-danger">{fmt(txnTotals.cashDrops)}</td></tr>
                                                <tr><td>(+/−) Adjustments</td><td className="text-end text-info">{fmt(txnTotals.adjustments)}</td></tr>
                                                <tr className="table-primary"><td className="fw-bold">Expected Cash</td><td className="text-end fw-bold">{fmt(register.expected_cash ?? computedExpectedCash)}</td></tr>
                                                <tr><td>Counted Cash</td><td className="text-end">{register.counted_cash != null ? fmt(register.counted_cash) : '-'}</td></tr>
                                                <tr className={`${(register.difference ?? 0) >= 0 ? 'table-success' : 'table-danger'}`}>
                                                    <td className="fw-bold">Difference</td>
                                                    <td className="text-end fw-bold">{register.difference != null ? ((register.difference >= 0 ? '+' : '') + fmt(register.difference)) : '-'}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Payments tab */}
                    {activeTab === "payments" && (
                        <div className="card">
                            <div className="card-body p-0">
                                {payments.length === 0 ? (
                                    <div className="text-muted p-3">No payments for this register.</div>
                                ) : (
                                    <div className="table-responsive">
                                        <table className="table table-sm table-striped mb-0">
                                            <thead className="table-light">
                                                <tr>
                                                    <th>#</th>
                                                    <th>Date</th>
                                                    <th>Method</th>
                                                    <th className="text-end">Amount</th>
                                                    <th className="text-end">Received</th>
                                                    <th className="text-end">Change</th>
                                                    <th>Txn No</th>
                                                    <th>Source</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {payments.map((p, i) => {
                                                    const saleDocId = p.sale?.documentId;
                                                    const returnDocId = p.sale_return?.documentId;
                                                    return (
                                                    <tr key={p.documentId ?? p.id}>
                                                        <td>{i + 1}</td>
                                                        <td className="small">{p.payment_date ? new Date(p.payment_date).toLocaleString() : '-'}</td>
                                                        <td>{p.payment_method}</td>
                                                        <td className={`text-end ${Number(p.amount || 0) < 0 ? 'text-danger' : ''}`}>{fmt(p.amount)}</td>
                                                        <td className="text-end">{p.payment_method === 'Cash' ? fmt(p.cash_received) : '-'}</td>
                                                        <td className="text-end">{p.payment_method === 'Cash' ? fmt(p.change) : '-'}</td>
                                                        <td className="small text-muted">{p.transaction_no || ''}</td>
                                                        <td>
                                                            {saleDocId && (
                                                                <Link href={`/${saleDocId}/sale`} className="badge bg-success text-decoration-none me-1">
                                                                    <i className="fas fa-receipt me-1"></i>{p.sale.invoice_no || 'Sale'}
                                                                </Link>
                                                            )}
                                                            {returnDocId && (
                                                                <Link href={`/${returnDocId}/sale-return`} className="badge bg-warning text-dark text-decoration-none">
                                                                    <i className="fas fa-undo me-1"></i>{p.sale_return.return_no || 'Return'}
                                                                </Link>
                                                            )}
                                                            {!saleDocId && !returnDocId && <span className="text-muted small">-</span>}
                                                        </td>
                                                    </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Transactions tab */}
                    {activeTab === "transactions" && (
                        <div className="card">
                            <div className="card-body p-0">
                                {transactions.length === 0 ? (
                                    <div className="text-muted p-3">No transactions for this register.</div>
                                ) : (
                                    <div className="table-responsive">
                                        <table className="table table-sm table-striped mb-0">
                                            <thead className="table-light">
                                                <tr>
                                                    <th>#</th>
                                                    <th>Date</th>
                                                    <th>Type</th>
                                                    <th className="text-end">Amount</th>
                                                    <th>Description</th>
                                                    <th>By</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {transactions.map((tx, i) => (
                                                    <tr key={tx.documentId ?? tx.id}>
                                                        <td>{i + 1}</td>
                                                        <td className="small">{new Date(tx.transaction_date).toLocaleString()}</td>
                                                        <td><span className={`badge ${tx.type === 'Adjustment' ? 'bg-info' : tx.type === 'CashDrop' ? 'bg-warning text-dark' : 'bg-secondary'}`}>{tx.type}</span></td>
                                                        <td className="text-end">{fmt(tx.amount)}</td>
                                                        <td>{tx.description || '-'}</td>
                                                        <td className="small">{tx.performed_by || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Timeline tab */}
                    {activeTab === "timeline" && (
                        <div className="card">
                            <div className="card-body">
                                {timeline.length === 0 ? (
                                    <div className="text-muted">No activity for this register.</div>
                                ) : (
                                    <div className="position-relative" style={{ paddingLeft: 30 }}>
                                        <div className="position-absolute" style={{ left: 12, top: 0, bottom: 0, width: 2, backgroundColor: '#dee2e6' }}></div>
                                        {timeline.map((item, i) => (
                                            <div key={i} className="d-flex align-items-start mb-3 position-relative">
                                                <div className="position-absolute" style={{ left: -22, top: 3, width: 24, height: 24, borderRadius: '50%', backgroundColor: '#fff', border: '2px solid #dee2e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className={`fas ${item.icon} ${item.color} small`}></i>
                                                </div>
                                                <div className="ms-2">
                                                    <div className="small text-muted">{new Date(item.date).toLocaleString()}</div>
                                                    <div>{item.label}</div>
                                                    {item.amount != null && <div className="fw-bold">{fmt(item.amount)}</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

