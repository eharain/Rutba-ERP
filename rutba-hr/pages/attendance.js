import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function Attendance() {
    const { jwt } = useAuth();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/hr-attendances?sort=date:desc&populate=employee", {}, jwt)
            .then((res) => setRecords(res.data || []))
            .catch((err) => console.error("Failed to load attendance", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Attendance</h2>

                {loading && <p>Loading attendance records...</p>}

                {!loading && records.length === 0 && (
                    <div className="alert alert-info">No attendance records found.</div>
                )}

                {!loading && records.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Date</th>
                                    <th>Employee</th>
                                    <th>Status</th>
                                    <th>Check In</th>
                                    <th>Check Out</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map((r) => (
                                    <tr key={r.id}>
                                        <td>{new Date(r.date).toLocaleDateString()}</td>
                                        <td>{r.employee?.name || "—"}</td>
                                        <td>
                                            <span className={`badge bg-${attendanceColor(r.status)}`}>
                                                {r.status || "—"}
                                            </span>
                                        </td>
                                        <td>{r.check_in || "—"}</td>
                                        <td>{r.check_out || "—"}</td>
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

function attendanceColor(status) {
    switch (status) {
        case "Present": return "success";
        case "Absent": return "danger";
        case "Late": return "warning";
        case "Leave": return "info";
        default: return "secondary";
    }
}

export async function getServerSideProps() { return { props: {} }; }
