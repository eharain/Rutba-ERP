import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { ContactTicketsEndpoints } from "@rutba/api-provider/endpoints";

export default function Tickets() {
    const { jwt } = useAuth();
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState({});

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await ContactTicketsEndpoints.listTeam();
            setTickets(res?.data || []);
        } catch (err) {
            console.error("Failed to load tickets", err);
        } finally {
            setLoading(false);
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
                <h2 className="mb-3">Helpdesk Queue</h2>
                <p className="text-muted small">Open IT/HR/Facilities tickets across the organization.</p>

                {loading && <p>Loading…</p>}
                {!loading && tickets.length === 0 && <div className="alert alert-info">No open tickets.</div>}
                {!loading && tickets.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover align-middle">
                            <thead className="table-dark">
                                <tr><th>Employee</th><th>Category</th><th>Subject</th><th>Message</th><th>Status</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                {tickets.map((t) => (
                                    <tr key={t.id}>
                                        <td>{t.employee?.name || "—"}</td>
                                        <td>{t.category}</td>
                                        <td>{t.subject}</td>
                                        <td>{t.message}</td>
                                        <td><span className={`badge bg-${t.status === "resolved" ? "success" : "warning"}`}>{t.status}</span></td>
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
            </Layout>
        </ProtectedRoute>
    );
}
