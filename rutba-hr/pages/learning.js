import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrCoursesEndpoints, HrTrainingSessionsEndpoints, HrTrainingEnrollmentsEndpoints } from "@rutba/api-provider/endpoints";

const SESSION_VARIANT = { Scheduled: "primary", InProgress: "info", Completed: "success", Cancelled: "dark" };
const ENR_VARIANT = { Enrolled: "primary", Attended: "info", Completed: "success", Dropped: "secondary" };

function fmt(d) {
    return d ? new Date(d).toLocaleDateString() : "—";
}

const TABS = [
    { key: "sessions", label: "Sessions", icon: "fa-calendar-days" },
    { key: "courses", label: "Courses", icon: "fa-book" },
    { key: "enrollments", label: "Enrollments", icon: "fa-users" },
];

export default function Learning() {
    const { jwt } = useAuth();
    const [tab, setTab] = useState("sessions");
    const [data, setData] = useState({ sessions: [], courses: [], enrollments: [] });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState({});

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        const [s, c, e] = await Promise.allSettled([
            HrTrainingSessionsEndpoints.list({ pageSize: 100 }),
            HrCoursesEndpoints.list({ pageSize: 100 }),
            HrTrainingEnrollmentsEndpoints.list({ pageSize: 300 }),
        ]);
        setData({
            sessions: s.status === "fulfilled" ? s.value?.data || [] : [],
            courses: c.status === "fulfilled" ? c.value?.data || [] : [],
            enrollments: e.status === "fulfilled" ? e.value?.data || [] : [],
        });
        setLoading(false);
    }

    async function complete(enr) {
        const score = window.prompt("Score (optional):");
        if (score === null) return;
        setBusy((p) => ({ ...p, [enr.documentId]: true }));
        try {
            await HrTrainingEnrollmentsEndpoints.complete(enr.documentId, score ? { score: Number(score) } : {});
            await load();
        } catch (err) {
            console.error("Complete failed", err);
            alert("Could not mark this training complete.");
        } finally {
            setBusy((p) => ({ ...p, [enr.documentId]: false }));
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Learning</h2>
                <p className="text-muted small mb-3">Course catalogue, scheduled sessions and who is on them.</p>

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

                {!loading && tab === "sessions" && (
                    data.sessions.length === 0 ? <div className="alert alert-info">No sessions scheduled.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>Course</th><th>Starts</th><th>Location</th><th>Capacity</th><th>Status</th></tr></thead>
                                <tbody>
                                    {data.sessions.map((s) => (
                                        <tr key={s.id}>
                                            <td>{s.course?.name || "—"}</td>
                                            <td>{fmt(s.start_date)}</td>
                                            <td>{s.location || "—"}</td>
                                            <td>{s.capacity ?? "—"}</td>
                                            <td><span className={`badge bg-${SESSION_VARIANT[s.status] || "secondary"}`}>{s.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}

                {!loading && tab === "courses" && (
                    data.courses.length === 0 ? <div className="alert alert-info">No courses in the catalogue.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>Name</th><th>Code</th><th>Mode</th><th>Hours</th><th>Active</th></tr></thead>
                                <tbody>
                                    {data.courses.map((c) => (
                                        <tr key={c.id}>
                                            <td>{c.name}</td>
                                            <td className="small text-muted">{c.code || "—"}</td>
                                            <td>{c.delivery_mode}</td>
                                            <td>{c.duration_hours ?? "—"}</td>
                                            <td>{c.is_active ? <span className="badge bg-success">Yes</span> : <span className="badge bg-secondary">No</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}

                {!loading && tab === "enrollments" && (
                    data.enrollments.length === 0 ? <div className="alert alert-info">Nobody is enrolled yet.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>Employee</th><th>Session</th><th>Status</th><th>Score</th><th></th></tr></thead>
                                <tbody>
                                    {data.enrollments.map((e) => (
                                        <tr key={e.id}>
                                            <td>{e.employee?.name || "—"}</td>
                                            <td>{e.session?.course?.name || fmt(e.session?.start_date)}</td>
                                            <td><span className={`badge bg-${ENR_VARIANT[e.status] || "secondary"}`}>{e.status}</span></td>
                                            <td>{e.score ?? "—"}</td>
                                            <td>
                                                {e.status !== "Completed" && e.status !== "Dropped" && (
                                                    <button className="btn btn-sm btn-outline-success" onClick={() => complete(e)} disabled={busy[e.documentId]}>
                                                        Mark complete
                                                    </button>
                                                )}
                                            </td>
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
