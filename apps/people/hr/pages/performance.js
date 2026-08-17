import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrAppraisalsEndpoints, HrAppraisalCyclesEndpoints } from "@rutba/api-provider/endpoints";

const STATUS_VARIANT = { Draft: "secondary", SelfAssessment: "warning", ManagerReview: "info", Completed: "success" };

function labelize(s) {
    return String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export default function Performance() {
    const { jwt } = useAuth();
    const [appraisals, setAppraisals] = useState([]);
    const [cycles, setCycles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [denied, setDenied] = useState(false);
    const [busy, setBusy] = useState({});
    const [review, setReview] = useState({});

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await HrAppraisalsEndpoints.listTeam();
            setAppraisals(res?.data || []);
            setDenied(false);
        } catch (err) {
            setDenied(true);
            setAppraisals([]);
        }
        try {
            const c = await HrAppraisalCyclesEndpoints.list({ pageSize: 50 });
            setCycles(c?.data || []);
        } catch (err) { /* cycles are optional context */ }
        setLoading(false);
    }

    async function submitReview(a) {
        const form = review[a.documentId] || {};
        if (!form.manager_rating) return alert("Please enter a rating.");
        setBusy((p) => ({ ...p, [a.documentId]: true }));
        try {
            await HrAppraisalsEndpoints.submitManagerReview(a.documentId, {
                manager_rating: Number(form.manager_rating),
                manager_comments: form.manager_comments || null,
                final_rating: form.final_rating ? Number(form.final_rating) : undefined,
            });
            await load();
        } catch (err) {
            console.error("Manager review failed", err);
            alert("Could not submit the review.");
        } finally {
            setBusy((p) => ({ ...p, [a.documentId]: false }));
        }
    }

    const awaitingMe = appraisals.filter((a) => a.status === "ManagerReview");

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Performance</h2>
                <p className="text-muted small mb-3">Appraisals for your team, and the active review cycles.</p>

                {loading && <p>Loading…</p>}
                {!loading && denied && (
                    <div className="alert alert-secondary">You don&apos;t review anyone, so there are no appraisals here.</div>
                )}

                {!loading && !denied && (
                    <>
                        {cycles.length > 0 && (
                            <div className="mb-3 d-flex flex-wrap gap-2">
                                {cycles.map((c) => (
                                    <span key={c.id} className={`badge bg-${c.status === "Active" ? "success" : "secondary"}`}>
                                        {c.name} · {c.status}
                                    </span>
                                ))}
                            </div>
                        )}

                        {awaitingMe.length > 0 && (
                            <div className="alert alert-info py-2">
                                <strong>{awaitingMe.length}</strong> appraisal{awaitingMe.length === 1 ? "" : "s"} awaiting your review.
                            </div>
                        )}

                        {appraisals.length === 0 ? (
                            <div className="alert alert-info">No appraisals yet.</div>
                        ) : (
                            appraisals.map((a) => (
                                <div className="card mb-3" key={a.id}>
                                    <div className="card-body">
                                        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                                            <div>
                                                <h6 className="mb-0">{a.employee?.name || "Employee"}</h6>
                                                <div className="small text-muted">{a.cycle?.name || "—"}</div>
                                            </div>
                                            <span className={`badge bg-${STATUS_VARIANT[a.status] || "secondary"}`}>{labelize(a.status)}</span>
                                        </div>

                                        <div className="row g-3 mt-1 small">
                                            <div className="col-md-6">
                                                <div className="text-muted">Self assessment</div>
                                                <div className="fw-semibold">{a.self_rating ?? "—"}</div>
                                                {a.self_comments && <div className="text-muted">{a.self_comments}</div>}
                                            </div>
                                            <div className="col-md-6">
                                                <div className="text-muted">Final</div>
                                                <div className="fw-semibold">{a.final_rating ?? a.manager_rating ?? "—"}</div>
                                                {a.manager_comments && <div className="text-muted">{a.manager_comments}</div>}
                                            </div>
                                        </div>

                                        {a.status === "ManagerReview" && (
                                            <div className="row g-2 mt-2 border-top pt-3">
                                                <div className="col-md-3">
                                                    <label className="form-label small">Your rating (1–5)</label>
                                                    <input type="number" min="1" max="5" step="0.5" className="form-control form-control-sm"
                                                        value={review[a.documentId]?.manager_rating || ""}
                                                        onChange={(e) => setReview((p) => ({ ...p, [a.documentId]: { ...p[a.documentId], manager_rating: e.target.value } }))} />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label small">Comments</label>
                                                    <textarea className="form-control form-control-sm" rows={2}
                                                        value={review[a.documentId]?.manager_comments || ""}
                                                        onChange={(e) => setReview((p) => ({ ...p, [a.documentId]: { ...p[a.documentId], manager_comments: e.target.value } }))} />
                                                </div>
                                                <div className="col-md-3 d-flex align-items-end">
                                                    <button className="btn btn-primary btn-sm w-100" onClick={() => submitReview(a)} disabled={busy[a.documentId]}>
                                                        Complete review
                                                    </button>
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
