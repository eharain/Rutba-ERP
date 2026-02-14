import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

export default function CashRegisterPage() {
    const { branch, desk, user, currency, setCashRegister } = useUtil();
    const [activeRegister, setActiveRegister] = useState(null);
    const [openingCash, setOpeningCash] = useState("");
    const [closingCash, setClosingCash] = useState("");
    const [registerPayments, setRegisterPayments] = useState([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [paymentsError, setPaymentsError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const todayRange = useMemo(() => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        return {
            start: start.toISOString(),
            end: end.toISOString()
        };
    }, []);

    useEffect(() => {
        if (!desk?.id) return;
        loadActiveRegister();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desk?.id]);

    useEffect(() => {
        if (!activeRegister) {
            setRegisterPayments([]);
            return;
        }
        loadRegisterPayments(activeRegister);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRegister?.documentId, activeRegister?.id]);

    const paymentSummary = useMemo(() => {
        const summary = {
            total: 0,
            cash: 0,
            card: 0,
            bank: 0,
            mobile: 0,
            cashReceived: 0,
            cashChange: 0
        };

        for (const payment of registerPayments) {
            const amount = Number(payment.amount || 0);
            summary.total += amount;
            switch (payment.payment_method) {
                case "Cash":
                    summary.cash += amount;
                    summary.cashReceived += Number(payment.cash_received || amount);
                    summary.cashChange += Number(payment.change || 0);
                    break;
                case "Card":
                    summary.card += amount;
                    break;
                case "Bank":
                    summary.bank += amount;
                    break;
                case "Mobile Wallet":
                    summary.mobile += amount;
                    break;
                default:
                    break;
            }
        }

        summary.cashNet = summary.cashReceived - summary.cashChange;
        return summary;
    }, [registerPayments]);

    const openingCashValue = useMemo(() => Number(activeRegister?.opening_cash || 0), [activeRegister]);
    const expectedCash = useMemo(
        () => openingCashValue + (Number.isFinite(paymentSummary.cashNet) ? paymentSummary.cashNet : 0),
        [openingCashValue, paymentSummary.cashNet]
    );
    const closingCashValue = useMemo(() => Number(closingCash || 0), [closingCash]);
    const shortCash = useMemo(() => Math.max(expectedCash - closingCashValue, 0), [expectedCash, closingCashValue]);

    const loadActiveRegister = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await authApi.fetch("/cash-registers", {
                filters: {
                    desk_id: { $eq: desk?.id },
                    status: { $eq: "Open" },
                    opened_at: { $gte: todayRange.start, $lte: todayRange.end }
                },
                sort: ["opened_at:desc"],
                pagination: { page: 1, pageSize: 1 }
            });
            const register = res?.data?.[0] ?? null;
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
                opened_at: new Date().toISOString(),
                status: "Open",
                desk_id: desk?.id ?? null,
                desk_name: desk?.name ?? "",
                branch_id: branchId ?? null,
                branch_name: branch?.name ?? "",
                opened_by: user?.username || user?.email || "",
                opened_by_id: user?.id ?? null,
                ...(branchId ? { branch: { connect: [branchId] } } : {}),
                ...(userId ? { opened_by_user: { connect: [userId] } } : {})
            };
            const res = await authApi.post("/cash-registers", { data: payload });
            const created = res?.data ?? res;
            setActiveRegister(created);
            setCashRegister(created);
            setOpeningCash("");
        } catch (err) {
            console.error("Failed to open register", err);
            setError("Failed to open register");
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
            const closingValue = Number(closingCash || 0);
            const expectedValue = Number.isFinite(expectedCash) ? expectedCash : 0;
            const shortCashValue = Math.max(expectedValue - closingValue, 0);
            const payload = {
                closing_cash: closingValue,
                short_cash: shortCashValue,
                closed_at: new Date().toISOString(),
                status: "Closed",
                closed_by: user?.username || user?.email || "",
                closed_by_id: user?.id ?? null,
                ...(userId ? { closed_by_user: { connect: [userId] } } : {})
            };
            await authApi.put(`/cash-registers/${registerId}`, { data: payload });
            setClosingCash("");
            setCashRegister(null);
            await loadActiveRegister();
        } catch (err) {
            console.error("Failed to close register", err);
            setError("Failed to close register");
        } finally {
            setLoading(false);
        }
    };

    const locationLabel = branch && desk ? `${branch.name} - ${desk.name}` : "";
    const openedAtLabel = activeRegister?.opened_at
        ? new Date(activeRegister.opened_at).toLocaleString()
        : "Unknown";
    const totalPaymentLabel = `${currency}${Number(paymentSummary.total || 0).toFixed(2)}`;
    const expectedCashLabel = `${currency}${Number(expectedCash || 0).toFixed(2)}`;
    const shortCashLabel = `${currency}${Number(shortCash || 0).toFixed(2)}`;

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    <h1>Cash Register</h1>
                    {locationLabel && <div className="text-muted mb-3">{locationLabel}</div>}
                    {!branch || !desk ? (
                        <div className="alert alert-warning">Select a branch and desk in settings first.</div>
                    ) : (
                        <div className="row g-3">
                            <div className="col-lg-6">
                                <div className="card">
                                    <div className="card-body">
                                        <h5 className="card-title">Open Register</h5>
                                        <form onSubmit={handleOpenRegister} className="d-grid gap-2">
                                            <div>
                                                <label className="form-label">Opening Cash</label>
                                                <div className="input-group">
                                                    <span className="input-group-text">{currency}</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="form-control"
                                                        value={openingCash}
                                                        onChange={(e) => setOpeningCash(e.target.value)}
                                                        disabled={loading || !!activeRegister}
                                                    />
                                                </div>
                                            </div>
                                            <button className="btn btn-success" type="submit" disabled={loading || !!activeRegister}>
                                                                            <i className="fas fa-cash-register me-1"></i>Start Day
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                            <div className="col-lg-6">
                                <div className="card">
                                    <div className="card-body">
                                        <h5 className="card-title">Close Register</h5>
                                        <form onSubmit={handleCloseRegister} className="d-grid gap-2">
                                            <div>
                                                <label className="form-label">Closing Cash</label>
                                                <div className="input-group">
                                                    <span className="input-group-text">{currency}</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="form-control"
                                                        value={closingCash}
                                                        onChange={(e) => setClosingCash(e.target.value)}
                                                        disabled={loading || !activeRegister}
                                                        required
                                                    />
                                                </div>
                                                {activeRegister && (
                                                    <div className="text-muted small mt-1">
                                                        Expected cash: {expectedCashLabel}
                                                    </div>
                                                )}
                                                {activeRegister && shortCash > 0 && (
                                                    <div className="text-danger small mt-1">
                                                        Short cash: {shortCashLabel}
                                                    </div>
                                                )}
                                            </div>
                                            <button className="btn btn-primary" type="submit" disabled={loading || paymentsLoading || !activeRegister || closingCash === ""}>
                                                                            <i className="fas fa-door-closed me-1"></i>Close Day
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeRegister && (
                        <div className="card mt-3">
                            <div className="card-body">
                                <h5 className="card-title">Register Payments</h5>
                                <div className="row g-2 mb-3">
                                    <div className="col-sm-6 col-lg-3">
                                        <div className="border rounded p-2 h-100">
                                            <div className="text-muted small">Total</div>
                                            <div className="fw-bold">{totalPaymentLabel}</div>
                                        </div>
                                    </div>
                                    <div className="col-sm-6 col-lg-3">
                                        <div className="border rounded p-2 h-100">
                                            <div className="text-muted small">Cash</div>
                                            <div className="fw-bold">{currency}{Number(paymentSummary.cash || 0).toFixed(2)}</div>
                                        </div>
                                    </div>
                                    <div className="col-sm-6 col-lg-3">
                                        <div className="border rounded p-2 h-100">
                                            <div className="text-muted small">Card</div>
                                            <div className="fw-bold">{currency}{Number(paymentSummary.card || 0).toFixed(2)}</div>
                                        </div>
                                    </div>
                                    <div className="col-sm-6 col-lg-3">
                                        <div className="border rounded p-2 h-100">
                                            <div className="text-muted small">Bank + Wallet</div>
                                            <div className="fw-bold">{currency}{Number(paymentSummary.bank + paymentSummary.mobile || 0).toFixed(2)}</div>
                                        </div>
                                    </div>
                                </div>
                                {paymentsLoading && <div className="text-muted">Loading payments...</div>}
                                {paymentsError && <div className="alert alert-danger">{paymentsError}</div>}
                                {!paymentsLoading && !paymentsError && registerPayments.length === 0 && (
                                    <div className="text-muted">No payments recorded for this register yet.</div>
                                )}
                                {!paymentsLoading && !paymentsError && registerPayments.length > 0 && (
                                    <div className="table-responsive">
                                        <table className="table table-sm align-middle">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Method</th>
                                                    <th className="text-end">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {registerPayments.map((payment) => (
                                                    <tr key={payment.documentId ?? payment.id}>
                                                        <td>{payment.payment_date ? new Date(payment.payment_date).toLocaleString() : ""}</td>
                                                        <td>{payment.payment_method}</td>
                                                        <td className="text-end">{currency}{Number(payment.amount || 0).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {activeRegister && (
                        <div className="alert alert-info mt-3">
                            Opened at {openedAtLabel} with {currency}{Number(activeRegister.opening_cash || 0).toFixed(2)}
                        </div>
                    )}
                    {loading && <div className="text-muted mt-2">Loading...</div>}
                    {error && <div className="alert alert-danger mt-3">{error}</div>}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}


export async function getServerSideProps() { return { props: {} }; }
