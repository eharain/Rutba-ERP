import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin } from "@rutba/pos-shared/lib/roles";
import { CashRegistersEndpoints, PaymentsEndpoints, CashRegisterTransactionEndpoints, AppContextEndpoints } from "@rutba/api-provider/endpoints/index.js";

const EXPIRY_HOURS = 20;

function hoursOpen(register) {
    if (!register?.opened_at) return 0;
    return (Date.now() - new Date(register.opened_at).getTime()) / (60 * 60 * 1000);
}

export default function CashRegisterPage() {
    const { branch, desk, user, currency, setCashRegister, ensureBranchDesk } = useUtil();
    const { adminAppAccess, activeRoleKey } = useAuth();
    const userIsAdmin = isAppAdmin(adminAppAccess, AppContextEndpoints.getAppName());
    const userIsManager = typeof activeRoleKey === 'string' && /(?:^|_)manager$/.test(activeRoleKey);
    const userIsPrivileged = userIsAdmin || userIsManager;
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

    // Close-day two-step confirmation: first click arms a short-lived
    // "Confirm Close" button (auto-disarms after ~4s) to avoid accidental
    // closes — second click within the window actually closes.
    const [closeArmed, setCloseArmed] = useState(false);
    const closeArmTimerRef = useRef(null);
    useEffect(() => () => { if (closeArmTimerRef.current) clearTimeout(closeArmTimerRef.current); }, []);
    const handleCloseDayClick = (event) => {
        event.preventDefault();
        if (!closeArmed) {
            setCloseArmed(true);
            if (closeArmTimerRef.current) clearTimeout(closeArmTimerRef.current);
            closeArmTimerRef.current = setTimeout(() => setCloseArmed(false), 4000);
            return;
        }
        if (closeArmTimerRef.current) clearTimeout(closeArmTimerRef.current);
        setCloseArmed(false);
        handleCloseRegister(event);
    };

    useEffect(() => {
        if (!desk?.id && !user?.id) return;
        loadActiveRegister();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desk?.id, user?.id]);

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
                    // Only count positive (sale) payments toward cashReceived/cashChange;
                    // refund payments (negative amount) are tracked via Refund transactions.
                    if (amount >= 0) {
                        summary.cashReceived += Number(payment.cash_received || amount);
                        summary.cashChange += Number(payment.change || 0);
                    }
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
        const t = { cashDrops: 0, topups: 0, expenses: 0, refunds: 0, adjustments: 0 };
        for (const tx of registerTransactions) {
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
    }, [registerTransactions]);

    /* ── Ledger: same chronological cash-impact view as cash-register-detail ── */
    const ledger = useMemo(() => {
        const rows = [];
        if (activeRegister?.opened_at) {
            rows.push({
                date: activeRegister.opened_at,
                kind: 'Open',
                method: '',
                description: `Opened by ${activeRegister.opened_by || '—'}`,
                inAmt: Number(activeRegister.opening_cash || 0),
                outAmt: 0,
                cashImpact: Number(activeRegister.opening_cash || 0),
            });
        }
        for (const p of registerPayments) {
            const isCash = p.payment_method === 'Cash';
            const amt = Number(p.amount || 0);
            const cashReceived = Number(p.cash_received || 0);
            const change = Number(p.change || 0);
            const cashFlow = isCash ? (cashReceived || change ? cashReceived - change : amt) : 0;
            rows.push({
                date: p.payment_date,
                kind: 'Payment',
                method: p.payment_method || '',
                description: p.transaction_no || '',
                inAmt: cashFlow > 0 ? cashFlow : 0,
                outAmt: cashFlow < 0 ? -cashFlow : 0,
                cashImpact: cashFlow,
                tenderAmount: amt,
            });
        }
        for (const tx of registerTransactions) {
            const amt = Number(tx.amount || 0);
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
            });
        }
        rows.sort((a, b) => new Date(a.date) - new Date(b.date));
        let balance = 0;
        for (const r of rows) { balance += Number(r.cashImpact || 0); r.balance = balance; }
        return rows;
    }, [activeRegister, registerPayments, registerTransactions]);

    const openingCashValue = useMemo(() => Number(activeRegister?.opening_cash || 0), [activeRegister]);
    const expectedCash = useMemo(
        () => openingCashValue
            + (Number.isFinite(paymentSummary.cashNet) ? paymentSummary.cashNet : 0)
            - txnTotals.refunds
            - txnTotals.expenses
            - txnTotals.cashDrops
            + txnTotals.topups
            + txnTotals.adjustments,
        [openingCashValue, paymentSummary.cashNet, txnTotals]
    );
    const closingCashValue = useMemo(() => Number(closingCash || 0), [closingCash]);
    const difference = useMemo(() => closingCashValue - expectedCash, [expectedCash, closingCashValue]);
    const isExpired = activeRegister?.status === 'Expired';
    const warningHours = useMemo(() => {
        const hrs = hoursOpen(activeRegister);
        return hrs >= 18 ? Math.round(hrs) : null;
    }, [activeRegister]);

    /* ── Loaders ─────────────────────────────────────────── */
    const loadActiveRegister = async () => {
        setLoading(true);
        setError(null);
        try {
            const userId = user?.documentId ?? user?.id;
            const res = await CashRegistersEndpoints.fetchActive({ deskId: desk?.id, userId });
            const register = res?.data ?? null;

            if (res?.meta?.expired) {
                setActiveRegister(res.meta.expired);
                setCashRegister(null);
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
            const res = await PaymentsEndpoints.fetchByRegister(id, {
                useDocumentId: !!register?.documentId,
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
            const res = await CashRegisterTransactionEndpoints.fetchByRegister(id);
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
            const res = await CashRegistersEndpoints.postOpen(payload);
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
            const res = await CashRegistersEndpoints.postClose(registerId, {
                    counted_cash: Number(closingCash || 0),
                    notes: closingNotes,
                    closed_by: user?.username || user?.email || "",
                    closed_by_id: user?.id ?? null,
                    ...(userId ? { closed_by_user: { connect: [userId] } } : {})
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
            await CashRegisterTransactionEndpoints.postCreate({
                    type: txnType,
                    amount: Number(txnAmount),
                    description: txnDesc,
                    transaction_date: new Date().toISOString(),
                    performed_by: user?.username || user?.email || "",
                    cash_register: { connect: [registerId] }
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
                        {userIsPrivileged && (
                            <Link href="/cash-register-history" className="btn btn-outline-secondary btn-sm">
                                <i className="fas fa-history me-1"></i>History
                            </Link>
                        )}
                    </div>

                    {isExpired && activeRegister && (
                        <div className="alert alert-danger py-2 d-flex align-items-center mb-3">
                            <i className="fas fa-exclamation-triangle me-2"></i>
                            <span>This register has <strong>expired</strong> (exceeded {EXPIRY_HOURS}h). No new transactions allowed. Please close the register below.</span>
                        </div>
                    )}
                    {warningHours && activeRegister && !isExpired && (
                        <div className="alert alert-warning py-2 d-flex align-items-center mb-3">
                            <i className="fas fa-clock me-2"></i>
                            Register open for <strong className="mx-1">{warningHours}h</strong> — auto-expires at {EXPIRY_HOURS}h.
                        </div>
                    )}

                    {error && <div className="alert alert-danger">{error}</div>}

                    {!branch || !desk ? (
                        <div className="row justify-content-center">
                            <div className="col-md-6 col-lg-5">
                                <div className="card shadow">
                                    <div className="card-body p-4 text-center">
                                        <i className="fas fa-store fa-3x text-muted mb-3"></i>
                                        <h5>No Branch &amp; Desk Selected</h5>
                                        <p className="text-muted mb-3">Select a branch and desk to start using the cash register.</p>
                                        <button className="btn btn-primary" onClick={() => ensureBranchDesk()}>
                                            <i className="fas fa-cog me-2"></i>Select Branch &amp; Desk
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
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
                            {/* Cross-desk notice */}
                            {activeRegister && desk?.id && activeRegister.desk_id && Number(activeRegister.desk_id) !== Number(desk.id) && (
                                <div className="alert alert-info py-2 d-flex align-items-center mb-2">
                                    <i className="fas fa-exchange-alt me-2"></i>
                                    <span>
                                        This register was opened on <strong>{activeRegister.desk_name || `Desk ${activeRegister.desk_id}`}</strong>.
                                        You are currently on <strong>{desk.name || `Desk ${desk.id}`}</strong>.
                                    </span>
                                </div>
                            )}
                            {/* Status bar */}
                            <div className={`alert ${isExpired ? 'alert-danger' : 'alert-info'} py-2 d-flex align-items-center mb-3`}>
                                <i className={`fas ${isExpired ? 'fa-exclamation-triangle' : 'fa-check-circle'} me-2`}></i>
                                <strong>{isExpired ? 'Expired' : 'Active'}</strong>
                                <span className="mx-2">|</span>
                                Opened at {new Date(activeRegister.opened_at).toLocaleString()}
                                <span className="mx-2">|</span>
                                Opening: {fmt(activeRegister.opening_cash)}
                                <span className="mx-2">|</span>
                                By: {activeRegister.opened_by}
                            </div>

                            {/* ── Record Transaction strip (first line) ── */}
                            {!isExpired && (
                                <div className="card mb-2">
                                    <div className="card-body py-2">
                                        <form onSubmit={handleAddTransaction} className="row g-2 align-items-center">
                                            <div className="col-auto text-muted small" style={{ minWidth: 70 }}>
                                                <i className="fas fa-exchange-alt me-1"></i>Record
                                            </div>
                                            <div className="col-12 col-md-2">
                                                <select className="form-select form-select-sm" value={txnType} onChange={(e) => setTxnType(e.target.value)}>
                                                    <option value="CashDrop">Cash Drop</option>
                                                    <option value="CashTopUp">Cash Top-Up</option>
                                                    <option value="Expense">Expense</option>
                                                    <option value="Refund">Refund</option>
                                                    <option value="Adjustment">Adjustment</option>
                                                </select>
                                            </div>
                                            <div className="col-12 col-md-2">
                                                <div className="input-group input-group-sm">
                                                    <span className="input-group-text">{currency}</span>
                                                    <input type="number" step="0.01" min="0.01" className="form-control" value={txnAmount}
                                                        onChange={(e) => setTxnAmount(e.target.value)} placeholder="Amount" required />
                                                </div>
                                            </div>
                                            <div className="col">
                                                <input type="text" className="form-control form-control-sm" value={txnDesc}
                                                    onChange={(e) => setTxnDesc(e.target.value)} placeholder="Description (optional)" />
                                            </div>
                                            <div className="col-auto">
                                                <button className="btn btn-primary btn-sm" type="submit" disabled={txnLoading || !txnAmount}>
                                                    {txnLoading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-plus me-1"></i>}
                                                    Add
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {/* ── Close Day strip (same single-line shape, right under Record) ── */}
                            <div className="card mb-3">
                                <div className="card-body py-2">
                                    {isExpired && !userIsPrivileged ? (
                                        <div className="text-warning small mb-0">
                                            <i className="fas fa-lock me-1"></i>
                                            Register expired — only a <strong>manager</strong> or <strong>admin</strong> can close it.
                                        </div>
                                    ) : (
                                        <form onSubmit={handleCloseDayClick} className="row g-2 align-items-center">
                                            <div className="col-auto text-muted small" style={{ minWidth: 70 }}>
                                                <i className="fas fa-door-closed me-1"></i>Close
                                            </div>
                                            <div className="col-12 col-md-3">
                                                <div className="input-group input-group-sm">
                                                    <span className="input-group-text">{currency}</span>
                                                    <input type="number" step="0.01" className="form-control" value={closingCash}
                                                        onChange={(e) => setClosingCash(e.target.value)} placeholder={`Counted (exp. ${expectedCash.toFixed(2)})`} required />
                                                </div>
                                            </div>
                                            <div className="col-auto small">
                                                {closingCash !== "" && (
                                                    <span className={difference >= 0 ? 'text-success' : 'text-danger'}>
                                                        Diff: {difference >= 0 ? '+' : ''}{fmt(difference)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="col">
                                                <input type="text" className="form-control form-control-sm" value={closingNotes}
                                                    onChange={(e) => setClosingNotes(e.target.value)} placeholder="Notes (optional)" />
                                            </div>
                                            <div className="col-auto">
                                                <button
                                                    className={`btn btn-sm ${closeArmed ? 'btn-danger' : 'btn-dark'}`}
                                                    type="submit"
                                                    disabled={loading || paymentsLoading || closingCash === ""}
                                                    title={closeArmed ? 'Click again to confirm — auto-cancels in a few seconds' : ''}
                                                >
                                                    {loading
                                                        ? <span className="spinner-border spinner-border-sm me-1"></span>
                                                        : <i className={`fas ${closeArmed ? 'fa-exclamation-triangle' : 'fa-lock'} me-1`}></i>}
                                                    {closeArmed ? 'Confirm Close' : 'Close Day'}
                                                </button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </div>

                            {/* spacer — summary cards now live in the left sidebar of the row below */}

                            <div className="row g-3">
                                {/* ── Left sidebar: summary metrics stacked vertically ── */}
                                <div className="col-lg-3">
                                    <div className="d-grid gap-2">
                                        <div className="card"><div className="card-body py-2 text-center">
                                            <div className="text-muted small">Opening</div>
                                            <div className="fw-bold">{fmt(openingCashValue)}</div>
                                        </div></div>
                                        <div className="card"><div className="card-body py-2 text-center">
                                            <div className="text-muted small">Cash Sales</div>
                                            <div className="fw-bold text-success">{fmt(paymentSummary.cashNet)}</div>
                                        </div></div>
                                        <div className="card"><div className="card-body py-2 text-center">
                                            <div className="text-muted small">Drops / Expenses / Refunds</div>
                                            <div className="fw-bold text-danger">{fmt(txnTotals.cashDrops + txnTotals.expenses + txnTotals.refunds)}</div>
                                        </div></div>
                                        <div className="card"><div className="card-body py-2 text-center">
                                            <div className="text-muted small">Top-Ups</div>
                                            <div className="fw-bold text-info">{fmt(txnTotals.topups)}</div>
                                        </div></div>
                                        <div className="card border-primary"><div className="card-body py-2 text-center">
                                            <div className="text-muted small">Expected Cash</div>
                                            <div className="fw-bold text-primary fs-5">{fmt(expectedCash)}</div>
                                        </div></div>
                                        <div className="card"><div className="card-body py-2 text-center">
                                            <div className="text-muted small">Total Sales (all methods)</div>
                                            <div className="fw-bold">{fmt(paymentSummary.total)}</div>
                                        </div></div>
                                        <div className="card"><div className="card-body py-2 text-center">
                                            <div className="text-muted small">Card / Bank / Wallet</div>
                                            <div className="fw-bold">{fmt(paymentSummary.card + paymentSummary.bank + paymentSummary.mobile)}</div>
                                        </div></div>
                                    </div>
                                </div>

                                {/* ── Right column: Payments table + Ledger view ── */}
                                <div className="col-lg-9">
                                    <div className="card mb-3">
                                        <div className="card-header d-flex justify-content-between align-items-center py-2">
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
                                                <div className="table-responsive" style={{ maxHeight: 360, overflowY: 'auto' }}>
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
                                                        <tfoot className="table-light">
                                                            {paymentSummary.cash !== 0 && (
                                                                <tr>
                                                                    <td colSpan={2} className="text-end fw-semibold">Cash</td>
                                                                    <td className="text-end">{fmt(paymentSummary.cash)}</td>
                                                                    <td className="text-end">{fmt(paymentSummary.cashReceived)}</td>
                                                                    <td className="text-end">{fmt(paymentSummary.cashChange)}</td>
                                                                </tr>
                                                            )}
                                                            {paymentSummary.card !== 0 && (
                                                                <tr>
                                                                    <td colSpan={2} className="text-end fw-semibold">Card</td>
                                                                    <td className="text-end">{fmt(paymentSummary.card)}</td>
                                                                    <td></td><td></td>
                                                                </tr>
                                                            )}
                                                            {paymentSummary.bank !== 0 && (
                                                                <tr>
                                                                    <td colSpan={2} className="text-end fw-semibold">Bank</td>
                                                                    <td className="text-end">{fmt(paymentSummary.bank)}</td>
                                                                    <td></td><td></td>
                                                                </tr>
                                                            )}
                                                            {paymentSummary.mobile !== 0 && (
                                                                <tr>
                                                                    <td colSpan={2} className="text-end fw-semibold">Mobile Wallet</td>
                                                                    <td className="text-end">{fmt(paymentSummary.mobile)}</td>
                                                                    <td></td><td></td>
                                                                </tr>
                                                            )}
                                                            <tr className="table-primary">
                                                                <td colSpan={2} className="text-end fw-bold">Total</td>
                                                                <td className="text-end fw-bold">{fmt(paymentSummary.total)}</td>
                                                                <td></td><td></td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Ledger view: chronological cash-impact with running balance ── */}
                                    <div className="card">
                                        <div className="card-header py-2">
                                            <i className="fas fa-book me-2"></i>Ledger
                                            <span className="badge bg-secondary ms-2">{ledger.length}</span>
                                        </div>
                                        <div className="card-body p-0">
                                            {ledger.length === 0 ? (
                                                <div className="text-muted p-3">No activity yet.</div>
                                            ) : (
                                                <div className="table-responsive" style={{ maxHeight: 500, overflowY: 'auto' }}>
                                                    <table className="table table-sm table-striped align-middle mb-0">
                                                        <thead className="table-light sticky-top">
                                                            <tr>
                                                                <th>Time</th>
                                                                <th>Kind</th>
                                                                <th>Method</th>
                                                                <th>Description</th>
                                                                <th className="text-end text-success">In</th>
                                                                <th className="text-end text-danger">Out</th>
                                                                <th className="text-end">Balance</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {ledger.map((r, i) => {
                                                                const kindClass = {
                                                                    Open: 'bg-primary',
                                                                    Payment: r.cashImpact > 0 ? 'bg-success' : r.cashImpact < 0 ? 'bg-danger' : 'bg-light text-dark',
                                                                    CashTopUp: 'bg-success',
                                                                    CashDrop: 'bg-warning text-dark',
                                                                    Expense: 'bg-danger',
                                                                    Refund: 'bg-danger',
                                                                    Adjustment: 'bg-info',
                                                                }[r.kind] || 'bg-secondary';
                                                                return (
                                                                    <tr key={i}>
                                                                        <td className="small text-nowrap">{r.date ? new Date(r.date).toLocaleTimeString() : '-'}</td>
                                                                        <td><span className={`badge ${kindClass}`}>{r.kind}</span></td>
                                                                        <td className="small">{r.method || '—'}</td>
                                                                        <td className="small">
                                                                            {r.description || '—'}
                                                                            {r.kind === 'Payment' && r.method !== 'Cash' && r.tenderAmount != null && (
                                                                                <span className="text-muted ms-2">(tender {fmt(r.tenderAmount)})</span>
                                                                            )}
                                                                            {r.performedBy && <span className="text-muted ms-2">• {r.performedBy}</span>}
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
                                                                <td colSpan={4} className="text-end">Totals:</td>
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


