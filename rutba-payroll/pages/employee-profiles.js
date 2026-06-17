import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { PayEmployeeProfilesEndpoints } from "@rutba/api-provider/endpoints";

export default function EmployeeProfiles() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        PayEmployeeProfilesEndpoints.list()
            .then((res) => setRows(res.data || []))
            .catch((err) => console.error("Failed to load pay profiles", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Employee Pay Profiles</h2>
                <p className="text-muted small">Per-employee pay type, bank and statutory details — held behind the payroll role, off the HR record.</p>

                {loading && <p>Loading profiles…</p>}
                {!loading && rows.length === 0 && <div className="alert alert-info">No pay profiles found.</div>}

                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark"><tr><th>Employee</th><th>Pay type</th><th>Bank</th><th>Account #</th><th>Active</th></tr></thead>
                            <tbody>
                                {rows.map((p) => (
                                    <tr key={p.id}>
                                        <td>{p.employee?.name || "—"}</td>
                                        <td><span className="badge bg-secondary">{p.pay_type || "—"}</span></td>
                                        <td>{p.bank_name || "—"}</td>
                                        <td>{p.bank_account_number || "—"}</td>
                                        <td>{p.is_active ? "Yes" : "No"}</td>
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
