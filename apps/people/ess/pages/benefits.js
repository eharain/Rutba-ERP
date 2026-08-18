import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { HrBenefitEnrollmentsEndpoints } from "@rutba/api-provider/endpoints";

export default function Benefits() {
    const { jwt } = useAuth();
    const [enrollments, setEnrollments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await HrBenefitEnrollmentsEndpoints.listMine();
            setEnrollments(res?.data || []);
        } catch (err) {
            console.error("Failed to load benefits", err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">My Benefits</h2>

                {loading && <p>Loading…</p>}
                {!loading && enrollments.length === 0 && (
                    <div className="alert alert-info">You're not enrolled in any benefit plans yet.</div>
                )}
                {!loading && enrollments.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr><th>Plan</th><th>Type</th><th>Enrolled Since</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {enrollments.map((e) => (
                                    <tr key={e.id}>
                                        <td>{e.benefit_plan?.name || "—"}</td>
                                        <td>{e.benefit_plan?.type || "—"}</td>
                                        <td>{e.enrollment_date ? new Date(e.enrollment_date).toLocaleDateString() : "—"}</td>
                                        <td><span className={`badge bg-${e.status === "Active" ? "success" : "secondary"}`}>{e.status}</span></td>
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
