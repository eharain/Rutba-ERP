import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function JournalEntries() {
    const { jwt } = useAuth();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/acc-journal-entries?sort=date:desc", {}, jwt)
            .then((res) => setEntries(res.data || []))
            .catch((err) => console.error("Failed to load journal entries", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Journal Entries</h2>

                {loading && <p>Loading journal entries...</p>}

                {!loading && entries.length === 0 && (
                    <div className="alert alert-info">No journal entries found.</div>
                )}

                {!loading && entries.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Date</th>
                                    <th>Reference</th>
                                    <th>Description</th>
                                    <th>Debit</th>
                                    <th>Credit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((e) => (
                                    <tr key={e.id}>
                                        <td>{new Date(e.date).toLocaleDateString()}</td>
                                        <td>{e.reference || "—"}</td>
                                        <td>{e.description || "—"}</td>
                                        <td>{e.debit != null ? e.debit.toFixed(2) : "0.00"}</td>
                                        <td>{e.credit != null ? e.credit.toFixed(2) : "0.00"}</td>
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
