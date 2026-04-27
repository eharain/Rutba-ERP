import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

const STATUS_OPTIONS = ["Active", "Inactive", "Terminated", "On Leave"];

export default function HrEmployeeManagementPage() {
    const { jwt } = useAuth();
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState("");

    const [form, setForm] = useState({
        name: "",
        email: "",
        phone: "",
        designation: "",
        date_of_joining: "",
        status: "Active",
        address: "",
        department: "",
        user: "",
    });

    useEffect(() => {
        if (jwt) loadAll();
    }, [jwt]);

    async function loadAll() {
        setLoading(true);
        try {
            const [empRes, depRes, usersRes] = await Promise.all([
                authApi.get("/hr-employees?sort=name:asc&populate=department,user", {}, jwt),
                authApi.get("/hr-departments?sort=name:asc", {}, jwt),
                authApi.get("/auth-admin/users", {}, jwt),
            ]);
            setEmployees(empRes?.data || []);
            setDepartments(depRes?.data || []);
            setUsers(Array.isArray(usersRes) ? usersRes : usersRes?.data || []);
        } catch (err) {
            console.error("Failed to load HR employee management data", err);
        } finally {
            setLoading(false);
        }
    }

    function setField(field, value) {
        setForm((p) => ({ ...p, [field]: value }));
    }

    function resetForm() {
        setEditingId("");
        setForm({
            name: "",
            email: "",
            phone: "",
            designation: "",
            date_of_joining: "",
            status: "Active",
            address: "",
            department: "",
            user: "",
        });
    }

    function startEdit(employee) {
        setEditingId(employee.documentId);
        setForm({
            name: employee.name || "",
            email: employee.email || "",
            phone: employee.phone || "",
            designation: employee.designation || "",
            date_of_joining: employee.date_of_joining || "",
            status: employee.status || "Active",
            address: employee.address || "",
            department: employee.department?.documentId || "",
            user: employee.user?.id ? String(employee.user.id) : "",
        });
    }

    async function submit(e) {
        e.preventDefault();
        if (!form.name.trim()) return;

        const payload = {
            data: {
                name: form.name.trim(),
                email: form.email.trim() || null,
                phone: form.phone.trim() || null,
                designation: form.designation.trim() || null,
                date_of_joining: form.date_of_joining || null,
                status: form.status,
                address: form.address.trim() || null,
                department: form.department ? { documentId: form.department } : null,
                user: form.user ? { id: Number(form.user) } : null,
            },
        };

        setSaving(true);
        try {
            if (editingId) {
                await authApi.put(`/hr-employees/${editingId}`, payload, jwt);
            } else {
                await authApi.post("/hr-employees", payload, jwt);
            }
            resetForm();
            await loadAll();
        } catch (err) {
            console.error("Failed to save HR employee", err);
        } finally {
            setSaving(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">HR Employee Management</h2>
                    <button className="btn btn-sm btn-outline-secondary" onClick={loadAll}>
                        <i className="fas fa-rotate me-1" />Refresh
                    </button>
                </div>

                <div className="card mb-4">
                    <div className="card-header bg-light fw-semibold">{editingId ? "Edit Employee" : "Create Employee"}</div>
                    <div className="card-body">
                        <form onSubmit={submit}>
                            <div className="row g-3">
                                <div className="col-md-4">
                                    <label className="form-label">Name</label>
                                    <input className="form-control" value={form.name} onChange={(e) => setField("name", e.target.value)} required />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Email</label>
                                    <input className="form-control" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Phone</label>
                                    <input className="form-control" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Designation</label>
                                    <input className="form-control" value={form.designation} onChange={(e) => setField("designation", e.target.value)} />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Date of Joining</label>
                                    <input className="form-control" type="date" value={form.date_of_joining} onChange={(e) => setField("date_of_joining", e.target.value)} />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Status</label>
                                    <select className="form-select" value={form.status} onChange={(e) => setField("status", e.target.value)}>
                                        {STATUS_OPTIONS.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label">Department</label>
                                    <select className="form-select" value={form.department} onChange={(e) => setField("department", e.target.value)}>
                                        <option value="">— None —</option>
                                        {departments.map((d) => (
                                            <option key={d.documentId} value={d.documentId}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label">Linked Auth User</label>
                                    <select className="form-select" value={form.user} onChange={(e) => setField("user", e.target.value)}>
                                        <option value="">— Not Linked —</option>
                                        {users.map((u) => (
                                            <option key={u.id} value={u.id}>{u.displayName || u.username} ({u.email})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-12">
                                    <label className="form-label">Address</label>
                                    <textarea className="form-control" rows={3} value={form.address} onChange={(e) => setField("address", e.target.value)} />
                                </div>
                            </div>
                            <div className="d-flex gap-2 mt-3">
                                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Update Employee" : "Create Employee"}</button>
                                {editingId && <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>Cancel Edit</button>}
                            </div>
                        </form>
                    </div>
                </div>

                {loading && <p>Loading employees...</p>}

                {!loading && employees.length === 0 && (
                    <div className="alert alert-info">No employees found.</div>
                )}

                {!loading && employees.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Department</th>
                                    <th>Designation</th>
                                    <th>Status</th>
                                    <th>User</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map((e) => (
                                    <tr key={e.id}>
                                        <td>{e.name}</td>
                                        <td>{e.department?.name || "—"}</td>
                                        <td>{e.designation || "—"}</td>
                                        <td>{e.status || "—"}</td>
                                        <td>{e.user?.username || e.user?.email || "—"}</td>
                                        <td>
                                            <button className="btn btn-sm btn-outline-primary" onClick={() => startEdit(e)}>Edit</button>
                                        </td>
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
