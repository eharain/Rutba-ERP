import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { HrLifecycleEventsEndpoints, HrEmployeesEndpoints } from "@rutba/api-provider/endpoints";

const EVENT_TYPES = [
    "Onboarding", "Confirmation", "Probation", "Promotion", "Transfer",
    "SalaryRevision", "DepartmentChange", "Resignation", "ExitInterview",
    "Clearance", "FinalSettlement",
];

export default function LifecycleEvents() {
    const { jwt } = useAuth();
    const [events, setEvents] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ employee: "", type: "Onboarding", effective_date: "", notes: "" });

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const [evRes, empRes] = await Promise.all([
                HrLifecycleEventsEndpoints.list(),
                HrEmployeesEndpoints.list(),
            ]);
            setEvents(evRes?.data || []);
            setEmployees(empRes?.data || []);
        } catch (err) {
            console.error("Failed to load lifecycle events", err);
        } finally {
            setLoading(false);
        }
    }

    async function logEvent(e) {
        e.preventDefault();
        if (!form.employee) return;
        setSaving(true);
        try {
            await HrLifecycleEventsEndpoints.create({
                employee: form.employee,
                type: form.type,
                effective_date: form.effective_date || null,
                notes: form.notes || null,
            });
            setForm({ employee: "", type: "Onboarding", effective_date: "", notes: "" });
            await load();
        } catch (err) {
            console.error("Failed to log event", err);
            alert("Failed to log event.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Lifecycle Events</h2>

                <div className="card mb-4">
                    <div className="card-header bg-light fw-semibold">Log an Event</div>
                    <div className="card-body">
                        <form onSubmit={logEvent} className="row g-2 align-items-end">
                            <div className="col-md-3">
                                <label className="form-label small">Employee</label>
                                <select className="form-select form-select-sm" value={form.employee} onChange={(e) => setForm((p) => ({ ...p, employee: e.target.value }))} required>
                                    <option value="">Select…</option>
                                    {employees.map((e) => <option key={e.documentId} value={e.documentId}>{e.name}</option>)}
                                </select>
                            </div>
                            <div className="col-md-3">
                                <label className="form-label small">Type</label>
                                <select className="form-select form-select-sm" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                                    {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <label className="form-label small">Effective Date</label>
                                <input type="date" className="form-control form-control-sm" value={form.effective_date} onChange={(e) => setForm((p) => ({ ...p, effective_date: e.target.value }))} />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label small">Notes</label>
                                <input className="form-control form-control-sm" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                            </div>
                            <div className="col-md-1 d-grid">
                                <button className="btn btn-sm btn-primary" type="submit" disabled={saving}>Log</button>
                            </div>
                        </form>
                    </div>
                </div>

                {loading && <p>Loading…</p>}
                {!loading && events.length === 0 && <div className="alert alert-info">No lifecycle events logged yet.</div>}
                {!loading && events.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr><th>Employee</th><th>Type</th><th>Effective Date</th><th>Status</th><th>Notes</th></tr>
                            </thead>
                            <tbody>
                                {events.map((ev) => (
                                    <tr key={ev.id}>
                                        <td>{ev.employee?.name || "—"}</td>
                                        <td>{ev.type}</td>
                                        <td>{ev.effective_date ? new Date(ev.effective_date).toLocaleDateString() : "—"}</td>
                                        <td>{ev.status}</td>
                                        <td>{ev.notes || "—"}</td>
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
