import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { PayAdjustmentsEndpoints } from "@rutba/api-provider/endpoints";

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Adjustments() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        // PayAdjustments uses positional (page, pageSize) args — pass page 1 explicitly.
        PayAdjustmentsEndpoints.list(1)
            .then((res) => setRows(res.data || []))
            .catch((err) => console.error("Failed to load adjustments", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Payroll Adjustments</h2>
                <p className="text-muted small">Advances, loans, bonuses and penalties — applied to payslips during a run.</p>

                {loading && <p>Loading adjustments…</p>}
                {!loading && rows.length === 0 && <div className="alert alert-info">No adjustments found.</div>}

                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark"><tr><th>Employee</th><th>Type</th><th className="text-end">Amount</th><th className="text-end">Balance</th><th>Status</th><th>Effective</th></tr></thead>
                            <tbody>
                                {rows.map((a) => (
                                    <tr key={a.id}>
                                        <td>{a.employee?.name || "—"}</td>
                                        <td><span className="badge bg-secondary text-capitalize">{a.type}</span></td>
                                        <td className="text-end">{money(a.amount)}</td>
                                        <td className="text-end">{a.balance != null ? money(a.balance) : "—"}</td>
                                        <td>{a.status || "—"}</td>
                                        <td>{a.effective_date ? new Date(a.effective_date).toLocaleDateString() : "—"}</td>
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
