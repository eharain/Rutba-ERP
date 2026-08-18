import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { CmpRunsEndpoints } from "@rutba/api-provider/endpoints";

const STATE_BADGE = { Submitting: "secondary", Running: "primary", Completed: "success", Failed: "danger" };

export default function RunsPage() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        CmpRunsEndpoints.list({ pageSize: 50 })
            .then((res) => setRows(res?.data || []))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Delivery</h2>
                {error && <div className="alert alert-danger">{error}</div>}
                {loading ? (
                    <p className="text-muted">Loading…</p>
                ) : rows.length === 0 ? (
                    <div className="alert alert-light border">No runs yet — run a campaign to see delivery here.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle">
                            <thead><tr><th>Campaign</th><th>Started</th><th>State</th><th>Total</th><th>Sent</th><th>Bounced</th><th>Unsub</th><th></th></tr></thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.documentId}>
                                        <td>{r.campaign?.name || "—"}</td>
                                        <td className="small">{r.started_at ? new Date(r.started_at).toLocaleString() : ""}</td>
                                        <td><span className={`badge bg-${STATE_BADGE[r.state] || "secondary"}`}>{r.state}</span></td>
                                        <td>{r.total ?? ""}</td>
                                        <td>{r.sent ?? ""}</td>
                                        <td>{(r.bounced_hard || 0) + (r.bounced_soft || 0) || ""}</td>
                                        <td>{r.unsubscribed ?? ""}</td>
                                        <td><Link href={`/runs/${r.documentId}`}>detail</Link></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
