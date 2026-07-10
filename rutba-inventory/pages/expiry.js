import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { StockItemsEndpoints } from "@rutba/api-provider/endpoints";

const WINDOWS = [7, 30, 60, 90];

export default function ExpiryPage() {
    const { jwt } = useAuth();
    const [days, setDays] = useState(30);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sweeping, setSweeping] = useState(false);
    const [msg, setMsg] = useState(null);

    const notify = (text, variant = "success") => setMsg({ text, variant });

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await StockItemsEndpoints.getExpiring(days);
            setRows(res?.data || []);
        } catch (e) {
            console.error("Failed to load expiring stock", e);
            notify("Failed to load expiring stock.", "danger");
        } finally { setLoading(false); }
    }, [jwt, days]);

    useEffect(() => { load(); }, [load]);

    const sweep = async () => {
        if (!window.confirm("Flip every InStock unit already past its expiry date to Expired? This drops them from on-hand.")) return;
        setSweeping(true);
        try {
            const res = await StockItemsEndpoints.sweepExpired();
            notify(`Swept ${res?.expired || 0} expired unit(s).`);
            await load();
        } catch (e) {
            console.error("sweep failed", e);
            notify(e?.response?.data?.error?.message || "Sweep failed.", "danger");
        } finally { setSweeping(false); }
    };

    const daysLeft = (d) => (d ? Math.round((new Date(d).getTime() - Date.now()) / 86400000) : null);
    const expiredCount = rows.filter((r) => { const dl = daysLeft(r.expiry_date); return dl != null && dl < 0; }).length;

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-hourglass-half me-2 text-danger"></i>Expiry</h3>
                    <button className="btn btn-outline-danger btn-sm" onClick={sweep} disabled={sweeping}>
                        {sweeping ? <><span className="spinner-border spinner-border-sm me-1"></span>Sweeping…</> : <><i className="fas fa-broom me-1"></i>Sweep expired</>}
                    </button>
                </div>
                <p className="text-muted small mb-3">
                    InStock units expiring within the window (soonest first). &ldquo;Sweep expired&rdquo; flips already-expired
                    units to <code>Expired</code>, dropping them from on-hand. Units get an expiry from the Batches screen.
                </p>

                {msg && (
                    <div className={`alert alert-${msg.variant} alert-dismissible py-2`}>
                        {msg.text}<button type="button" className="btn-close" onClick={() => setMsg(null)}></button>
                    </div>
                )}

                <div className="d-flex gap-2 align-items-center mb-3">
                    <span className="small text-muted">Window:</span>
                    <div className="btn-group btn-group-sm">
                        {WINDOWS.map((w) => (
                            <button key={w} className={`btn ${days === w ? "btn-danger" : "btn-outline-danger"}`} onClick={() => setDays(w)}>{w}d</button>
                        ))}
                    </div>
                    {expiredCount > 0 && <span className="badge bg-danger ms-2">{expiredCount} already expired</span>}
                    <button className="btn btn-outline-secondary btn-sm ms-auto" onClick={load} disabled={loading}><i className="fas fa-rotate"></i></button>
                </div>

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : rows.length === 0 ? (
                    <div className="alert alert-success">Nothing expiring within {days} days. 🎉</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle">
                            <thead><tr><th>Product</th><th>Barcode</th><th>Batch</th><th>Warehouse</th><th>Expiry</th><th className="text-end">Days left</th></tr></thead>
                            <tbody>
                                {rows.map((r) => {
                                    const dl = daysLeft(r.expiry_date);
                                    return (
                                        <tr key={r.documentId || r.id} className={dl != null && dl < 0 ? "table-danger" : ""}>
                                            <td>{r.product?.name || <span className="text-muted">(unnamed)</span>}</td>
                                            <td><code>{r.barcode || "—"}</code></td>
                                            <td>{r.batch?.batch_code || "—"}</td>
                                            <td>{r.warehouse?.name || "—"}</td>
                                            <td>{r.expiry_date || "—"}</td>
                                            <td className="text-end">
                                                <span className={dl == null ? "" : dl < 0 ? "text-danger fw-semibold" : dl <= 7 ? "text-warning fw-semibold" : ""}>{dl == null ? "—" : dl}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
