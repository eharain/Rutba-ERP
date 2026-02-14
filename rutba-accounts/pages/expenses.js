import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function Expenses() {
    const { jwt } = useAuth();
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/acc-expenses?sort=date:desc", {}, jwt)
            .then((res) => setExpenses(res.data || []))
            .catch((err) => console.error("Failed to load expenses", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Expenses</h2>

                {loading && <p>Loading expenses...</p>}

                {!loading && expenses.length === 0 && (
                    <div className="alert alert-info">No expenses found.</div>
                )}

                {!loading && expenses.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                    <th>Paid Via</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.map((exp) => (
                                    <tr key={exp.id}>
                                        <td>{new Date(exp.date).toLocaleDateString()}</td>
                                        <td>{exp.category || "—"}</td>
                                        <td>{exp.description || "—"}</td>
                                        <td>{exp.amount != null ? exp.amount.toFixed(2) : "0.00"}</td>
                                        <td>{exp.payment_method || "—"}</td>
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
