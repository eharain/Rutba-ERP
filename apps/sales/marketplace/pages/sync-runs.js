import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { MarketplaceSyncLogsEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";

const STATUS_VARIANT = { success: "success", partial: "warning", error: "danger", running: "info" };

function fmt(d) { return d ? new Date(d).toLocaleString() : "—"; }
function duration(a, b) {
    if (!a || !b) return "—";
    const ms = new Date(b).getTime() - new Date(a).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "—";
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function SyncRunsPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await MarketplaceSyncLogsEndpoints.list({
                sort: ["createdAt:desc"],
                populate: ["marketplace_account"],
                pageSize: 100,
            });
            setLogs(res.data || []);
        } catch (err) {
            console.error("Failed to load sync runs", err);
            toast("Failed to load sync runs.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-rotate me-2"></i>Sync Runs</h3>
                    <button className="btn btn-outline-secondary btn-sm" onClick={load}><i className="fas fa-arrows-rotate me-1"></i>Refresh</button>
                </div>

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : logs.length === 0 ? (
                    <div className="alert alert-info">No sync runs yet. They appear here once the worker (or a manual trigger) runs.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>When</th><th>Account</th><th>Kind</th><th>Status</th>
                                    <th className="text-end">Fetched</th><th className="text-end">Created</th>
                                    <th className="text-end">Updated</th><th className="text-end">Failed</th>
                                    <th className="text-end" title="Rows that completed but need a look — e.g. an order created with line items whose SKU matched no product.">Attention</th>
                                    <th>Took</th><th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((l) => (
                                    <React.Fragment key={l.id}>
                                        <tr>
                                            <td className="small">{fmt(l.started_at || l.createdAt)}</td>
                                            <td className="small">{l.marketplace_account?.account_name || "—"}<span className="text-muted"> ({l.platform})</span></td>
                                            <td><span className="badge bg-light text-dark border text-capitalize">{l.kind}</span></td>
                                            <td><span className={`badge bg-${STATUS_VARIANT[l.status] || "secondary"}`}>{l.status}</span></td>
                                            <td className="text-end">{l.fetched ?? 0}</td>
                                            <td className="text-end">{l.created ?? 0}</td>
                                            <td className="text-end">{l.updated ?? 0}</td>
                                            <td className="text-end">{l.failed ? <span className="text-danger fw-bold">{l.failed}</span> : 0}</td>
                                            <td className="text-end">{l.attention ? <span className="text-warning-emphasis fw-bold"><i className="fas fa-triangle-exclamation me-1"></i>{l.attention}</span> : 0}</td>
                                            <td className="small">{duration(l.started_at, l.finished_at)}</td>
                                            <td>
                                                {(l.error || l.attention > 0 || (Array.isArray(l.detail) && l.detail.length)) ? (
                                                    <button className="btn btn-sm btn-link p-0" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                                                        {expanded === l.id ? "hide" : "details"}
                                                    </button>
                                                ) : null}
                                            </td>
                                        </tr>
                                        {expanded === l.id && (
                                            <tr>
                                                <td colSpan={11} className="bg-light">
                                                    {l.error && <div className="text-danger small mb-2"><strong>Error:</strong> {l.error}</div>}
                                                    {l.attention > 0 && (
                                                        <div className="alert alert-warning py-2 px-3 small mb-2">
                                                            <i className="fas fa-triangle-exclamation me-1"></i>
                                                            <strong>{l.attention}</strong> order(s) were created with line items whose SKU matched no product.
                                                            The orders are real and safe to process — but those lines carry no product link, so stock is
                                                            not attributed. The unmatched SKUs are listed under <code>unmatched_skus</code> below (and on
                                                            each order&apos;s <code>channel_meta</code>). Add or correct the product SKU, then re-check the order.
                                                        </div>
                                                    )}
                                                    {Array.isArray(l.detail) && l.detail.length > 0 && (
                                                        <pre className="small mb-0" style={{ maxHeight: 240, overflow: "auto" }}>{JSON.stringify(l.detail, null, 2)}</pre>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
