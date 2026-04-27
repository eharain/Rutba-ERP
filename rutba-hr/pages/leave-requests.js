import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

const LEAVE_TYPES = ["Annual", "Sick", "Casual", "Maternity", "Paternity", "Unpaid", "Other"];

export default function LeaveRequests() {
    const { jwt, adminAppAccess } = useAuth();
    const [leaves, setLeaves] = useState([]);
    const [teamQueue, setTeamQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [actionLoading, setActionLoading] = useState({});
    const [tab, setTab] = useState("my");
    const [newRequest, setNewRequest] = useState({
        leave_type: "Annual",
        start_date: "",
        end_date: "",
        reason: "",
    });

    const isManager = Array.isArray(adminAppAccess) && (adminAppAccess.includes("hr") || adminAppAccess.includes("auth"));

    useEffect(() => {
        if (jwt) loadAll();
    }, [jwt]);

    async function loadAll() {
        setLoading(true);
        try {
            const [myRes, teamRes] = await Promise.all([
                authApi.get("/hr-leave-requests/my-requests", {}, jwt),
                isManager ? authApi.get("/hr-leave-requests/team-queue", {}, jwt) : Promise.resolve({ data: [] }),
            ]);
            setLeaves(myRes?.data || []);
            setTeamQueue(teamRes?.data || []);
        } catch (err) {
            console.error("Failed to load leave requests", err);
        } finally {
            setLoading(false);
        }
    }

    async function submitRequest(e) {
        e.preventDefault();
        if (!newRequest.start_date || !newRequest.end_date) return;
        setSaving(true);
        try {
            await authApi.post("/hr-leave-requests", {
                data: {
                    leave_type: newRequest.leave_type,
                    start_date: newRequest.start_date,
                    end_date: newRequest.end_date,
                    reason: newRequest.reason || null,
                    status: "Pending",
                },
            }, jwt);
            setNewRequest({ leave_type: "Annual", start_date: "", end_date: "", reason: "" });
            await loadAll();
        } catch (err) {
            console.error("Failed to submit leave request", err);
        } finally {
            setSaving(false);
        }
    }

    async function processRequest(documentId, action) {
        const key = `${documentId}:${action}`;
        setActionLoading((p) => ({ ...p, [key]: true }));
        try {
            await authApi.post(`/hr-leave-requests/${documentId}/${action}`, {}, jwt);
            await loadAll();
        } catch (err) {
            console.error(`Failed to ${action} leave request`, err);
        } finally {
            setActionLoading((p) => ({ ...p, [key]: false }));
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Leave Requests</h2>

                <div className="card mb-4">
                    <div className="card-header bg-light fw-semibold">Submit Leave Request</div>
                    <div className="card-body">
                        <form onSubmit={submitRequest}>
                            <div className="row g-2 align-items-end">
                                <div className="col-md-2">
                                    <label className="form-label">Type</label>
                                    <select className="form-select" value={newRequest.leave_type} onChange={(e) => setNewRequest((p) => ({ ...p, leave_type: e.target.value }))}>
                                        {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">From</label>
                                    <input type="date" className="form-control" value={newRequest.start_date} onChange={(e) => setNewRequest((p) => ({ ...p, start_date: e.target.value }))} required />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">To</label>
                                    <input type="date" className="form-control" value={newRequest.end_date} onChange={(e) => setNewRequest((p) => ({ ...p, end_date: e.target.value }))} required />
                                </div>
                                <div className="col-md-5">
                                    <label className="form-label">Reason</label>
                                    <input className="form-control" value={newRequest.reason} onChange={(e) => setNewRequest((p) => ({ ...p, reason: e.target.value }))} />
                                </div>
                                <div className="col-md-1 d-grid">
                                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "..." : "Submit"}</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button className={`nav-link ${tab === "my" ? "active" : ""}`} onClick={() => setTab("my")}>My Requests</button>
                    </li>
                    {isManager && (
                        <li className="nav-item">
                            <button className={`nav-link ${tab === "team" ? "active" : ""}`} onClick={() => setTab("team")}>Team Queue</button>
                        </li>
                    )}
                </ul>

                {loading && <p>Loading leave requests...</p>}

                {!loading && tab === "my" && leaves.length === 0 && (
                    <div className="alert alert-info">No leave requests found.</div>
                )}

                {!loading && tab === "team" && teamQueue.length === 0 && (
                    <div className="alert alert-info">No pending team requests found.</div>
                )}

                {!loading && tab === "my" && leaves.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Employee</th>
                                    <th>Type</th>
                                    <th>From</th>
                                    <th>To</th>
                                    <th>Status</th>
                                    <th>Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaves.map((l) => (
                                    <tr key={l.id}>
                                        <td>{l.employee?.name || "—"}</td>
                                        <td>{l.leave_type || "—"}</td>
                                        <td>{l.start_date ? new Date(l.start_date).toLocaleDateString() : "—"}</td>
                                        <td>{l.end_date ? new Date(l.end_date).toLocaleDateString() : "—"}</td>
                                        <td>
                                            <span className={`badge bg-${leaveStatusColor(l.status)}`}>
                                                {l.status || "Pending"}
                                            </span>
                                        </td>
                                        <td>{l.reason || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && tab === "team" && teamQueue.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Employee</th>
                                    <th>Type</th>
                                    <th>From</th>
                                    <th>To</th>
                                    <th>Status</th>
                                    <th>Reason</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {teamQueue.map((l) => (
                                    <tr key={l.id}>
                                        <td>{l.employee?.name || "—"}</td>
                                        <td>{l.leave_type || "—"}</td>
                                        <td>{l.start_date ? new Date(l.start_date).toLocaleDateString() : "—"}</td>
                                        <td>{l.end_date ? new Date(l.end_date).toLocaleDateString() : "—"}</td>
                                        <td>
                                            <span className={`badge bg-${leaveStatusColor(l.status)}`}>
                                                {l.status || "Pending"}
                                            </span>
                                        </td>
                                        <td>{l.reason || "—"}</td>
                                        <td>
                                            <div className="d-flex gap-1">
                                                <button className="btn btn-sm btn-success" onClick={() => processRequest(l.documentId, "approve")} disabled={actionLoading[`${l.documentId}:approve`]}>Approve</button>
                                                <button className="btn btn-sm btn-danger" onClick={() => processRequest(l.documentId, "reject")} disabled={actionLoading[`${l.documentId}:reject`]}>Reject</button>
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

function leaveStatusColor(status) {
    switch (status) {
        case "Approved": return "success";
        case "Rejected": return "danger";
        case "Pending": return "warning";
        default: return "secondary";
    }
}

