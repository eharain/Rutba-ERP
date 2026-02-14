import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function Payslips() {
    const { jwt } = useAuth();
    const [payslips, setPayslips] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/pay-payslips?sort=createdAt:desc&populate=employee", {}, jwt)
            .then((res) => setPayslips(res.data || []))
            .catch((err) => console.error("Failed to load payslips", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Payslips</h2>

                {loading && <p>Loading payslips...</p>}

                {!loading && payslips.length === 0 && (
                    <div className="alert alert-info">No payslips found.</div>
                )}

                {!loading && payslips.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Employee</th>
                                    <th>Period</th>
                                    <th>Gross</th>
                                    <th>Deductions</th>
                                    <th>Net Pay</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payslips.map((p) => (
                                    <tr key={p.id}>
                                        <td>{p.employee?.name || "—"}</td>
                                        <td>{p.period || "—"}</td>
                                        <td>{p.gross != null ? p.gross.toFixed(2) : "0.00"}</td>
                                        <td>{p.deductions != null ? p.deductions.toFixed(2) : "0.00"}</td>
                                        <td>{p.net_pay != null ? p.net_pay.toFixed(2) : "0.00"}</td>
                                        <td>
                                            <span className={`badge bg-${p.status === "Paid" ? "success" : "warning"}`}>
                                                {p.status || "Pending"}
                                            </span>
                                        </td>
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
