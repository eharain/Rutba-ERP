import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { HrLifecycleEventsEndpoints } from "@rutba/api-provider/endpoints";

// Badge colour per lifecycle stage — growth events read positive, exit events
// neutral, so the timeline is scannable at a glance.
const TYPE_VARIANT = {
    Onboarding: "primary",
    Confirmation: "success",
    Probation: "warning",
    Promotion: "success",
    Transfer: "info",
    SalaryRevision: "success",
    DepartmentChange: "info",
    Resignation: "secondary",
    ExitInterview: "secondary",
    Clearance: "secondary",
    FinalSettlement: "dark",
};

const STATUS_VARIANT = {
    Pending: "warning",
    Approved: "success",
    Rejected: "danger",
    Completed: "secondary",
};

function labelize(type) {
    return String(type || "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Render the `details` json blob as plain key/value lines (HR fills it freely). */
function DetailLines({ details }) {
    if (!details || typeof details !== "object") return null;
    const entries = Object.entries(details).filter(([, v]) => v !== null && v !== "");
    if (!entries.length) return null;
    return (
        <ul className="list-unstyled small text-muted mb-0 mt-1">
            {entries.map(([k, v]) => (
                <li key={k}>
                    <span className="text-capitalize">{k.replace(/_/g, " ")}</span>:{" "}
                    <strong>{typeof v === "object" ? JSON.stringify(v) : String(v)}</strong>
                </li>
            ))}
        </ul>
    );
}

export default function Timeline() {
    const { jwt } = useAuth();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await HrLifecycleEventsEndpoints.listMine();
            setEvents(res?.data || []);
        } catch (err) {
            console.error("Failed to load timeline", err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">My Career Timeline</h2>
                <p className="text-muted small mb-3">
                    Your recorded HR milestones — onboarding, confirmation, promotions, transfers and exit steps.
                </p>

                {loading && <p>Loading…</p>}
                {!loading && events.length === 0 && (
                    <div className="alert alert-info">No lifecycle events have been recorded for you yet.</div>
                )}

                {!loading && events.length > 0 && (
                    <div className="list-group">
                        {events.map((e) => (
                            <div key={e.id} className="list-group-item">
                                <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                                    <div>
                                        <span className={`badge bg-${TYPE_VARIANT[e.type] || "secondary"} me-2`}>
                                            {labelize(e.type)}
                                        </span>
                                        {e.status && e.status !== "Completed" && (
                                            <span className={`badge bg-${STATUS_VARIANT[e.status] || "secondary"}`}>
                                                {e.status}
                                            </span>
                                        )}
                                        {e.notes && <div className="mt-2">{e.notes}</div>}
                                        <DetailLines details={e.details} />
                                    </div>
                                    <div className="text-muted small text-nowrap">
                                        {e.effective_date
                                            ? new Date(e.effective_date).toLocaleDateString()
                                            : new Date(e.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
