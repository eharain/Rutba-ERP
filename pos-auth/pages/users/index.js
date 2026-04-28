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
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

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

    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, pageCount);
    const startIndex = filtered.length === 0 ? 0 : (safePage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const pagedUsers = filtered.slice(startIndex, endIndex);

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
                        onChange={e => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                    />
                </div>

                <div className="d-flex justify-content-between align-items-center mb-2">
                    <small className="text-muted">
                        Showing {filtered.length === 0 ? 0 : startIndex + 1}–{endIndex} of {filtered.length}
                    </small>
                    <div className="d-flex align-items-center gap-2">
                        <label className="small text-muted mb-0">Page size</label>
                        <select
                            className="form-select form-select-sm"
                            style={{ width: 90 }}
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(1);
                            }}
                        >
                            {[10, 25, 50, 100].map((size) => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <p>Loading users...</p>
                ) : (
                    <>
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
                                    {pagedUsers.map(u => {
                                    const regularApps = (u.app_accesses || []).filter(
                                        a => !(u.admin_app_accesses || []).some(aa => aa.id === a.id)
                                    );
                                    const adminApps = u.admin_app_accesses || [];

                                    return (
                                        <tr key={u.id}>
                                            <td>
                                                <div className="fw-semibold">
                                                    <Link href={`/users/${u.id}`} className="text-decoration-none">
                                                        {u.displayName || u.username || u.email || '—'}
                                                    </Link>
                                                </div>
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

                        <div className="d-flex justify-content-between align-items-center mt-3">
                            <small className="text-muted">Page {safePage} of {pageCount}</small>
                            <div className="btn-group btn-group-sm" role="group" aria-label="Users pagination">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    disabled={safePage >= pageCount}
                                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
                    </AppAccessGate>
                </ProtectedRoute>
            </Layout>
    );
}

