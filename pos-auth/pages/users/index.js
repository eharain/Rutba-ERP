import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../../components/AppAccessGate";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => { loadUsers(); }, []);

    async function loadUsers() {
        setLoading(true);
        try {
            const data = await authApi.get("/auth-admin/users");
            setUsers(Array.isArray(data) ? data : data?.data || []);
        } catch (err) {
            console.error("Failed to load users", err);
        } finally {
            setLoading(false);
        }
    }

    const filtered = users.filter(u => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (u.username || "").toLowerCase().includes(q)
            || (u.email || "").toLowerCase().includes(q)
            || (u.displayName || "").toLowerCase().includes(q);
    });

    return (
        <Layout>
            <ProtectedRoute>
                <AppAccessGate appKey="auth">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2><i className="fas fa-users me-2"></i>Users</h2>
                    <div className="d-flex gap-2">
                        <Link href="/users/access-assignment" className="btn btn-outline-primary">
                            <i className="fas fa-user-shield me-1"></i> Access Assignment
                        </Link>
                        <Link href="/users/new" className="btn btn-primary">
                            <i className="fas fa-plus me-1"></i> New User
                        </Link>
                    </div>
                </div>

                <div className="mb-3">
                    <input
                        className="form-control"
                        placeholder="Search by name, email, or username..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {loading ? (
                    <p>Loading users...</p>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead className="table-dark">
                                <tr>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>App Access</th>
                                    <th>Status</th>
                                    <th style={{ width: "120px" }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 && (
                                    <tr><td colSpan="5" className="text-center text-muted py-4">No users found</td></tr>
                                )}
                                {filtered.map(u => {
                                    const regularApps = (u.app_accesses || []).filter(
                                        a => !(u.admin_app_accesses || []).some(aa => aa.id === a.id)
                                    );
                                    const adminApps = u.admin_app_accesses || [];

                                    return (
                                        <tr key={u.id}>
                                            <td>
                                                <div className="fw-semibold">{u.displayName || '—'}</div>
                                                <div className="small text-muted">
                                                    <i className="fas fa-user me-1"></i>
                                                    {u.username}
                                                </div>
                                                <div className="small text-muted">
                                                    <i className="fas fa-envelope me-1"></i>
                                                    {u.email}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge bg-secondary">
                                                    <i className="fas fa-shield-alt me-1"></i>
                                                    {u.role?.name || 'No Role'}
                                                </span>
                                            </td>
                                            <td>
                                                {adminApps.length === 0 && regularApps.length === 0 ? (
                                                    <span className="text-muted">None</span>
                                                ) : (
                                                    <div>
                                                        {adminApps.map(a => (
                                                            <span key={a.id} className="badge bg-warning text-dark me-1 mb-1">
                                                                <i className="fas fa-star me-1"></i>
                                                                {a.name || a.key}
                                                            </span>
                                                        ))}
                                                        {regularApps.map(a => (
                                                            <span key={a.id} className="badge bg-info me-1 mb-1">
                                                                <i className="fas fa-user me-1"></i>
                                                                {a.name || a.key}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                {u.blocked
                                                    ? <span className="badge bg-danger"><i className="fas fa-ban me-1"></i>Blocked</span>
                                                    : u.confirmed
                                                        ? <span className="badge bg-success"><i className="fas fa-check-circle me-1"></i>Active</span>
                                                        : <span className="badge bg-warning text-dark"><i className="fas fa-exclamation-circle me-1"></i>Unconfirmed</span>
                                                }
                                            </td>
                                            <td>
                                                <Link href={`/users/${u.id}`} className="btn btn-sm btn-outline-primary">
                                                    <i className="fas fa-edit me-1"></i>
                                                    Edit
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                    </AppAccessGate>
                </ProtectedRoute>
            </Layout>
    );
}

