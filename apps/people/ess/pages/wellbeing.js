import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import EnumSelect from "@rutba/shared/components/EnumSelect";
import { HrGrievancesEndpoints, HrIncidentReportsEndpoints } from "@rutba/api-provider/endpoints";

const GRIEVANCE_VARIANT = { Open: "warning", UnderReview: "info", Resolved: "success", Closed: "secondary" };
const INCIDENT_VARIANT = { Reported: "warning", UnderInvestigation: "info", Resolved: "success", Closed: "secondary" };

function fmt(d) {
    return d ? new Date(d).toLocaleDateString() : "—";
}

export default function Wellbeing() {
    const { jwt } = useAuth();
    const [tab, setTab] = useState("grievance");
    const [grievances, setGrievances] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [gForm, setGForm] = useState({ subject: "", description: "", category: "Other", is_anonymous: false });
    const [iForm, setIForm] = useState({ incident_date: "", location: "", type: "Other", severity: "Low", description: "" });

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        const [g, i] = await Promise.allSettled([
            HrGrievancesEndpoints.listMine(),
            HrIncidentReportsEndpoints.listMine(),
        ]);
        if (g.status === "fulfilled") setGrievances(g.value?.data || []);
        if (i.status === "fulfilled") setIncidents(i.value?.data || []);
        setLoading(false);
    }

    async function submitGrievance(e) {
        e.preventDefault();
        if (!gForm.subject.trim()) return;
        setBusy(true);
        try {
            await HrGrievancesEndpoints.submit({ ...gForm });
            setGForm({ subject: "", description: "", category: "Other", is_anonymous: false });
            await load();
        } catch (err) {
            console.error("Grievance submit failed", err);
            alert("Could not submit. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    async function submitIncident(e) {
        e.preventDefault();
        if (!iForm.description.trim()) return;
        setBusy(true);
        try {
            await HrIncidentReportsEndpoints.report({
                ...iForm,
                incident_date: iForm.incident_date || new Date().toISOString(),
            });
            setIForm({ incident_date: "", location: "", type: "Other", severity: "Low", description: "" });
            await load();
        } catch (err) {
            console.error("Incident report failed", err);
            alert("Could not submit the report. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Raise a Concern</h2>
                <p className="text-muted small mb-3">
                    Grievances go directly to HR — never to your line manager. Safety incidents alert the HR team immediately.
                </p>

                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button type="button" className={`nav-link ${tab === "grievance" ? "active" : ""}`} onClick={() => setTab("grievance")}>
                            <i className="fa-solid fa-comment-dots me-1"></i>Grievance
                        </button>
                    </li>
                    <li className="nav-item">
                        <button type="button" className={`nav-link ${tab === "incident" ? "active" : ""}`} onClick={() => setTab("incident")}>
                            <i className="fa-solid fa-triangle-exclamation me-1"></i>Safety Incident
                        </button>
                    </li>
                </ul>

                {tab === "grievance" && (
                    <>
                        <form className="card card-body mb-4" onSubmit={submitGrievance}>
                            <div className="row g-2">
                                <div className="col-md-8">
                                    <label className="form-label small">Subject</label>
                                    <input className="form-control" value={gForm.subject}
                                        onChange={(e) => setGForm((p) => ({ ...p, subject: e.target.value }))} required />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label small">Category</label>
                                    <EnumSelect name="hr-grievance" field="category" value={gForm.category}
                                        onChange={(e) => setGForm((p) => ({ ...p, category: e.target.value }))} />
                                </div>
                                <div className="col-12">
                                    <label className="form-label small">What happened?</label>
                                    <textarea className="form-control" rows={3} value={gForm.description}
                                        onChange={(e) => setGForm((p) => ({ ...p, description: e.target.value }))} />
                                </div>
                                <div className="col-12 d-flex justify-content-between align-items-center flex-wrap gap-2">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="anon" checked={gForm.is_anonymous}
                                            onChange={(e) => setGForm((p) => ({ ...p, is_anonymous: e.target.checked }))} />
                                        <label className="form-check-label small" htmlFor="anon">
                                            Submit anonymously — your name is hidden from the HR queue
                                        </label>
                                    </div>
                                    <button className="btn btn-primary btn-sm" disabled={busy}>Submit grievance</button>
                                </div>
                            </div>
                        </form>

                        {loading && <p>Loading…</p>}
                        {!loading && grievances.length === 0 && <div className="alert alert-info">You haven&apos;t raised any grievances.</div>}
                        {!loading && grievances.length > 0 && (
                            <div className="table-responsive">
                                <table className="table table-striped align-middle">
                                    <thead className="table-dark"><tr><th>Subject</th><th>Category</th><th>Raised</th><th>Status</th><th>Resolution</th></tr></thead>
                                    <tbody>
                                        {grievances.map((g) => (
                                            <tr key={g.id}>
                                                <td>{g.subject}{g.is_anonymous && <span className="badge bg-light text-dark border ms-2">anonymous</span>}</td>
                                                <td>{g.category}</td>
                                                <td>{fmt(g.createdAt)}</td>
                                                <td><span className={`badge bg-${GRIEVANCE_VARIANT[g.status] || "secondary"}`}>{g.status}</span></td>
                                                <td className="small text-muted">{g.resolution || "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}

                {tab === "incident" && (
                    <>
                        <form className="card card-body mb-4" onSubmit={submitIncident}>
                            <div className="row g-2">
                                <div className="col-md-4">
                                    <label className="form-label small">When</label>
                                    <input type="datetime-local" className="form-control" value={iForm.incident_date}
                                        onChange={(e) => setIForm((p) => ({ ...p, incident_date: e.target.value }))} />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label small">Where</label>
                                    <input className="form-control" value={iForm.location}
                                        onChange={(e) => setIForm((p) => ({ ...p, location: e.target.value }))} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label small">Type</label>
                                    <EnumSelect name="hr-incident-report" field="type" value={iForm.type}
                                        onChange={(e) => setIForm((p) => ({ ...p, type: e.target.value }))} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label small">Severity</label>
                                    <EnumSelect name="hr-incident-report" field="severity" value={iForm.severity}
                                        onChange={(e) => setIForm((p) => ({ ...p, severity: e.target.value }))} />
                                </div>
                                <div className="col-12">
                                    <label className="form-label small">What happened?</label>
                                    <textarea className="form-control" rows={3} value={iForm.description}
                                        onChange={(e) => setIForm((p) => ({ ...p, description: e.target.value }))} required />
                                </div>
                                <div className="col-12 text-end">
                                    <button className="btn btn-danger btn-sm" disabled={busy}>Report incident</button>
                                </div>
                            </div>
                        </form>

                        {loading && <p>Loading…</p>}
                        {!loading && incidents.length === 0 && <div className="alert alert-info">You haven&apos;t reported any incidents.</div>}
                        {!loading && incidents.length > 0 && (
                            <div className="table-responsive">
                                <table className="table table-striped align-middle">
                                    <thead className="table-dark"><tr><th>When</th><th>Type</th><th>Severity</th><th>Location</th><th>Status</th></tr></thead>
                                    <tbody>
                                        {incidents.map((i) => (
                                            <tr key={i.id}>
                                                <td>{fmt(i.incident_date)}</td>
                                                <td>{i.type}</td>
                                                <td>{i.severity}</td>
                                                <td>{i.location || "—"}</td>
                                                <td><span className={`badge bg-${INCIDENT_VARIANT[i.status] || "secondary"}`}>{i.status}</span></td>
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
