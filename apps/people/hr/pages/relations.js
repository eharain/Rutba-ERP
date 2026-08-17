import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    HrGrievancesEndpoints,
    HrDisciplinaryActionsEndpoints,
    HrIncidentReportsEndpoints,
    HrComplianceItemsEndpoints,
} from "@rutba/api-provider/endpoints";

const GRIEVANCE_VARIANT = { Open: "warning", UnderReview: "info", Resolved: "success", Closed: "secondary" };
const SEVERITY_VARIANT = { Low: "secondary", Medium: "info", High: "warning", Critical: "danger" };
const COMPLIANCE_VARIANT = { Valid: "success", ExpiringSoon: "warning", Expired: "danger", Waived: "secondary" };

function fmt(d) {
    return d ? new Date(d).toLocaleDateString() : "—";
}

const TABS = [
    { key: "grievances", label: "Grievances", icon: "fa-comment-dots" },
    { key: "disciplinary", label: "Disciplinary", icon: "fa-gavel" },
    { key: "incidents", label: "Safety", icon: "fa-triangle-exclamation" },
    { key: "compliance", label: "Compliance", icon: "fa-shield-halved" },
];

export default function Relations() {
    const { jwt } = useAuth();
    const [tab, setTab] = useState("grievances");
    const [data, setData] = useState({ grievances: [], disciplinary: [], incidents: [], compliance: [] });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState({});

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        const [g, d, i, c] = await Promise.allSettled([
            HrGrievancesEndpoints.listQueue(),
            HrDisciplinaryActionsEndpoints.list({ pageSize: 200 }),
            HrIncidentReportsEndpoints.list({ pageSize: 200 }),
            HrComplianceItemsEndpoints.listExpiring(),
        ]);
        setData({
            grievances: g.status === "fulfilled" ? g.value?.data || [] : [],
            disciplinary: d.status === "fulfilled" ? d.value?.data || [] : [],
            incidents: i.status === "fulfilled" ? i.value?.data || [] : [],
            compliance: c.status === "fulfilled" ? c.value?.data || [] : [],
        });
        setLoading(false);
    }

    async function resolveGrievance(g) {
        const resolution = window.prompt("Resolution notes:");
        if (resolution === null) return;
        setBusy((p) => ({ ...p, [g.documentId]: true }));
        try {
            await HrGrievancesEndpoints.resolve(g.documentId, { status: "Resolved", resolution });
            await load();
        } catch (err) {
            console.error("Resolve failed", err);
            alert("Could not resolve this grievance.");
        } finally {
            setBusy((p) => ({ ...p, [g.documentId]: false }));
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Employee Relations</h2>
                <p className="text-muted small mb-3">
                    Grievances, disciplinary records, safety incidents and expiring compliance documents.
                </p>

                <ul className="nav nav-tabs mb-3">
                    {TABS.map((t) => (
                        <li className="nav-item" key={t.key}>
                            <button type="button" className={`nav-link ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
                                <i className={`fa-solid ${t.icon} me-1`}></i>{t.label}
                                {data[t.key].length > 0 && <span className="badge bg-secondary ms-2">{data[t.key].length}</span>}
                            </button>
                        </li>
                    ))}
                </ul>

                {loading && <p>Loading…</p>}

                {!loading && tab === "grievances" && (
                    data.grievances.length === 0 ? <div className="alert alert-info">No open grievances.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>Subject</th><th>From</th><th>Category</th><th>Raised</th><th>Status</th><th></th></tr></thead>
                                <tbody>
                                    {data.grievances.map((g) => (
                                        <tr key={g.id}>
                                            <td>
                                                <div className="fw-semibold">{g.subject}</div>
                                                {g.description && <div className="small text-muted">{g.description}</div>}
                                            </td>
                                            {/* the API nulls `employee` on anonymous rows before they leave the server */}
                                            <td>{g.is_anonymous ? <em className="text-muted">Anonymous</em> : (g.employee?.name || "—")}</td>
                                            <td>{g.category}</td>
                                            <td>{fmt(g.createdAt)}</td>
                                            <td><span className={`badge bg-${GRIEVANCE_VARIANT[g.status] || "secondary"}`}>{g.status}</span></td>
                                            <td>
                                                <button className="btn btn-sm btn-outline-success" onClick={() => resolveGrievance(g)} disabled={busy[g.documentId]}>
                                                    Resolve
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}

                {!loading && tab === "disciplinary" && (
                    data.disciplinary.length === 0 ? <div className="alert alert-info">No disciplinary records.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>Employee</th><th>Type</th><th>Date</th><th>Reason</th><th>Acknowledged</th></tr></thead>
                                <tbody>
                                    {data.disciplinary.map((d) => (
                                        <tr key={d.id}>
                                            <td>{d.employee?.name || "—"}</td>
                                            <td><span className="badge bg-warning text-dark">{d.type}</span></td>
                                            <td>{fmt(d.action_date)}</td>
                                            <td className="small">{d.reason || "—"}</td>
                                            <td>{d.acknowledged_at ? fmt(d.acknowledged_at) : <span className="text-muted">pending</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}

                {!loading && tab === "incidents" && (
                    data.incidents.length === 0 ? <div className="alert alert-info">No incidents reported.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>When</th><th>Type</th><th>Severity</th><th>Location</th><th>Description</th><th>Status</th></tr></thead>
                                <tbody>
                                    {data.incidents.map((i) => (
                                        <tr key={i.id}>
                                            <td>{fmt(i.incident_date)}</td>
                                            <td>{i.type}</td>
                                            <td><span className={`badge bg-${SEVERITY_VARIANT[i.severity] || "secondary"}`}>{i.severity}</span></td>
                                            <td>{i.location || "—"}</td>
                                            <td className="small">{i.description || "—"}</td>
                                            <td>{i.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}

                {!loading && tab === "compliance" && (
                    data.compliance.length === 0 ? <div className="alert alert-success">Nothing expiring in the next 60 days.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>Employee</th><th>Type</th><th>Reference</th><th>Expires</th><th>Status</th></tr></thead>
                                <tbody>
                                    {data.compliance.map((c) => (
                                        <tr key={c.id}>
                                            <td>{c.employee?.name || "—"}</td>
                                            <td>{c.type}</td>
                                            <td className="small text-muted">{c.reference || "—"}</td>
                                            <td>{fmt(c.expiry_date)}</td>
                                            <td><span className={`badge bg-${COMPLIANCE_VARIANT[c.status] || "secondary"}`}>{c.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </Layout>
        </ProtectedRoute>
    );
}
