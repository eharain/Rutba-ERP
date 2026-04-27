import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function EmployeeDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [linkDraft, setLinkDraft] = useState("");
    const [savingLink, setSavingLink] = useState(false);

    useEffect(() => {
        if (!jwt || !documentId) return;
        authApi.get(`/hr-employees/${documentId}?populate=*`, {}, jwt)
            .then((res) => setEmployee(res.data || res))
            .catch((err) => console.error("Failed to load employee", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/auth-admin/users", {}, jwt)
            .then((res) => {
                const rows = Array.isArray(res) ? res : res?.data || [];
                setUsers(rows);
            })
            .catch((err) => console.error("Failed to load users", err));
    }, [jwt]);

    useEffect(() => {
        if (employee?.user?.id) {
            setLinkDraft(String(employee.user.id));
        } else {
            setLinkDraft("");
        }
    }, [employee]);

    async function saveUserLink() {
        if (!employee?.documentId) return;
        setSavingLink(true);
        try {
            await authApi.put(`/hr-employees/${employee.documentId}`, {
                data: {
                    user: linkDraft ? { id: Number(linkDraft) } : null,
                },
            }, jwt);

            const res = await authApi.get(`/hr-employees/${employee.documentId}?populate=*`, {}, jwt);
            setEmployee(res.data || res);
        } catch (err) {
            console.error("Failed to save employee-user link", err);
        } finally {
            setSavingLink(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/employees">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Employee Details</h2>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !employee && (
                    <div className="alert alert-warning">Employee not found.</div>
                )}

                {!loading && employee && (
                    <div className="row">
                        <div className="col-md-6">
                            <div className="card">
                                <div className="card-header"><strong>{employee.name}</strong></div>
                                <div className="card-body">
                                    <p><strong>Email:</strong> {employee.email || "—"}</p>
                                    <p><strong>Phone:</strong> {employee.phone || "—"}</p>
                                    <p><strong>Department:</strong> {employee.department?.name || "—"}</p>
                                    <p><strong>Designation:</strong> {employee.designation || "—"}</p>
                                    <p><strong>Linked User:</strong> {employee.user?.username || employee.user?.email || "—"}</p>
                                    <p><strong>Date of Joining:</strong> {employee.date_of_joining ? new Date(employee.date_of_joining).toLocaleDateString() : "—"}</p>
                                    <p><strong>Status:</strong>{" "}
                                        <span className={`badge bg-${employee.status === "Active" ? "success" : "secondary"}`}>
                                            {employee.status || "—"}
                                        </span>
                                    </p>
                                    <p><strong>Address:</strong> {employee.address || "—"}</p>

                                    <div className="border-top pt-3 mt-3">
                                        <label className="form-label fw-semibold">Link Auth User</label>
                                        <div className="d-flex gap-2">
                                            <select
                                                className="form-select"
                                                value={linkDraft}
                                                onChange={(e) => setLinkDraft(e.target.value)}
                                            >
                                                <option value="">— Not Linked —</option>
                                                {users.map((u) => (
                                                    <option key={u.id} value={u.id}>
                                                        {u.displayName || u.username} ({u.email})
                                                    </option>
                                                ))}
                                            </select>
                                            <button className="btn btn-primary" onClick={saveUserLink} disabled={savingLink}>
                                                {savingLink ? "Saving..." : "Save Link"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

