import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { ContactTicketsEndpoints } from "@rutba/api-provider/endpoints";

const CATEGORIES = ["IT", "HR", "Facilities"];

export default function Tickets() {
    const { jwt } = useAuth();
    const [tickets, setTickets] = useState([]);
    const [team, setTeam] = useState([]);
    const [hasTeam, setHasTeam] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ category: "IT", subject: "", message: "" });
    const [actionLoading, setActionLoading] = useState({});

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await ContactTicketsEndpoints.listMine();
            setTickets(res?.data || []);
        } catch (err) {
            console.error("Failed to load tickets", err);
        }
        try {
            const res = await ContactTicketsEndpoints.listTeam();
            setTeam(res?.data || []);
            setHasTeam(true);
        } catch (err) {
            setHasTeam(false);
            setTeam([]);
        } finally {
            setLoading(false);
        }
    }

    async function submit(e) {
        e.preventDefault();
        if (!form.subject || !form.message) return;
        setSaving(true);
        try {
            await ContactTicketsEndpoints.submitInternal(form);
            setForm({ category: "IT", subject: "", message: "" });
            await load();
        } catch (err) {
            console.error("Failed to submit ticket", err);
            alert("Failed to submit ticket.");
        } finally {
            setSaving(false);
        }
    }

    async function resolve(documentId) {
        setActionLoading((p) => ({ ...p, [documentId]: true }));
        try {
            await ContactTicketsEndpoints.resolve(documentId);
            await load();
        } catch (err) {
            console.error("Failed to resolve ticket", err);
            alert("Failed to resolve ticket.");
        } finally {
            setActionLoading((p) => ({ ...p, [documentId]: false }));
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Helpdesk Tickets</h2>

                <div className="card mb-4">
                    <div className="card-header bg-light fw-semibold">Submit a Ticket</div>
                    <div className="card-body">
                        <form onSubmit={submit} className="row g-2 align-items-end">
                            <div className="col-md-2">
                                <label className="form-label">Category</label>
                                <select className="form-select" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="col-md-4">
                                <label className="form-label">Subject</label>
                                <input className="form-control" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} required />
                            </div>
                            <div className="col-md-5">
                                <label className="form-label">Message</label>
                                <input className="form-control" value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} required />
                            </div>
                            <div className="col-md-1 d-grid">
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "..." : "Submit"}</button>
                            </div>
                        </form>
                    </div>
                </div>

                {loading && <p>Loading…</p>}
                {!loading && tickets.length === 0 && <div className="alert alert-info">No tickets yet.</div>}
                {!loading && tickets.length > 0 && (
                    <div className="table-responsive mb-4">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr><th>Category</th><th>Subject</th><th>Status</th><th>Submitted</th></tr>
                            </thead>
                            <tbody>
                                {tickets.map((t) => (
                                    <tr key={t.id}>
                                        <td>{t.category}</td>
                                        <td>{t.subject}</td>
                                        <td><span className={`badge bg-${statusColor(t.status)}`}>{t.status}</span></td>
                                        <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && hasTeam && (
                    <>
                        <h2 className="mb-3 mt-4">Team Tickets</h2>
                        {team.length === 0
                            ? <div className="alert alert-info">No open tickets from your team.</div>
                            : (
                                <div className="table-responsive">
                                    <table className="table table-striped table-hover align-middle">
                                        <thead className="table-dark">
                                            <tr><th>Employee</th><th>Category</th><th>Subject</th><th>Status</th><th>Action</th></tr>
                                        </thead>
                                        <tbody>
                                            {team.map((t) => (
                                                <tr key={t.id}>
                                                    <td>{t.employee?.name || "—"}</td>
                                                    <td>{t.category}</td>
                                                    <td>{t.subject}</td>
                                                    <td><span className={`badge bg-${statusColor(t.status)}`}>{t.status}</span></td>
                                                    <td>
                                                        {t.status !== "resolved" && (
                                                            <button className="btn btn-sm btn-success" onClick={() => resolve(t.documentId)} disabled={actionLoading[t.documentId]}>Resolve</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

function statusColor(status) {
    switch (status) {
        case "resolved": return "success";
        case "open": return "warning";
        case "in_progress": return "primary";
        case "waiting": return "secondary";
        default: return "secondary";
    }
}
