import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { CrmActivitiesEndpoints } from "@rutba/api-provider/endpoints";

const WINDOWS = [
    { key: "overdue", label: "Overdue" },
    { key: "today", label: "Today" },
    { key: "week", label: "Next 7 days" },
    { key: "all", label: "All open" },
];

const PAGE_SIZE = 25;

export default function Followups() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [window_, setWindow] = useState("week");
    const [mine, setMine] = useState(false);
    const [page, setPage] = useState(1);
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        CrmActivitiesEndpoints.listFollowups({ window: window_, mine, page, pageSize: PAGE_SIZE })
            .then((res) => {
                setRows(res?.data || []);
                setTotal(res?.meta?.pagination?.total || 0);
            })
            .catch((err) => console.error("Failed to load follow-ups", err))
            .finally(() => setLoading(false));
    }, [jwt, window_, mine, page]);

    useEffect(() => { load(); }, [load]);

    const close = async (row) => {
        setBusyId(row.documentId);
        try {
            await CrmActivitiesEndpoints.markFollowupDone(row.documentId, { done: true });
            load();
        } catch (err) {
            console.error("Failed to close the follow-up", err);
            alert("Failed to close the follow-up.");
        } finally {
            setBusyId(null);
        }
    };

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h2 className="mb-0">Follow-ups</h2>
                        <small className="text-muted">Open reminders from logged activities, most overdue first.</small>
                    </div>
                </div>

                <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
                    <div className="btn-group">
                        {WINDOWS.map((w) => (
                            <button
                                key={w.key}
                                className={`btn ${window_ === w.key ? "btn-secondary" : "btn-outline-secondary"}`}
                                onClick={() => { setPage(1); setWindow(w.key); }}
                            >
                                {w.label}
                            </button>
                        ))}
                    </div>
                    <div className="form-check">
                        <input
                            className="form-check-input"
                            type="checkbox"
                            id="mine"
                            checked={mine}
                            onChange={(e) => { setPage(1); setMine(e.target.checked); }}
                        />
                        <label className="form-check-label" htmlFor="mine">Only mine</label>
                    </div>
                    <span className="text-muted ms-auto">{total} open</span>
                </div>

                {loading && <p>Loading follow-ups…</p>}

                {!loading && rows.length === 0 && (
                    <div className="alert alert-success">
                        <i className="fas fa-check me-2"></i>Nothing due in this window.
                    </div>
                )}

                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Due</th>
                                    <th>Subject</th>
                                    <th>Next step</th>
                                    <th>Contact</th>
                                    <th>Lead</th>
                                    <th className="text-end"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => {
                                    const overdue = new Date(r.followup_at) < new Date();
                                    return (
                                        <tr key={r.documentId}>
                                            <td>
                                                <span className={`badge ${overdue ? "bg-danger" : "bg-warning text-dark"}`}>
                                                    {new Date(r.followup_at).toLocaleString()}
                                                </span>
                                            </td>
                                            <td>
                                                {r.subject}
                                                <div><span className="badge bg-secondary">{r.type || "Note"}</span></div>
                                            </td>
                                            <td>{r.followup_note || <span className="text-muted">—</span>}</td>
                                            <td>
                                                {r.contact ? (
                                                    <Link href={`/${r.contact.documentId}/contact`}>{r.contact.name}</Link>
                                                ) : "—"}
                                            </td>
                                            <td>
                                                {r.lead ? (
                                                    <Link href={`/${r.lead.documentId}/lead`}>{r.lead.name}</Link>
                                                ) : "—"}
                                            </td>
                                            <td className="text-end">
                                                <button
                                                    className="btn btn-sm btn-outline-success"
                                                    disabled={busyId === r.documentId}
                                                    onClick={() => close(r)}
                                                >
                                                    <i className="fas fa-check me-1"></i>Done
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {pageCount > 1 && (
                    <nav className="d-flex justify-content-between align-items-center">
                        <span className="text-muted small">Page {page} of {pageCount}</span>
                        <div className="btn-group">
                            <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                <i className="fas fa-chevron-left"></i> Prev
                            </button>
                            <button className="btn btn-sm btn-outline-secondary" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                                Next <i className="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </nav>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
