import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import { authApi } from "../lib/api";
import { useUtil } from "../context/UtilContext";

export default function CashRegisterPage() {
    const { branch, desk, user, currency } = useUtil();
    const [activeRegister, setActiveRegister] = useState(null);
    const [openingCash, setOpeningCash] = useState("");
    const [closingCash, setClosingCash] = useState("");
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
        } catch (err) {
            console.error("Failed to load cash register", err);
            setError("Failed to load cash register");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenRegister = async (event) => {
        event.preventDefault();
        const branchId = branch?.id ?? branch?.documentId;
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
                opened_by_id: user?.id ?? null
            };
            const res = await authApi.post("/cash-registers", { data: payload });
            const created = res?.data ?? res;
            setActiveRegister(created);
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
        if (!registerId) return;
        setLoading(true);
        setError(null);
        try {
            const payload = {
                closing_cash: Number(closingCash || 0),
                closed_at: new Date().toISOString(),
                status: "Closed",
                closed_by: user?.username || user?.email || "",
                closed_by_id: user?.id ?? null
            };
            await authApi.put(`/cash-registers/${registerId}`, { data: payload });
            setClosingCash("");
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
                                                Start Day
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
                                                    />
                                                </div>
                                            </div>
                                            <button className="btn btn-primary" type="submit" disabled={loading || !activeRegister}>
                                                Close Day
                                            </button>
                                        </form>
                                    </div>
                                </div>
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
