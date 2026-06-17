import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrLeaveRequestsEndpoints } from "@rutba/api-provider/endpoints";

// HR-department, org-wide leave oversight. Personal self-service (apply / my
// requests) and line-manager approvals now live in the Employee Self-Service
// (ess) app; HR managers retain org-wide approve/reject here.
const STATUSES = ["", "Pending", "Approved", "Rejected", "Cancelled"];

export default function LeaveAdministration() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("Pending");
    const [actionLoading, setActionLoading] = useState({});

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt, status]);

    async function load() {
        setLoading(true);
        try {
            const res = await HrLeaveRequestsEndpoints.list({
                sort: ["createdAt:desc"],
                populate: ["employee", "decided_by"],
                pageSize: 200,
                ...(status ? { filters: { status } } : {}),
            });
            setRows(res?.data || []);
        } catch (err) {
            console.error("Failed to load leave requests", err);
        } finally {
            setLoading(false);
        }
    }

    async function decide(documentId, action) {
        const key = `${documentId}:${action}`;
        let reason = null;
        if (action === "reject") { reason = window.prompt("Reason for rejection (optional):"); if (reason === null) return; }
        setActionLoading((p) => ({ ...p, [key]: true }));
        try {
            if (action === "approve") await HrLeaveRequestsEndpoints.approve(documentId);
            else await HrLeaveRequestsEndpoints.reject(documentId, { reason: reason || null });
            await load();
        } catch (err) {
            console.error(`Failed to ${action}`, err);
            alert(`Failed to ${action} — you may not have approval rights.`);
        } finally {
            setActionLoading((p) => ({ ...p, [key]: false }));
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 className="mb-0">Leave Administration</h2>
                    <div className="d-flex align-items-center gap-2">
                        <label className="form-label mb-0 small text-muted">Status</label>
                        <select className="form-select form-select-sm" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
                            {STATUSES.map((s) => <option key={s || "all"} value={s}>{s || "All"}</option>)}
                        </select>
                    </div>
                </div>
                <p className="text-muted small">Org-wide oversight. HR managers can approve/reject; employees apply and managers approve their own teams in the Employee Self-Service app.</p>

                {loading && <p>Loading…</p>}
                {!loading && rows.length === 0 && <div className="alert alert-info">No leave requests{status ? ` with status "${status}"` : ""}.</div>}
                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover align-middle">
                            <thead className="table-dark">
                                <tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Reason</th><th>Decided by</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {rows.map((l) => (
                                    <tr key={l.id}>
                                        <td>{l.employee?.name || "—"}</td>
                                        <td>{l.leave_type || "—"}</td>
                                        <td>{l.start_date ? new Date(l.start_date).toLocaleDateString() : "—"}</td>
                                        <td>{l.end_date ? new Date(l.end_date).toLocaleDateString() : "—"}</td>
                                        <td>{l.total_days ?? "—"}</td>
                                        <td><span className={`badge bg-${statusColor(l.status)}`}>{l.status || "Pending"}</span></td>
                                        <td>{l.reason || "—"}</td>
                                        <td className="small">{l.decided_by?.username || l.decided_by?.email || "—"}</td>
                                        <td>
                                            {l.status === "Pending" ? (
                                                <div className="d-flex gap-1">
                                                    <button className="btn btn-sm btn-success" onClick={() => decide(l.documentId, "approve")} disabled={actionLoading[`${l.documentId}:approve`]}>Approve</button>
                                                    <button className="btn btn-sm btn-danger" onClick={() => decide(l.documentId, "reject")} disabled={actionLoading[`${l.documentId}:reject`]}>Reject</button>
                                                </div>
                                            ) : (l.rejection_reason ? <span className="text-muted small">{l.rejection_reason}</span> : "—")}
                                        </td>
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

function statusColor(status) {
    switch (status) {
        case "Approved": return "success";
        case "Rejected": return "danger";
        case "Pending": return "warning";
        case "Cancelled": return "secondary";
        default: return "secondary";
    }
}
