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
    });

    useEffect(() => {
        if (id) loadAll();
    }, [id]);

    async function loadAll() {
        setLoading(true);
        try {
            const [userData, rolesRes, aaRes] = await Promise.all([
                authApi.get(`/users/${id}`, { populate: ["role", "app_accesses"] }),
                authApi.get("/users-permissions/roles"),
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

    function toggleAppAccess(aaId) {
        setForm(prev => {
            const current = prev.app_accesses;
            return {
                ...prev,
                app_accesses: current.includes(aaId) ? current.filter(a => a !== aaId) : [...current, aaId],
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
            };
            // Only include password if the admin typed a new one
            if (form.password) {
                payload.password = form.password;
            }
            await authApi.put(`/users/${id}`, payload);
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
            await authApi.del(`/users/${id}`);
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
                    <div className="row g-3">
                        <div className="col-md-6">
                            <label className="form-label">Username</label>
                            <input className="form-control" value={form.username} onChange={e => setField("username", e.target.value)} required />
                        </div>
                        <div className="col-md-6">
                            <label className="form-label">Display Name</label>
                            <input className="form-control" value={form.displayName} onChange={e => setField("displayName", e.target.value)} />
                        </div>
                        <div className="col-md-6">
                            <label className="form-label">Email</label>
                            <input className="form-control" type="email" value={form.email} onChange={e => setField("email", e.target.value)} required />
                        </div>
                        <div className="col-md-6">
                            <label className="form-label">New Password <small className="text-muted">(leave blank to keep current)</small></label>
                            <input className="form-control" type="password" value={form.password} onChange={e => setField("password", e.target.value)} minLength={6} />
                        </div>

                        {/* Role */}
                        <div className="col-md-6">
                            <label className="form-label">Role (API permissions)</label>
                            <select className="form-select" value={form.role} onChange={e => setField("role", e.target.value)}>
                                <option value="">— Select —</option>
                                {roles.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status */}
                        <div className="col-md-3">
                            <label className="form-label">Confirmed</label>
                            <div className="form-check form-switch mt-1">
                                <input className="form-check-input" type="checkbox" checked={form.confirmed} onChange={e => setField("confirmed", e.target.checked)} />
                            </div>
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">Blocked</label>
                            <div className="form-check form-switch mt-1">
                                <input className="form-check-input" type="checkbox" checked={form.blocked} onChange={e => setField("blocked", e.target.checked)} />
                            </div>
                        </div>

                        {/* App Access */}
                        <div className="col-12">
                            <label className="form-label fw-bold">App Access</label>
                            <div className="d-flex flex-wrap gap-3">
                                {appAccesses.map(aa => (
                                    <div key={aa.id} className="form-check">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={`aa-${aa.id}`}
                                            checked={form.app_accesses.includes(aa.id)}
                                            onChange={() => toggleAppAccess(aa.id)}
                                        />
                                        <label className="form-check-label" htmlFor={`aa-${aa.id}`}>
                                            {aa.name} <small className="text-muted">({aa.key})</small>
                                        </label>
                                    </div>
                                ))}
                                {appAccesses.length === 0 && <span className="text-muted">No app-access entries found</span>}
                            </div>
                        </div>
                    </div>

                    <div className="d-flex gap-2 mt-4">
                        <button type="submit" className="btn btn-success" disabled={saving}>
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => router.push("/users")}>
                            Back to Users
                        </button>
                    </div>
                </form>
                    </AppAccessGate>
                </ProtectedRoute>
            </Layout>
    );
}

export async function getServerSideProps() { return { props: {} }; }
