import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

const EXPIRY_HOURS = 20;

function hoursOpen(register) {
    if (!register?.opened_at) return 0;
    return (Date.now() - new Date(register.opened_at).getTime()) / (60 * 60 * 1000);
}

export default function CashRegisterPage() {
    const { branch, desk, user, currency, setCashRegister } = useUtil();
    const [activeRegister, setActiveRegister] = useState(null);
    const [openingCash, setOpeningCash] = useState("");
    const [closingCash, setClosingCash] = useState("");
    const [registerPayments, setRegisterPayments] = useState([]);
    const [registerTransactions, setRegisterTransactions] = useState([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [paymentsError, setPaymentsError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [closingNotes, setClosingNotes] = useState("");

    // Transaction form
    const [txnType, setTxnType] = useState("CashDrop");
    const [txnAmount, setTxnAmount] = useState("");
    const [txnDesc, setTxnDesc] = useState("");
    const [txnLoading, setTxnLoading] = useState(false);

    useEffect(() => {
        if (!desk?.id) return;
        loadActiveRegister();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desk?.id]);

    useEffect(() => {
        if (!activeRegister) {
            setRegisterPayments([]);
            setRegisterTransactions([]);
            return;
        }
        loadRegisterPayments(activeRegister);
        loadRegisterTransactions(activeRegister);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRegister?.documentId, activeRegister?.id]);

    /* ── Payment summary ─────────────────────────────────── */
    const paymentSummary = useMemo(() => {
        const summary = { total: 0, cash: 0, card: 0, bank: 0, mobile: 0, cashReceived: 0, cashChange: 0 };
        for (const payment of registerPayments) {
            const amount = Number(payment.amount || 0);
            summary.total += amount;
            switch (payment.payment_method) {
                case "Cash":
                    summary.cash += amount;
                    summary.cashReceived += Number(payment.cash_received || amount);
                    summary.cashChange += Number(payment.change || 0);
                    break;
                case "Card": summary.card += amount; break;
                case "Bank": summary.bank += amount; break;
                case "Mobile Wallet": summary.mobile += amount; break;
                default: break;
            }
        }
        summary.cashNet = summary.cashReceived - summary.cashChange;
        return summary;
    }, [registerPayments]);

    /* ── Transaction totals ──────────────────────────────── */
    const txnTotals = useMemo(() => {
        const t = { cashDrops: 0, expenses: 0, refunds: 0, adjustments: 0 };
        for (const tx of registerTransactions) {
            const amt = Number(tx.amount || 0);
            switch (tx.type) {
                case "CashDrop": t.cashDrops += amt; break;
                case "Expense": t.expenses += amt; break;
                case "Refund": t.refunds += amt; break;
                case "Adjustment": t.adjustments += amt; break;
            }
        }
        return t;
    }, [registerTransactions]);

    const openingCashValue = useMemo(() => Number(activeRegister?.opening_cash || 0), [activeRegister]);
    const expectedCash = useMemo(
        () => openingCashValue
            + (Number.isFinite(paymentSummary.cashNet) ? paymentSummary.cashNet : 0)
            - txnTotals.refunds
            - txnTotals.expenses
            - txnTotals.cashDrops
            + txnTotals.adjustments,
        [openingCashValue, paymentSummary.cashNet, txnTotals]
    );
    const closingCashValue = useMemo(() => Number(closingCash || 0), [closingCash]);
    const difference = useMemo(() => closingCashValue - expectedCash, [expectedCash, closingCashValue]);
    const warningHours = useMemo(() => {
        const hrs = hoursOpen(activeRegister);
        return hrs >= 18 ? Math.round(hrs) : null;
    }, [activeRegister]);

    /* ── Loaders ─────────────────────────────────────────── */
    const loadActiveRegister = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await authApi.get(`/cash-registers/active?desk_id=${desk?.id}`);
            const register = res?.data ?? null;

            if (res?.meta?.expired) {
                setActiveRegister(null);
                setCashRegister(null);
                setError(`Previous register was automatically expired (exceeded ${EXPIRY_HOURS}h). Open a new one.`);
                return;
            }

            setActiveRegister(register);
            setCashRegister(register);
        } catch (err) {
            console.error("Failed to load cash register", err);
            setError("Failed to load cash register");
        } finally {
            setLoading(false);
        }
    };

    const loadRegisterPayments = async (register) => {
        const id = register?.documentId ?? register?.id;
        if (!id) return;
        setPaymentsLoading(true);
        setPaymentsError(null);
        try {
            const filters = register?.documentId
                ? { cash_register: { documentId: { $eq: id } } }
                : { cash_register: { id: { $eq: id } } };
            const res = await authApi.fetch("/payments", {
                filters,
                sort: ["payment_date:asc"],
                pagination: { page: 1, pageSize: 500 }
            });
            setRegisterPayments(res?.data ?? []);
        } catch (err) {
            console.error("Failed to load payments", err);
            setPaymentsError("Failed to load payments");
        } finally {
            setPaymentsLoading(false);
        }
    };

    const loadRegisterTransactions = async (register) => {
        const id = register?.documentId ?? register?.id;
        if (!id) return;
        try {
            const res = await authApi.fetch("/cash-register-transactions", {
                filters: { cash_register: { documentId: { $eq: id } } },
                sort: ["transaction_date:asc"],
                pagination: { page: 1, pageSize: 500 }
            });
            setRegisterTransactions(res?.data ?? []);
        } catch (err) {
            console.error("Failed to load transactions", err);
        }
    };

    /* ── Actions ─────────────────────────────────────────── */
    const handleOpenRegister = async (event) => {
        event.preventDefault();
        const branchId = branch?.documentId ?? branch?.id;
        const userId = user?.documentId ?? user?.id;
        if (!desk?.id || !branchId) return;
        setLoading(true);
        setError(null);
        try {
            const payload = {
                opening_cash: Number(openingCash || 0),
                desk_id: desk.id,
                desk_name: desk.name || "",
                branch_id: branchId,
                branch_name: branch?.name || "",
                opened_by: user?.username || user?.email || "",
                opened_by_id: user?.id ?? null,
                ...(branchId ? { branch: { connect: [branchId] } } : {}),
                ...(userId ? { opened_by_user: { connect: [userId] } } : {})
            };
            const res = await authApi.post("/cash-registers/open", { data: payload });
            const created = res?.data ?? res;
            setActiveRegister(created);
            setCashRegister(created);
            setOpeningCash("");
        } catch (err) {
            console.error("Failed to open register", err);
            const msg = err?.response?.data?.error?.message || "Failed to open register";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleCloseRegister = async (event) => {
        event.preventDefault();
        if (!activeRegister) return;
        const registerId = activeRegister?.documentId ?? activeRegister?.id;
        const userId = user?.documentId ?? user?.id;
        if (!registerId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await authApi.put(`/cash-registers/${registerId}/close`, {
                data: {
                    counted_cash: Number(closingCash || 0),
                    notes: closingNotes,
                    closed_by: user?.username || user?.email || "",
                    closed_by_id: user?.id ?? null,
                    ...(userId ? { closed_by_user: { connect: [userId] } } : {})
                }
            });
            setClosingCash("");
            setClosingNotes("");
            setCashRegister(null);
            setActiveRegister(null);
            await loadActiveRegister();
        } catch (err) {
            console.error("Failed to close register", err);
            const msg = err?.response?.data?.error?.message || "Failed to close register";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleAddTransaction = async (event) => {
        event.preventDefault();
        if (!activeRegister) return;
        const registerId = activeRegister?.documentId ?? activeRegister?.id;
        const userId = user?.documentId ?? user?.id;
        if (!registerId || !txnAmount) return;
        setTxnLoading(true);
        try {
            await authApi.post("/cash-register-transactions", {
                data: {
                    type: txnType,
                    amount: Number(txnAmount),
                    description: txnDesc,
                    transaction_date: new Date().toISOString(),
                    performed_by: user?.username || user?.email || "",
                    cash_register: { connect: [registerId] }
                }
            });
            setTxnAmount("");
            setTxnDesc("");
            await loadRegisterTransactions(activeRegister);
        } catch (err) {
            console.error("Failed to add transaction", err);
        } finally {
            setTxnLoading(false);
        }
    };

    const locationLabel = branch && desk ? `${branch.name} - ${desk.name}` : "";
    const fmt = (v) => `${currency}${Number(v || 0).toFixed(2)}`;

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                        <div>
                            <h4 className="mb-0"><i className="fas fa-cash-register me-2"></i>Cash Register</h4>
                            {locationLabel && <div className="text-muted small">{locationLabel}</div>}
                        </div>
                        <Link href="/cash-register-history" className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-history me-1"></i>History
                        </Link>
                    </div>

                    {warningHours && activeRegister && (
                        <div className="alert alert-warning py-2 d-flex align-items-center mb-3">
                            <i className="fas fa-clock me-2"></i>
                            Register open for <strong className="mx-1">{warningHours}h</strong> — auto-expires at {EXPIRY_HOURS}h.
                        </div>
                    )}

                    {error && <div className="alert alert-danger">{error}</div>}

                    {!branch || !desk ? (
                        <div className="alert alert-warning">Select a branch and desk in <a href="/settings">Settings</a> first.</div>
                    ) : !activeRegister ? (
                        /* ── Open Register Card ─────────────────── */
                        <div className="row justify-content-center">
                            <div className="col-md-6 col-lg-5">
                                <div className="card shadow">
                                    <div className="card-body p-4">
                                        <h5 className="card-title mb-3"><i className="fas fa-play-circle me-2 text-success"></i>Open Register</h5>
                                        <form onSubmit={handleOpenRegister} className="d-grid gap-3">
                                            <div>
                                                <label className="form-label">Opening Cash</label>
                                                <div className="input-group">
                                                    <span className="input-group-text">{currency}</span>
                                                    <input type="number" step="0.01" min="0" className="form-control" value={openingCash}
                                                        onChange={(e) => setOpeningCash(e.target.value)} disabled={loading} autoFocus />
                                                </div>
                                            </div>
                                            <button className="btn btn-success" type="submit" disabled={loading}>
                                                {loading ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="fas fa-cash-register me-1"></i>}
                                                Start Day
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ── Active Register Dashboard ──────────── */
                        <>
                            {/* Status bar */}
                            <div className="alert alert-info py-2 d-flex align-items-center mb-3">
                                <i className="fas fa-check-circle me-2"></i>
                                <strong>Active</strong>
                                <span className="mx-2">|</span>
                                Opened at {new Date(activeRegister.opened_at).toLocaleString()}
                                <span className="mx-2">|</span>
                                Opening: {fmt(activeRegister.opening_cash)}
                                <span className="mx-2">|</span>
                                By: {activeRegister.opened_by}
                            </div>

                            {/* Summary cards */}
                            <div className="row g-2 mb-3">
                                <div className="col-6 col-lg-2">
                                    <div className="card text-center h-100">
                                        <div className="card-body py-2">
                                            <div className="text-muted small">Opening</div>
                                            <div className="fw-bold">{fmt(openingCashValue)}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-6 col-lg-2">
                                    <div className="card text-center h-100">
                                        <div className="card-body py-2">
                                            <div className="text-muted small">Cash Sales</div>
                                            <div className="fw-bold text-success">{fmt(paymentSummary.cashNet)}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-6 col-lg-2">
                                    <div className="card text-center h-100">
                                        <div className="card-body py-2">
                                            <div className="text-muted small">Drops/Exp/Ref</div>
                                            <div className="fw-bold text-danger">{fmt(txnTotals.cashDrops + txnTotals.expenses + txnTotals.refunds)}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-6 col-lg-2">
                                    <div className="card text-center h-100 border-primary">
                                        <div className="card-body py-2">
                                            <div className="text-muted small">Expected Cash</div>
                                            <div className="fw-bold text-primary fs-5">{fmt(expectedCash)}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-6 col-lg-2">
                                    <div className="card text-center h-100">
                                        <div className="card-body py-2">
                                            <div className="text-muted small">Total Sales</div>
                                            <div className="fw-bold">{fmt(paymentSummary.total)}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-6 col-lg-2">
                                    <div className="card text-center h-100">
                                        <div className="card-body py-2">
                                            <div className="text-muted small">Card/Bank</div>
                                            <div className="fw-bold">{fmt(paymentSummary.card + paymentSummary.bank + paymentSummary.mobile)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="row g-3">
                                {/* ── Left: Close Register + Transactions ── */}
                                <div className="col-lg-5">
                                    {/* Close register */}
                                    <div className="card mb-3">
                                        <div className="card-header bg-dark text-white"><i className="fas fa-door-closed me-2"></i>Close Register</div>
                                        <div className="card-body">
                                            <form onSubmit={handleCloseRegister} className="d-grid gap-2">
                                                <div>
                                                    <label className="form-label">Counted Cash</label>
                                                    <div className="input-group">
                                                        <span className="input-group-text">{currency}</span>
                                                        <input type="number" step="0.01" className="form-control" value={closingCash}
                                                            onChange={(e) => setClosingCash(e.target.value)} required />
                                                    </div>
                                                    <div className="text-muted small mt-1">Expected: {fmt(expectedCash)}</div>
                                                    {closingCash !== "" && (
                                                        <div className={`small mt-1 ${difference >= 0 ? 'text-success' : 'text-danger'}`}>
                                                            Difference: {difference >= 0 ? '+' : ''}{fmt(difference)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="form-label">Notes (optional)</label>
                                                    <textarea className="form-control" rows="2" value={closingNotes}
                                                        onChange={(e) => setClosingNotes(e.target.value)} />
                                                </div>
                                                <button className="btn btn-primary" type="submit"
                                                    disabled={loading || paymentsLoading || closingCash === ""}>
                                                    {loading ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="fas fa-lock me-1"></i>}
                                                    Close Day
                                                </button>
                                            </form>
                                        </div>
                                    </div>

                                    {/* Add transaction */}
                                    <div className="card">
                                        <div className="card-header"><i className="fas fa-exchange-alt me-2"></i>Record Transaction</div>
                                        <div className="card-body">
                                            <form onSubmit={handleAddTransaction} className="d-grid gap-2">
                                                <div className="row g-2">
                                                    <div className="col">
                                                        <select className="form-select form-select-sm" value={txnType} onChange={(e) => setTxnType(e.target.value)}>
                                                            <option value="CashDrop">Cash Drop</option>
                                                            <option value="Expense">Expense</option>
                                                            <option value="Refund">Refund</option>
                                                            <option value="Adjustment">Adjustment</option>
                                                        </select>
                                                    </div>
                                                    <div className="col">
                                                        <div className="input-group input-group-sm">
                                                            <span className="input-group-text">{currency}</span>
                                                            <input type="number" step="0.01" min="0.01" className="form-control" value={txnAmount}
                                                                onChange={(e) => setTxnAmount(e.target.value)} placeholder="Amount" required />
                                                        </div>
                                                    </div>
                                                </div>
                                                <input type="text" className="form-control form-control-sm" value={txnDesc}
                                                    onChange={(e) => setTxnDesc(e.target.value)} placeholder="Description (optional)" />
                                                <button className="btn btn-outline-secondary btn-sm" type="submit" disabled={txnLoading || !txnAmount}>
                                                    <i className="fas fa-plus me-1"></i>Add
                                                </button>
                                            </form>

                                            {registerTransactions.length > 0 && (
                                                <div className="table-responsive mt-3">
                                                    <table className="table table-sm align-middle mb-0">
                                                        <thead><tr><th>Time</th><th>Type</th><th className="text-end">Amount</th><th>Note</th></tr></thead>
                                                        <tbody>
                                                            {registerTransactions.map((tx) => (
                                                                <tr key={tx.documentId ?? tx.id}>
                                                                    <td className="small">{new Date(tx.transaction_date).toLocaleTimeString()}</td>
                                                                    <td><span className={`badge ${tx.type === 'Adjustment' ? 'bg-info' : 'bg-secondary'}`}>{tx.type}</span></td>
                                                                    <td className="text-end">{fmt(tx.amount)}</td>
                                                                    <td className="small text-muted">{tx.description || ''}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* ── Right: Payments table ────────────── */}
                                <div className="col-lg-7">
                                    <div className="card h-100">
                                        <div className="card-header d-flex justify-content-between align-items-center">
                                            <span><i className="fas fa-list me-2"></i>Payments ({registerPayments.length})</span>
                                            <span className="badge bg-dark">{fmt(paymentSummary.total)}</span>
                                        </div>
                                        <div className="card-body p-0">
                                            {paymentsLoading && <div className="text-muted p-3">Loading payments...</div>}
                                            {paymentsError && <div className="alert alert-danger m-3">{paymentsError}</div>}
                                            {!paymentsLoading && !paymentsError && registerPayments.length === 0 && (
                                                <div className="text-muted p-3">No payments recorded yet.</div>
                                            )}
                                            {!paymentsLoading && !paymentsError && registerPayments.length > 0 && (
                                                <div className="table-responsive" style={{ maxHeight: 500, overflowY: 'auto' }}>
                                                    <table className="table table-sm table-striped align-middle mb-0">
                                                        <thead className="table-light sticky-top">
                                                            <tr>
                                                                <th>Time</th>
                                                                <th>Method</th>
                                                                <th className="text-end">Amount</th>
                                                                <th className="text-end">Received</th>
                                                                <th className="text-end">Change</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {registerPayments.map((payment) => (
                                                                <tr key={payment.documentId ?? payment.id}>
                                                                    <td className="small">{payment.payment_date ? new Date(payment.payment_date).toLocaleTimeString() : ""}</td>
                                                                    <td>{payment.payment_method}</td>
                                                                    <td className="text-end">{fmt(payment.amount)}</td>
                                                                    <td className="text-end">{payment.payment_method === 'Cash' ? fmt(payment.cash_received) : '-'}</td>
                                                                    <td className="text-end">{payment.payment_method === 'Cash' ? fmt(payment.change) : '-'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {loading && !activeRegister && <div className="text-center text-muted mt-3"><span className="spinner-border spinner-border-sm me-2"></span>Loading...</div>}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
