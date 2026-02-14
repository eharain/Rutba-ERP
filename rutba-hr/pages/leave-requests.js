import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function LeaveRequests() {
    const { jwt } = useAuth();
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/hr-leave-requests?sort=createdAt:desc&populate=employee", {}, jwt)
            .then((res) => setLeaves(res.data || []))
            .catch((err) => console.error("Failed to load leave requests", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Leave Requests</h2>

                {loading && <p>Loading leave requests...</p>}

                {!loading && leaves.length === 0 && (
                    <div className="alert alert-info">No leave requests found.</div>
                )}

                {!loading && leaves.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Employee</th>
                                    <th>Type</th>
                                    <th>From</th>
                                    <th>To</th>
                                    <th>Status</th>
                                    <th>Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaves.map((l) => (
                                    <tr key={l.id}>
                                        <td>{l.employee?.name || "—"}</td>
                                        <td>{l.leave_type || "—"}</td>
                                        <td>{l.start_date ? new Date(l.start_date).toLocaleDateString() : "—"}</td>
                                        <td>{l.end_date ? new Date(l.end_date).toLocaleDateString() : "—"}</td>
                                        <td>
                                            <span className={`badge bg-${leaveStatusColor(l.status)}`}>
                                                {l.status || "Pending"}
                                            </span>
                                        </td>
                                        <td>{l.reason || "—"}</td>
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

function leaveStatusColor(status) {
    switch (status) {
        case "Approved": return "success";
        case "Rejected": return "danger";
        case "Pending": return "warning";
        default: return "secondary";
    }
}

export async function getServerSideProps() { return { props: {} }; }
