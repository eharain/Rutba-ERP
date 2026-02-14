import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function Activities() {
    const { jwt } = useAuth();
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/crm-activities?sort=date:desc", {}, jwt)
            .then((res) => setActivities(res.data || []))
            .catch((err) => console.error("Failed to load activities", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Activities</h2>

                {loading && <p>Loading activities...</p>}

                {!loading && activities.length === 0 && (
                    <div className="alert alert-info">No activities recorded yet.</div>
                )}

                {!loading && activities.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Subject</th>
                                    <th>Contact</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activities.map((a) => (
                                    <tr key={a.id}>
                                        <td>{new Date(a.date).toLocaleDateString()}</td>
                                        <td>
                                            <span className="badge bg-secondary">{a.type || "Note"}</span>
                                        </td>
                                        <td>{a.subject}</td>
                                        <td>{a.contact?.name || "—"}</td>
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
