import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrLeaveRequestsEndpoints } from "@rutba/api-provider/endpoints";

const LEAVE_TYPES = ["Annual", "Sick", "Casual", "Maternity", "Paternity", "Unpaid", "Other"];

export default function MyLeave() {
    const { jwt } = useAuth();
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [actionLoading, setActionLoading] = useState({});
    const [form, setForm] = useState({ leave_type: "Annual", start_date: "", end_date: "", reason: "" });

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await HrLeaveRequestsEndpoints.listMyRequests();
            setLeaves(res?.data || []);
        } catch (err) {
            console.error("Failed to load leave", err);
        } finally {
            setLoading(false);
        }
    }

    async function submit(e) {
        e.preventDefault();
        if (!form.start_date || !form.end_date) return;
        if (form.end_date < form.start_date) { alert("End date cannot be before start date."); return; }
        setSaving(true);
        try {
            await HrLeaveRequestsEndpoints.create({
                leave_type: form.leave_type,
                start_date: form.start_date,
                end_date: form.end_date,
                reason: form.reason || null,
                status: "Pending",
            });
            setForm({ leave_type: "Annual", start_date: "", end_date: "", reason: "" });
            await load();
        } catch (err) {
            console.error("Failed to submit leave", err);
            alert("Failed to submit leave request.");
        } finally {
            setSaving(false);
        }
    }

    async function cancel(documentId) {
        if (!confirm("Cancel this leave request?")) return;
        setActionLoading((p) => ({ ...p, [documentId]: true }));
        try {
            await HrLeaveRequestsEndpoints.cancel(documentId);
            await load();
        } catch (err) {
            console.error("Failed to cancel leave", err);
            alert("Failed to cancel.");
        } finally {
            setActionLoading((p) => ({ ...p, [documentId]: false }));
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">My Leave</h2>

                <div className="card mb-4">
                    <div className="card-header bg-light fw-semibold">Apply for Leave</div>
                    <div className="card-body">
                        <form onSubmit={submit}>
                            <div className="row g-2 align-items-end">
                                <div className="col-md-2">
                                    <label className="form-label">Type</label>
                                    <select className="form-select" value={form.leave_type} onChange={(e) => setForm((p) => ({ ...p, leave_type: e.target.value }))}>
                                        {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">From</label>
                                    <input type="date" className="form-control" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} required />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">To</label>
                                    <input type="date" className="form-control" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} required />
                                </div>
                                <div className="col-md-5">
                                    <label className="form-label">Reason</label>
                                    <input className="form-control" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
                                </div>
                                <div className="col-md-1 d-grid">
                                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "..." : "Apply"}</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                {loading && <p>Loading…</p>}
                {!loading && leaves.length === 0 && <div className="alert alert-info">No leave requests yet.</div>}
                {!loading && leaves.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Reason</th><th></th></tr>
                            </thead>
                            <tbody>
                                {leaves.map((l) => (
                                    <tr key={l.id}>
                                        <td>{l.leave_type || "—"}</td>
                                        <td>{l.start_date ? new Date(l.start_date).toLocaleDateString() : "—"}</td>
                                        <td>{l.end_date ? new Date(l.end_date).toLocaleDateString() : "—"}</td>
                                        <td>{l.total_days ?? "—"}</td>
                                        <td><span className={`badge bg-${statusColor(l.status)}`}>{l.status || "Pending"}</span></td>
                                        <td>{l.reason || "—"}</td>
                                        <td>
                                            {(l.status === "Pending" || l.status === "Approved") && (
                                                <button className="btn btn-sm btn-outline-secondary" onClick={() => cancel(l.documentId)} disabled={actionLoading[l.documentId]}>Cancel</button>
                                            )}
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
