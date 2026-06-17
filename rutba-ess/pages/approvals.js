import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrLeaveRequestsEndpoints } from "@rutba/api-provider/endpoints";

export default function Approvals() {
    const { jwt } = useAuth();
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [denied, setDenied] = useState(false);
    const [actionLoading, setActionLoading] = useState({});

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await HrLeaveRequestsEndpoints.listTeamQueue();
            setQueue(res?.data || []);
            setDenied(false);
        } catch (err) {
            // ess_employee (no manager role) is denied the queue — show a friendly note.
            setDenied(true);
            setQueue([]);
        } finally {
            setLoading(false);
        }
    }

    async function decide(documentId, action) {
        const key = `${documentId}:${action}`;
        let reason = null;
        if (action === "reject") {
            reason = window.prompt("Reason for rejection (optional):");
            if (reason === null) return;
        }
        setActionLoading((p) => ({ ...p, [key]: true }));
        try {
            if (action === "approve") await HrLeaveRequestsEndpoints.approve(documentId);
            else await HrLeaveRequestsEndpoints.reject(documentId, { reason: reason || null });
            await load();
        } catch (err) {
            console.error(`Failed to ${action}`, err);
            alert(`Failed to ${action} the request.`);
        } finally {
            setActionLoading((p) => ({ ...p, [key]: false }));
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Approvals</h2>
                <p className="text-muted small">Pending leave requests from your team.</p>

                {loading && <p>Loading…</p>}
                {!loading && denied && <div className="alert alert-secondary">You don't manage a team, so there's nothing to approve here.</div>}
                {!loading && !denied && queue.length === 0 && <div className="alert alert-info">No pending requests.</div>}
                {!loading && !denied && queue.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover align-middle">
                            <thead className="table-dark">
                                <tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {queue.map((l) => (
                                    <tr key={l.id}>
                                        <td>{l.employee?.name || "—"}</td>
                                        <td>{l.leave_type || "—"}</td>
                                        <td>{l.start_date ? new Date(l.start_date).toLocaleDateString() : "—"}</td>
                                        <td>{l.end_date ? new Date(l.end_date).toLocaleDateString() : "—"}</td>
                                        <td>{l.total_days ?? "—"}</td>
                                        <td>{l.reason || "—"}</td>
                                        <td>
                                            <div className="d-flex gap-1">
                                                <button className="btn btn-sm btn-success" onClick={() => decide(l.documentId, "approve")} disabled={actionLoading[`${l.documentId}:approve`]}>Approve</button>
                                                <button className="btn btn-sm btn-danger" onClick={() => decide(l.documentId, "reject")} disabled={actionLoading[`${l.documentId}:reject`]}>Reject</button>
                                            </div>
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
