import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function ChartOfAccounts() {
    const { jwt } = useAuth();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/acc-accounts?sort=code:asc", {}, jwt)
            .then((res) => setAccounts(res.data || []))
            .catch((err) => console.error("Failed to load accounts", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Chart of Accounts</h2>

                {loading && <p>Loading accounts...</p>}

                {!loading && accounts.length === 0 && (
                    <div className="alert alert-info">No accounts found.</div>
                )}

                {!loading && accounts.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Code</th>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((a) => (
                                    <tr key={a.id}>
                                        <td>{a.code}</td>
                                        <td>{a.name}</td>
                                        <td>
                                            <span className="badge bg-secondary">{a.account_type || "—"}</span>
                                        </td>
                                        <td>{a.balance != null ? a.balance.toFixed(2) : "0.00"}</td>
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
