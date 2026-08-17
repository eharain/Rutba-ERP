import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { SeedEndpoints } from "@rutba/api-provider/endpoints";

function errMessage(err) {
    const status = err?.response?.status;
    if (status === 403) return "You don't have access to the seed run history.";
    return err?.response?.data?.error?.message || err?.message || "Request failed";
}

function badge(status) {
    const map = { ok: "bg-success", failed: "bg-danger", running: "bg-warning text-dark" };
    return <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>;
}

function RunHistory() {
    const { jwt } = useAuth();
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [open, setOpen] = useState(() => new Set());

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await SeedEndpoints.listRuns({ limit: 100 });
            setRuns(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(errMessage(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (jwt) load(); }, [jwt, load]);

    const toggle = (id) => setOpen((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    return (
        <>
            <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="mb-0">Seed run history</h2>
                <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
                    <i className="fa-solid fa-rotate me-1" /> Refresh
                </button>
            </div>

            {error && <div className="alert alert-warning">{error}</div>}
            {loading && <div className="text-center text-muted py-5"><span className="spinner-border" /></div>}

            {!loading && runs.length === 0 && !error && (
                <p className="text-muted">No seed runs recorded yet.</p>
            )}

            {runs.map((r) => {
                const results = Array.isArray(r.results) ? r.results : [];
                const isOpen = open.has(r.id);
                return (
                    <div className="card mb-2" key={r.id}>
                        <div className="card-body py-2 d-flex align-items-center gap-3 flex-wrap"
                            role="button" onClick={() => toggle(r.id)}>
                            <i className={`fa-solid ${isOpen ? "fa-chevron-down" : "fa-chevron-right"} text-muted`} />
                            <span className="small text-muted">{r.started_at ? new Date(r.started_at).toLocaleString() : "—"}</span>
                            <span className="badge bg-light text-dark border">{r.mode}</span>
                            {badge(r.status)}
                            <span className="small">+{r.created_count} ~{r.updated_count}</span>
                            <span className="small text-success">{r.ok_count} ok</span>
                            {r.failed_count > 0 && <span className="small text-danger">{r.failed_count} failed</span>}
                            <span className="ms-auto text-muted small">{r.source} · {r.triggered_by}</span>
                        </div>
                        {isOpen && results.length > 0 && (
                            <div className="table-responsive border-top">
                                <table className="table table-sm mb-0 align-middle">
                                    <thead><tr>
                                        <th>Seeder</th><th>Status</th><th className="text-end">Created</th>
                                        <th className="text-end">Updated</th><th className="text-end">ms</th><th>Error</th>
                                    </tr></thead>
                                    <tbody>
                                        {results.map((x) => (
                                            <tr key={x.key} className={x.status === "failed" ? "table-danger" : undefined}>
                                                <td><code>{x.key}</code></td>
                                                <td>{badge(x.status)}</td>
                                                <td className="text-end">{x.created ?? 0}</td>
                                                <td className="text-end">{x.updated ?? 0}</td>
                                                <td className="text-end text-muted">{x.ms}</td>
                                                <td className="text-danger small">{x.error || ""}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}

export default function HistoryPage() {
    return (
        <ProtectedRoute>
            <Layout>
                <RunHistory />
            </Layout>
        </ProtectedRoute>
    );
}
