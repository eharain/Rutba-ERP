import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrGoalsEndpoints, HrAppraisalsEndpoints } from "@rutba/api-provider/endpoints";

const GOAL_STATUS_VARIANT = {
    NotStarted: "secondary",
    InProgress: "primary",
    Completed: "success",
    Cancelled: "dark",
};

const APPRAISAL_STATUS_VARIANT = {
    Draft: "secondary",
    SelfAssessment: "warning",
    ManagerReview: "info",
    Completed: "success",
};

function labelize(s) {
    return String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export default function Performance() {
    const { jwt } = useAuth();
    const [goals, setGoals] = useState([]);
    const [appraisals, setAppraisals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState({});
    const [selfForm, setSelfForm] = useState({});

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        const [g, a] = await Promise.allSettled([
            HrGoalsEndpoints.listMine(),
            HrAppraisalsEndpoints.listMine(),
        ]);
        if (g.status === "fulfilled") setGoals(g.value?.data || []);
        if (a.status === "fulfilled") setAppraisals(a.value?.data || []);
        setLoading(false);
    }

    async function saveGoal(goal, patch) {
        setSaving((p) => ({ ...p, [goal.documentId]: true }));
        try {
            await HrGoalsEndpoints.updateMine(goal.documentId, patch);
            await load();
        } catch (err) {
            console.error("Failed to update goal", err);
            alert("Could not update the goal.");
        } finally {
            setSaving((p) => ({ ...p, [goal.documentId]: false }));
        }
    }

    async function submitSelf(appraisal) {
        const form = selfForm[appraisal.documentId] || {};
        if (!form.self_rating) return alert("Please give yourself a rating first.");
        setSaving((p) => ({ ...p, [appraisal.documentId]: true }));
        try {
            await HrAppraisalsEndpoints.submitSelfAssessment(appraisal.documentId, {
                self_rating: Number(form.self_rating),
                self_comments: form.self_comments || null,
            });
            await load();
        } catch (err) {
            console.error("Failed to submit self-assessment", err);
            alert("Could not submit your self-assessment.");
        } finally {
            setSaving((p) => ({ ...p, [appraisal.documentId]: false }));
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">My Performance</h2>
                <p className="text-muted small mb-4">Your objectives and review history.</p>

                {loading && <p>Loading…</p>}

                {!loading && (
                    <>
                        <h5 className="mb-2">Goals</h5>
                        {goals.length === 0 ? (
                            <div className="alert alert-info">No goals have been set for you yet.</div>
                        ) : (
                            <div className="table-responsive mb-4">
                                <table className="table table-striped align-middle">
                                    <thead className="table-dark">
                                        <tr><th>Goal</th><th>Cycle</th><th>Target</th><th style={{ width: 180 }}>Progress</th><th>Status</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {goals.map((g) => (
                                            <tr key={g.id}>
                                                <td>
                                                    <div className="fw-semibold">{g.title}</div>
                                                    {g.description && <div className="small text-muted">{g.description}</div>}
                                                </td>
                                                <td>{g.cycle?.name || "—"}</td>
                                                <td>{g.target_date ? new Date(g.target_date).toLocaleDateString() : "—"}</td>
                                                <td>
                                                    <div className="d-flex align-items-center gap-2">
                                                        <input
                                                            type="range" min="0" max="100" step="5"
                                                            className="form-range"
                                                            defaultValue={g.progress_percent || 0}
                                                            onMouseUp={(e) => saveGoal(g, { progress_percent: Number(e.target.value) })}
                                                            onTouchEnd={(e) => saveGoal(g, { progress_percent: Number(e.target.value) })}
                                                            disabled={saving[g.documentId] || g.status === "Cancelled"}
                                                        />
                                                        <span className="small text-muted" style={{ minWidth: 36 }}>{g.progress_percent || 0}%</span>
                                                    </div>
                                                </td>
                                                <td><span className={`badge bg-${GOAL_STATUS_VARIANT[g.status] || "secondary"}`}>{labelize(g.status)}</span></td>
                                                <td>
                                                    {g.status !== "Completed" && g.status !== "Cancelled" && (
                                                        <button
                                                            className="btn btn-sm btn-outline-success"
                                                            onClick={() => saveGoal(g, { status: "Completed", progress_percent: 100 })}
                                                            disabled={saving[g.documentId]}
                                                        >
                                                            Mark done
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <h5 className="mb-2">Appraisals</h5>
                        {appraisals.length === 0 ? (
                            <div className="alert alert-info">You have no appraisals yet.</div>
                        ) : (
                            appraisals.map((a) => (
                                <div className="card mb-3" key={a.id}>
                                    <div className="card-body">
                                        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                                            <h6 className="mb-0">{a.cycle?.name || "Appraisal"}</h6>
                                            <span className={`badge bg-${APPRAISAL_STATUS_VARIANT[a.status] || "secondary"}`}>{labelize(a.status)}</span>
                                        </div>

                                        {["Draft", "SelfAssessment"].includes(a.status) ? (
                                            <div className="row g-2 mt-2">
                                                <div className="col-md-3">
                                                    <label className="form-label small">Your rating (1–5)</label>
                                                    <input
                                                        type="number" min="1" max="5" step="0.5" className="form-control"
                                                        value={selfForm[a.documentId]?.self_rating || ""}
                                                        onChange={(e) => setSelfForm((p) => ({ ...p, [a.documentId]: { ...p[a.documentId], self_rating: e.target.value } }))}
                                                    />
                                                </div>
                                                <div className="col-md-9">
                                                    <label className="form-label small">Your comments</label>
                                                    <textarea
                                                        className="form-control" rows={2}
                                                        value={selfForm[a.documentId]?.self_comments || ""}
                                                        onChange={(e) => setSelfForm((p) => ({ ...p, [a.documentId]: { ...p[a.documentId], self_comments: e.target.value } }))}
                                                    />
                                                </div>
                                                <div className="col-12">
                                                    <button className="btn btn-primary btn-sm" onClick={() => submitSelf(a)} disabled={saving[a.documentId]}>
                                                        Submit self-assessment
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="row g-3 mt-1 small">
                                                <div className="col-md-6">
                                                    <div className="text-muted">Self rating</div>
                                                    <div className="fw-semibold">{a.self_rating ?? "—"}</div>
                                                    {a.self_comments && <div className="text-muted">{a.self_comments}</div>}
                                                </div>
                                                <div className="col-md-6">
                                                    <div className="text-muted">Manager rating</div>
                                                    {/* manager fields are withheld by the API until the review is Completed */}
                                                    <div className="fw-semibold">{a.status === "Completed" ? (a.final_rating ?? a.manager_rating ?? "—") : "Pending review"}</div>
                                                    {a.manager_comments && <div className="text-muted">{a.manager_comments}</div>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
