import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { HrAssetAssignmentsEndpoints } from "@rutba/api-provider/endpoints";

export default function MyAssets() {
    const { jwt } = useAuth();
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await HrAssetAssignmentsEndpoints.listMine();
            setAssignments(res?.data || []);
        } catch (err) {
            console.error("Failed to load assets", err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">My Assets</h2>

                {loading && <p>Loading…</p>}
                {!loading && assignments.length === 0 && (
                    <div className="alert alert-info">No assets assigned to you.</div>
                )}
                {!loading && assignments.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr><th>Asset</th><th>Tag</th><th>Category</th><th>Assigned</th><th>Returned</th></tr>
                            </thead>
                            <tbody>
                                {assignments.map((a) => (
                                    <tr key={a.id}>
                                        <td>{a.asset?.name || "—"}</td>
                                        <td>{a.asset?.asset_tag || "—"}</td>
                                        <td>{a.asset?.category || "—"}</td>
                                        <td>{a.assigned_date ? new Date(a.assigned_date).toLocaleDateString() : "—"}</td>
                                        <td>{a.return_date ? new Date(a.return_date).toLocaleDateString() : <span className="badge bg-success">In use</span>}</td>
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
