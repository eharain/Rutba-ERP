import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { AccJournalEntriesEndpoints } from "@rutba/api-provider/endpoints";

export default function JournalEntries() {
    const { jwt } = useAuth();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        AccJournalEntriesEndpoints.list()
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
                                        <td>{Number(e.total_debit || 0).toFixed(2)}</td>
                                        <td>{Number(e.total_credit || 0).toFixed(2)}</td>
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
