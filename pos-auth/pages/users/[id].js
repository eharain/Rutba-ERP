import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../../components/AppAccessGate";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function EditUserPage() {
    const router = useRouter();
    const { id } = router.query;

    const [roles, setRoles] = useState([]);
    const [appAccesses, setAppAccesses] = useState([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [form, setForm] = useState({
        username: "",
        displayName: "",
        email: "",
        password: "",
        confirmed: true,
        blocked: false,
        role: "",
        app_accesses: [],
        admin_app_accesses: [],
    });

    useEffect(() => {
        if (id) loadAll();
    }, [id]);

    async function loadAll() {
        setLoading(true);
        try {
            const [userData, rolesRes, aaRes] = await Promise.all([
                authApi.get(`/auth-admin/users/${id}`),
                authApi.get("/auth-admin/roles"),
                authApi.get("/app-accesses"),
            ]);

            setRoles(rolesRes?.roles || []);
            setAppAccesses(aaRes?.data || aaRes || []);

            const u = userData?.data || userData;
            setForm({
                username: u.username || "",
                displayName: u.displayName || "",
                email: u.email || "",
                password: "",
                confirmed: u.confirmed ?? true,
                blocked: u.blocked ?? false,
                role: u.role?.id || "",
                app_accesses: (u.app_accesses || []).map(a => a.id),
                admin_app_accesses: (u.admin_app_accesses || []).map(a => a.id),
            });
        } catch (err) {
            setError("Failed to load user: " + (err.message || ""));
        } finally {
            setLoading(false);
        }
    }

    function setField(field, value) {
        setForm(prev => ({ ...prev, [field]: value }));
    }

    function toggleAppAccess(aaId, kind) {
        setForm(prev => {
            const appSet = new Set(prev.app_accesses);
            const adminSet = new Set(prev.admin_app_accesses);

            if (kind === "user") {
                if (appSet.has(aaId)) {
                    appSet.delete(aaId);
                    adminSet.delete(aaId); // Remove admin if removing user
                } else {
                    appSet.add(aaId);
                }
            }

            if (kind === "admin") {
                if (adminSet.has(aaId)) {
                    adminSet.delete(aaId);
                } else {
                    adminSet.add(aaId);
                    appSet.add(aaId); // Admin implies user
                }
            }

            return {
                ...prev,
                app_accesses: Array.from(appSet),
                admin_app_accesses: Array.from(adminSet),
            };
        });
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setSuccess("");
        setSaving(true);
        try {
            const payload = {
                username: form.username,
                displayName: form.displayName,
                email: form.email,
                confirmed: form.confirmed,
                blocked: form.blocked,
                role: form.role || undefined,
                app_accesses: form.app_accesses,
                admin_app_accesses: form.admin_app_accesses,
            };
            // Only include password if the admin typed a new one
            if (form.password) {
                payload.password = form.password;
            }
            await authApi.put(`/auth-admin/users/${id}`, payload);
            setSuccess("User updated successfully.");
        } catch (err) {
            const msg = err?.response?.data?.error?.message || err.message || "Failed to update user";
            setError(msg);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;
        try {
            await authApi.del(`/auth-admin/users/${id}`);
            router.push("/users");
        } catch (err) {
            setError("Failed to delete user: " + (err.message || ""));
        }
    }

    if (loading) return <Layout><ProtectedRoute><AppAccessGate appKey="auth"><p>Loading user...</p></AppAccessGate></ProtectedRoute></Layout>;

    return (
        <Layout>
            <ProtectedRoute>
                <AppAccessGate appKey="auth">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2><i className="fas fa-user-edit me-2"></i>Edit User</h2>
                    <button className="btn btn-outline-danger btn-sm" onClick={handleDelete}>
                        <i className="fas fa-trash me-1"></i> Delete User
                    </button>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                <form onSubmit={handleSubmit}>
                    {/* Account Information Section */}
                    <div className="card mb-4">
                        <div className="card-header bg-light">
                            <h5 className="mb-0">
                                <i className="fas fa-user me-2"></i>
                                Account Information
                            </h5>
                        </div>
                        <div className="card-body">
                            <div className="row g-3">
                                <div className="col-md-6">
                                    <label className="form-label fw-semibold">Username <span className="text-danger">*</span></label>
                                    <input className="form-control" value={form.username} onChange={e => setField("username", e.target.value)} required />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label fw-semibold">Display Name</label>
                                    <input className="form-control" value={form.displayName} onChange={e => setField("displayName", e.target.value)} />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label fw-semibold">Email <span className="text-danger">*</span></label>
                                    <input className="form-control" type="email" value={form.email} onChange={e => setField("email", e.target.value)} required />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label fw-semibold">
                                        New Password
                                        <small className="text-muted fw-normal ms-2">(leave blank to keep current)</small>
                                    </label>
                                    <input className="form-control" type="password" value={form.password} onChange={e => setField("password", e.target.value)} minLength={6} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* User Type & Permissions Section */}
                    <div className="card mb-4">
                        <div className="card-header bg-light">
                            <h5 className="mb-0">
                                <i className="fas fa-shield-alt me-2"></i>
                                User Type & API Permissions
                            </h5>
                        </div>
                        <div className="card-body">
                            <div className="alert alert-info mb-3">
                                <i className="fas fa-info-circle me-2"></i>
                                <strong>Role</strong> determines API permissions and backend access rights. This is separate from App Access below.
                            </div>
                            <div className="row g-3">
                                <div className="col-md-6">
                                    <label className="form-label fw-semibold">Role</label>
                                    <select className="form-select" value={form.role} onChange={e => setField("role", e.target.value)}>
                                        <option value="">— No Role —</option>
                                        {roles.map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
                                    </select>
                                    <div className="form-text">Defines what API endpoints this user can access</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* App Access Section */}
                    <div className="card mb-4">
                        <div className="card-header bg-light">
                            <h5 className="mb-0">
                                <i className="fas fa-desktop me-2"></i>
                                Application Access
                            </h5>
                        </div>
                        <div className="card-body">
                            <div className="alert alert-info mb-3">
                                <i className="fas fa-info-circle me-2"></i>
                                Grant access to front-end applications. <strong>User</strong> access provides basic permissions, <strong>Admin</strong> access provides elevated privileges (and automatically includes user access).
                            </div>
                            {appAccesses.length === 0 ? (
                                <span className="text-muted">No applications configured</span>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-hover align-middle mb-0">
                                        <thead className="table-light">
                                            <tr>
                                                <th style={{ width: "50%" }}>Application</th>
                                                <th className="text-center" style={{ width: "25%" }}>
                                                    <i className="fas fa-user me-1"></i>
                                                    User Access
                                                </th>
                                                <th className="text-center" style={{ width: "25%" }}>
                                                    <i className="fas fa-user-shield me-1"></i>
                                                    Admin Access
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {appAccesses.map(aa => {
                                                const hasUser = form.app_accesses.includes(aa.id);
                                                const hasAdmin = form.admin_app_accesses.includes(aa.id);
                                                return (
                                                    <tr key={aa.id}>
                                                        <td>
                                                            <div className="fw-semibold">{aa.name}</div>
                                                            {aa.description && (
                                                                <div className="small text-muted">{aa.description}</div>
                                                            )}
                                                            <div className="small">
                                                                <code className="text-muted">{aa.key}</code>
                                                            </div>
                                                        </td>
                                                        <td className="text-center">
                                                            <div className="form-check form-switch d-inline-block">
                                                                <input
                                                                    className="form-check-input"
                                                                    type="checkbox"
                                                                    id={`aa-user-${aa.id}`}
                                                                    checked={hasUser}
                                                                    disabled={hasAdmin}
                                                                    onChange={() => toggleAppAccess(aa.id, "user")}
                                                                />
                                                            </div>
                                                            {hasUser && !hasAdmin && (
                                                                <i className="fas fa-check text-success ms-1"></i>
                                                            )}
                                                        </td>
                                                        <td className="text-center">
                                                            <div className="form-check form-switch d-inline-block">
                                                                <input
                                                                    className="form-check-input"
                                                                    type="checkbox"
                                                                    id={`aa-admin-${aa.id}`}
                                                                    checked={hasAdmin}
                                                                    onChange={() => toggleAppAccess(aa.id, "admin")}
                                                                />
                                                            </div>
                                                            {hasAdmin && (
                                                                <i className="fas fa-star text-warning ms-1"></i>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Account Status Section */}
                    <div className="card mb-4">
                        <div className="card-header bg-light">
                            <h5 className="mb-0">
                                <i className="fas fa-toggle-on me-2"></i>
                                Account Status
                            </h5>
                        </div>
                        <div className="card-body">
                            <div className="row g-3">
                                <div className="col-md-6">
                                    <div className="form-check form-switch">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id="confirmed-switch"
                                            checked={form.confirmed}
                                            onChange={e => setField("confirmed", e.target.checked)}
                                        />
                                        <label className="form-check-label fw-semibold" htmlFor="confirmed-switch">
                                            Email Confirmed
                                        </label>
                                        <div className="form-text">User has verified their email address</div>
                                    </div>
                                </div>
                                <div className="col-md-6">
                                    <div className="form-check form-switch">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id="blocked-switch"
                                            checked={form.blocked}
                                            onChange={e => setField("blocked", e.target.checked)}
                                        />
                                        <label className="form-check-label fw-semibold" htmlFor="blocked-switch">
                                            Account Blocked
                                        </label>
                                        <div className="form-text">Prevent user from signing in</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="d-flex gap-2">
                        <button type="submit" className="btn btn-success" disabled={saving}>
                            <i className="fas fa-save me-1"></i>
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                        <button type="button" className="btn btn-outline-primary" onClick={() => router.push("/users/access-assignment") }>
                            <i className="fas fa-user-shield me-1"></i>
                            Access Assignment
                        </button>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => router.push("/users")}>
                            <i className="fas fa-arrow-left me-1"></i>
                            Back to Users
                        </button>
                    </div>
                </form>
                    </AppAccessGate>
                </ProtectedRoute>
            </Layout>
    );
}

