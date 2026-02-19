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
            const data = await authApi.get("/users", {
                populate: ["role", "app_accesses"],
            });
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
                    <Link href="/users/new" className="btn btn-primary">
                        <i className="fas fa-plus me-1"></i> New User
                    </Link>
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
                                    <th>Name</th>
                                    <th>Username</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>App Access</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 && (
                                    <tr><td colSpan="7" className="text-center text-muted py-4">No users found</td></tr>
                                )}
                                {filtered.map(u => (
                                    <tr key={u.id}>
                                        <td>{u.displayName || '—'}</td>
                                        <td><code>{u.username}</code></td>
                                        <td>{u.email}</td>
                                        <td>
                                            <span className="badge bg-secondary">{u.role?.name || '—'}</span>
                                        </td>
                                        <td>
                                            {(u.app_accesses || []).length === 0
                                                ? <span className="text-muted">None</span>
                                                : (u.app_accesses || []).map(a => (
                                                    <span key={a.id} className="badge bg-info me-1">{a.name || a.key}</span>
                                                ))
                                            }
                                        </td>
                                        <td>
                                            {u.blocked
                                                ? <span className="badge bg-danger">Blocked</span>
                                                : u.confirmed
                                                    ? <span className="badge bg-success">Active</span>
                                                    : <span className="badge bg-warning text-dark">Unconfirmed</span>
                                            }
                                        </td>
                                        <td>
                                            <Link href={`/users/${u.id}`} className="btn btn-sm btn-outline-primary">
                                                <i className="fas fa-edit"></i>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                    </AppAccessGate>
                </ProtectedRoute>
            </Layout>
    );
}

export async function getServerSideProps() { return { props: {} }; }
