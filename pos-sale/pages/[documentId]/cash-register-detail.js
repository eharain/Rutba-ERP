import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

export default function CashRegisterDetailPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { currency } = useUtil();
    const [register, setRegister] = useState(null);
    const [payments, setPayments] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("summary");

    useEffect(() => {
        if (!documentId) return;
        loadRegister();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId]);

    const loadRegister = async () => {
        setLoading(true);
        try {
            const res = await authApi.fetch(`/cash-registers/${documentId}`, {
                populate: ["opened_by_user", "closed_by_user", "branch"]
            });
            const reg = res?.data ?? res;
            setRegister(reg);

            // Load payments
            const paymentsRes = await authApi.fetch("/payments", {
                filters: { cash_register: { documentId: { $eq: documentId } } },
                sort: ["payment_date:asc"],
                pagination: { page: 1, pageSize: 500 }
            });
            setPayments(paymentsRes?.data ?? []);

            // Load transactions
            const txnRes = await authApi.fetch("/cash-register-transactions", {
                filters: { cash_register: { documentId: { $eq: documentId } } },
                sort: ["transaction_date:asc"],
                pagination: { page: 1, pageSize: 500 }
            });
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
                    s.cashReceived += Number(p.cash_received || amt);
                    s.cashChange += Number(p.change || 0);
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
        const t = { cashDrops: 0, expenses: 0, refunds: 0, adjustments: 0 };
        for (const tx of transactions) {
            const amt = Number(tx.amount || 0);
            switch (tx.type) {
                case "CashDrop": t.cashDrops += amt; break;
                case "Expense": t.expenses += amt; break;
                case "Refund": t.refunds += amt; break;
                case "Adjustment": t.adjustments += amt; break;
            }
        }
        return t;
    }, [transactions]);

    const computedExpectedCash = useMemo(() => {
        const opening = Number(register?.opening_cash || 0);
        return opening + paymentSummary.cashNet - txnTotals.refunds - txnTotals.expenses - txnTotals.cashDrops + txnTotals.adjustments;
    }, [register, paymentSummary.cashNet, txnTotals]);

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
        const cls = { Active: 'bg-success', Closed: 'bg-secondary', Expired: 'bg-warning text-dark', Cancelled: 'bg-danger' }[status] || 'bg-light';
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
                            <i className="fas fa-arrow-left me-1"></i>Back to History
                        </Link>
                    </div>

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
                        {["summary", "payments", "transactions", "timeline"].map((tab) => (
                            <li className="nav-item" key={tab}>
                                <button className={`nav-link ${activeTab === tab ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab)}>
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    {tab === 'payments' && <span className="badge bg-secondary ms-1">{payments.length}</span>}
                                    {tab === 'transactions' && <span className="badge bg-secondary ms-1">{transactions.length}</span>}
                                </button>
                            </li>
                        ))}
                    </ul>

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
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {payments.map((p, i) => (
                                                    <tr key={p.documentId ?? p.id}>
                                                        <td>{i + 1}</td>
                                                        <td className="small">{p.payment_date ? new Date(p.payment_date).toLocaleString() : '-'}</td>
                                                        <td>{p.payment_method}</td>
                                                        <td className="text-end">{fmt(p.amount)}</td>
                                                        <td className="text-end">{p.payment_method === 'Cash' ? fmt(p.cash_received) : '-'}</td>
                                                        <td className="text-end">{p.payment_method === 'Cash' ? fmt(p.change) : '-'}</td>
                                                        <td className="small text-muted">{p.transaction_no || ''}</td>
                                                    </tr>
                                                ))}
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

export async function getServerSideProps() { return { props: {} }; }
