import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrAssetsEndpoints, HrAssetAssignmentsEndpoints, HrEmployeesEndpoints } from "@rutba/api-provider/endpoints";

export default function Assets() {
    const { jwt } = useAuth();
    const [assets, setAssets] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [assignFor, setAssignFor] = useState(null);
    const [assignEmployee, setAssignEmployee] = useState("");

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const [assetRes, assignRes, empRes] = await Promise.all([
                HrAssetsEndpoints.list(),
                HrAssetAssignmentsEndpoints.list({ filters: { return_date: { $null: true } } }),
                HrEmployeesEndpoints.list(),
            ]);
            setAssets(assetRes?.data || []);
            setAssignments(assignRes?.data || []);
            setEmployees(empRes?.data || []);
        } catch (err) {
            console.error("Failed to load assets", err);
        } finally {
            setLoading(false);
        }
    }

    function activeAssignmentFor(assetDocId) {
        return assignments.find((a) => a.asset?.documentId === assetDocId);
    }

    async function doAssign(assetDocId) {
        if (!assignEmployee) return;
        try {
            await HrAssetsEndpoints.assign(assetDocId, { employee: assignEmployee });
            setAssignFor(null);
            setAssignEmployee("");
            await load();
        } catch (err) {
            console.error("Failed to assign asset", err);
            alert("Failed to assign asset.");
        }
    }

    async function doReturn(assignmentDocId) {
        if (!confirm("Mark this asset as returned?")) return;
        try {
            await HrAssetAssignmentsEndpoints.returnAsset(assignmentDocId, {});
            await load();
        } catch (err) {
            console.error("Failed to return asset", err);
            alert("Failed to process return.");
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Asset Register</h2>
                <p className="text-muted small">Create/edit assets via the Strapi admin content manager; assign and return them here.</p>

                {loading && <p>Loading…</p>}
                {!loading && assets.length === 0 && <div className="alert alert-info">No assets found.</div>}
                {!loading && assets.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover align-middle">
                            <thead className="table-dark">
                                <tr><th>Name</th><th>Tag</th><th>Category</th><th>Status</th><th>Assigned To</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                {assets.map((a) => {
                                    const active = activeAssignmentFor(a.documentId);
                                    return (
                                        <tr key={a.id}>
                                            <td>{a.name}</td>
                                            <td>{a.asset_tag || "—"}</td>
                                            <td>{a.category}</td>
                                            <td><span className={`badge bg-${a.status === "Available" ? "success" : a.status === "Assigned" ? "primary" : "secondary"}`}>{a.status}</span></td>
                                            <td>{active?.employee?.name || "—"}</td>
                                            <td>
                                                {a.status === "Available" && assignFor !== a.documentId && (
                                                    <button className="btn btn-sm btn-outline-primary" onClick={() => setAssignFor(a.documentId)}>Assign</button>
                                                )}
                                                {assignFor === a.documentId && (
                                                    <div className="d-flex gap-1">
                                                        <select className="form-select form-select-sm" style={{ width: 160 }} value={assignEmployee} onChange={(e) => setAssignEmployee(e.target.value)}>
                                                            <option value="">Select employee…</option>
                                                            {employees.map((e) => <option key={e.documentId} value={e.documentId}>{e.name}</option>)}
                                                        </select>
                                                        <button className="btn btn-sm btn-primary" onClick={() => doAssign(a.documentId)}>Confirm</button>
                                                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setAssignFor(null)}>Cancel</button>
                                                    </div>
                                                )}
                                                {a.status === "Assigned" && active && (
                                                    <button className="btn btn-sm btn-outline-warning" onClick={() => doReturn(active.documentId)}>Return</button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
