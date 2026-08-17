import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrTrainingEnrollmentsEndpoints, HrTrainingSessionsEndpoints } from "@rutba/api-provider/endpoints";

const STATUS_VARIANT = { Enrolled: "primary", Attended: "info", Completed: "success", Dropped: "secondary" };

function fmt(d) {
    return d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export default function Training() {
    const { jwt } = useAuth();
    const [mine, setMine] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState({});

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        const [m, s] = await Promise.allSettled([
            HrTrainingEnrollmentsEndpoints.listMine(),
            HrTrainingSessionsEndpoints.list({ sort: ["start_date:asc"], pageSize: 100 }),
        ]);
        if (m.status === "fulfilled") setMine(m.value?.data || []);
        if (s.status === "fulfilled") setSessions(s.value?.data || []);
        setLoading(false);
    }

    async function enroll(session) {
        setBusy((p) => ({ ...p, [session.documentId]: true }));
        try {
            await HrTrainingEnrollmentsEndpoints.enroll({ session: session.documentId });
            await load();
        } catch (err) {
            console.error("Enroll failed", err);
            alert("Could not enroll — the session may be full or closed.");
        } finally {
            setBusy((p) => ({ ...p, [session.documentId]: false }));
        }
    }

    const enrolledSessionIds = new Set(mine.map((m) => m.session?.documentId).filter(Boolean));
    const openSessions = sessions.filter(
        (s) => ["Scheduled", "InProgress"].includes(s.status) && !enrolledSessionIds.has(s.documentId),
    );

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">My Training</h2>
                <p className="text-muted small mb-4">Courses you are enrolled on, and sessions open to you.</p>

                {loading && <p>Loading…</p>}

                {!loading && (
                    <>
                        <h5 className="mb-2">My enrollments</h5>
                        {mine.length === 0 ? (
                            <div className="alert alert-info">You are not enrolled on any training yet.</div>
                        ) : (
                            <div className="table-responsive mb-4">
                                <table className="table table-striped align-middle">
                                    <thead className="table-dark">
                                        <tr><th>Course</th><th>Starts</th><th>Mode</th><th>Status</th><th>Score</th><th>Certificate</th></tr>
                                    </thead>
                                    <tbody>
                                        {mine.map((e) => (
                                            <tr key={e.id}>
                                                <td>{e.session?.course?.name || "—"}</td>
                                                <td>{fmt(e.session?.start_date)}</td>
                                                <td>{e.session?.course?.delivery_mode || "—"}</td>
                                                <td><span className={`badge bg-${STATUS_VARIANT[e.status] || "secondary"}`}>{e.status}</span></td>
                                                <td>{e.score ?? "—"}</td>
                                                <td>
                                                    {e.certificate?.url
                                                        ? <a href={e.certificate.url} target="_blank" rel="noopener noreferrer">Download</a>
                                                        : "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <h5 className="mb-2">Open sessions</h5>
                        {openSessions.length === 0 ? (
                            <div className="alert alert-secondary">No further sessions are open for enrollment.</div>
                        ) : (
                            <div className="row g-3">
                                {openSessions.map((s) => (
                                    <div className="col-md-6 col-lg-4" key={s.id}>
                                        <div className="card h-100">
                                            <div className="card-body d-flex flex-column">
                                                <h6 className="mb-1">{s.course?.name || "Session"}</h6>
                                                <div className="small text-muted mb-2">
                                                    {fmt(s.start_date)}
                                                    {s.location ? ` · ${s.location}` : ""}
                                                    {s.course?.duration_hours ? ` · ${s.course.duration_hours}h` : ""}
                                                </div>
                                                {s.course?.description && <p className="small flex-grow-1">{s.course.description}</p>}
                                                <button
                                                    className="btn btn-sm btn-primary mt-auto"
                                                    onClick={() => enroll(s)}
                                                    disabled={busy[s.documentId]}
                                                >
                                                    {busy[s.documentId] ? "Enrolling…" : "Enroll"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
