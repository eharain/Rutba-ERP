import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function PayrollRuns() {
    const { jwt } = useAuth();
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/pay-payroll-runs?sort=period_start:desc", {}, jwt)
            .then((res) => setRuns(res.data || []))
            .catch((err) => console.error("Failed to load payroll runs", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Payroll Runs</h2>

                {loading && <p>Loading payroll runs...</p>}

                {!loading && runs.length === 0 && (
                    <div className="alert alert-info">No payroll runs found.</div>
                )}

                {!loading && runs.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Period</th>
                                    <th>Status</th>
                                    <th>Total Gross</th>
                                    <th>Total Deductions</th>
                                    <th>Total Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {runs.map((r) => (
                                    <tr key={r.id}>
                                        <td>
                                            {r.period_start ? new Date(r.period_start).toLocaleDateString() : "—"}
                                            {" — "}
                                            {r.period_end ? new Date(r.period_end).toLocaleDateString() : "—"}
                                        </td>
                                        <td>
                                            <span className={`badge bg-${payrollStatusColor(r.status)}`}>
                                                {r.status || "Draft"}
                                            </span>
                                        </td>
                                        <td>{r.total_gross != null ? r.total_gross.toFixed(2) : "0.00"}</td>
                                        <td>{r.total_deductions != null ? r.total_deductions.toFixed(2) : "0.00"}</td>
                                        <td>{r.total_net != null ? r.total_net.toFixed(2) : "0.00"}</td>
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

function payrollStatusColor(status) {
    switch (status) {
        case "Processed": return "success";
        case "Draft": return "secondary";
        case "Cancelled": return "danger";
        default: return "warning";
    }
}

export async function getServerSideProps() { return { props: {} }; }
