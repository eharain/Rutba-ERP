import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    MfgWorkerProfilesEndpoints,
    MfgTasksEndpoints,
} from "@rutba/api-provider/endpoints";

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export default function Workers() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!jwt) return;
        (async () => {
            setLoading(true);
            try {
                const [profRes, taskRes] = await Promise.all([
                    MfgWorkerProfilesEndpoints.list(1, 200),
                    MfgTasksEndpoints.list(1, 1000, { sort: ["createdAt:desc"] }),
                ]);
                const profiles = profRes.data || [];
                const tasks = taskRes.data || [];

                // aggregate tasks by worker documentId
                const agg = {};
                tasks.forEach((t) => {
                    const wid = t.worker?.documentId;
                    if (!wid) return;
                    if (!agg[wid]) {
                        agg[wid] = { pieces: 0, rejected: 0, earned: 0, approved: 0, count: 0 };
                    }
                    const a = agg[wid];
                    a.pieces += num(t.quantity_completed);
                    a.rejected += num(t.quantity_rejected);
                    a.earned += num(t.amount);
                    if (t.status === "Approved") a.approved += 1;
                    a.count += 1;
                });

                const merged = profiles.map((p) => {
                    const a = agg[p.documentId] || { pieces: 0, rejected: 0, earned: 0, approved: 0, count: 0 };
                    const denom = a.pieces + a.rejected;
                    const defectRate = denom > 0 ? (a.rejected / denom) * 100 : 0;
                    return {
                        documentId: p.documentId,
                        name: p.employee?.name || p.code || p.documentId,
                        worker_type: p.worker_type || "—",
                        skill: p.default_skill_grade || "—",
                        taskCount: a.count,
                        pieces: a.pieces,
                        rejected: a.rejected,
                        defectRate,
                        approved: a.approved,
                        earned: a.earned,
                    };
                });

                merged.sort((x, y) => y.earned - x.earned);
                setRows(merged);
                setError("");
            } catch (err) {
                console.error("Failed to load worker performance", err);
                setError("Failed to load worker performance.");
            } finally {
                setLoading(false);
            }
        })();
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-2">Worker Performance</h2>
                <p className="text-muted">
                    Earnings reflect the amount on each task; only <strong>Approved</strong> tasks are fed
                    into payroll. Defect % = rejected / (completed + rejected).
                </p>

                {error && <div className="alert alert-danger">{error}</div>}
                {loading && <p>Loading worker performance...</p>}

                {!loading && rows.length === 0 && !error && (
                    <div className="alert alert-info">No worker profiles found.</div>
                )}

                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Worker</th>
                                    <th>Type</th>
                                    <th>Grade</th>
                                    <th>Tasks</th>
                                    <th>Pieces</th>
                                    <th>Rejected</th>
                                    <th>Defect %</th>
                                    <th>Approved</th>
                                    <th>Earned</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.documentId}>
                                        <td>{r.name}</td>
                                        <td>{r.worker_type}</td>
                                        <td>{r.skill}</td>
                                        <td>{r.taskCount}</td>
                                        <td>{r.pieces}</td>
                                        <td>{r.rejected}</td>
                                        <td>{r.defectRate.toFixed(1)}%</td>
                                        <td>{r.approved}</td>
                                        <td>{r.earned.toFixed(2)}</td>
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

export async function getServerSideProps() { return { props: {} }; }
