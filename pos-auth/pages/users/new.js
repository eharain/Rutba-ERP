import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../../components/AppAccessGate";
import { AuthAdminEndpoints, AppAccessesEndpoints } from "@rutba/api-provider/endpoints";

export default function NewUserPage() {
    const router = useRouter();
    const [roles, setRoles] = useState([]);
    const [appAccesses, setAppAccesses] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        username: "",
        displayName: "",
        email: "",
        password: "",
        confirmed: true,
        blocked: false,
        role: "",
        domain_accesses: [],
        admin_domain_accesses: [],
    });

    useEffect(() => {
        loadOptions();
    }, []);

    async function loadOptions() {
        try {
            const [rolesRes, aaRes] = await Promise.all([
                AuthAdminEndpoints.fetchRoles(),
                AppAccessesEndpoints.fetchList(),
            ]);
            setRoles(rolesRes?.roles || []);
            setAppAccesses(aaRes?.data || aaRes || []);
        } catch (err) {
            console.error("Failed to load options", err);
        }
    }

    function setField(field, value) {
        setForm(prev => ({ ...prev, [field]: value }));
    }

    function toggleAppAccess(domainKey, kind) {
        setForm(prev => {
            const appSet = new Set(prev.domain_accesses);
            const adminSet = new Set(prev.admin_domain_accesses);

            if (kind === "user") {
                if (appSet.has(domainKey)) {
                    appSet.delete(domainKey);
                    adminSet.delete(domainKey);
                } else {
                    appSet.add(domainKey);
                }
            }

            if (kind === "admin") {
                if (adminSet.has(domainKey)) {
                    adminSet.delete(domainKey);
                } else {
                    adminSet.add(domainKey);
                    appSet.add(domainKey);
                }
            }

            return {
                ...prev,
                domain_accesses: Array.from(appSet),
                admin_domain_accesses: Array.from(adminSet),
            };
        });
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        if (!form.username || !form.email || !form.password) {
            setError("Username, email and password are required.");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                username: form.username,
                displayName: form.displayName,
                email: form.email,
                password: form.password,
                confirmed: form.confirmed,
                blocked: form.blocked,
                role: form.role || undefined,
                domain_accesses: form.domain_accesses,
                admin_domain_accesses: form.admin_domain_accesses,
            };
            await AuthAdminEndpoints.postCreateUser(payload);
            router.push("/users");
        } catch (err) {
            const msg = err?.response?.data?.error?.message || err.message || "Failed to create user";
            setError(msg);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Layout>
            <ProtectedRoute>
                <AppAccessGate appKey="auth">
                <h2 className="mb-3"><i className="fas fa-user-plus me-2"></i>New User</h2>

                {error && <div className="alert alert-danger">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="row g-3">
                        <div className="col-md-6">
                            <label className="form-label">Username *</label>
                            <input className="form-control" value={form.username} onChange={e => setField("username", e.target.value)} required />
                        </div>
                        <div className="col-md-6">
                            <label className="form-label">Display Name</label>
                            <input className="form-control" value={form.displayName} onChange={e => setField("displayName", e.target.value)} />
                        </div>
                        <div className="col-md-6">
                            <label className="form-label">Email *</label>
                            <input className="form-control" type="email" value={form.email} onChange={e => setField("email", e.target.value)} required />
                        </div>
                        <div className="col-md-6">
                            <label className="form-label">Password *</label>
                            <input className="form-control" type="password" value={form.password} onChange={e => setField("password", e.target.value)} required minLength={6} />
                        </div>

                        {/* Role */}
                        <div className="col-md-6">
                            <label className="form-label">Role (Strapi API permissions)</label>
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
                            <label className="form-label">Domain Access (AGP)</label>
                            {appAccesses.length === 0 ? (
                                <span className="text-muted">No applications configured</span>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-hover align-middle mb-0">
                                        <thead className="table-light">
                                            <tr>
                                                <th style={{ width: "50%" }}>Application</th>
                                                <th className="text-center" style={{ width: "25%" }}>User Access</th>
                                                <th className="text-center" style={{ width: "25%" }}>Admin Access</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {appAccesses.map((aa) => {
                                                const hasUser = form.domain_accesses.includes(aa.key);
                                                const hasAdmin = form.admin_domain_accesses.includes(aa.key);

                                                return (
                                                    <tr key={aa.id}>
                                                        <td>
                                                            <div className="fw-semibold">{aa.name}</div>
                                                            {aa.description && <div className="small text-muted">{aa.description}</div>}
                                                            <div className="small"><code className="text-muted">{aa.key}</code></div>
                                                        </td>
                                                        <td className="text-center">
                                                            <div className="form-check form-switch d-inline-block">
                                                                <input
                                                                    className="form-check-input"
                                                                    type="checkbox"
                                                                    id={`aa-user-${aa.id}`}
                                                                    checked={hasUser}
                                                                    disabled={hasAdmin}
                                                                    onChange={() => toggleAppAccess(aa.key, "user")}
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="text-center">
                                                            <div className="form-check form-switch d-inline-block">
                                                                <input
                                                                    className="form-check-input"
                                                                    type="checkbox"
                                                                    id={`aa-admin-${aa.id}`}
                                                                    checked={hasAdmin}
                                                                    onChange={() => toggleAppAccess(aa.key, "admin")}
                                                                />
                                                            </div>
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

                    <div className="d-flex gap-2 mt-4">
                        <button type="submit" className="btn btn-success" disabled={saving}>
                            {saving ? "Creating..." : "Create User"}
                        </button>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => router.push("/users")}>
                            Cancel
                        </button>
                    </div>
                </form>
                    </AppAccessGate>
                </ProtectedRoute>
            </Layout>
    );
}

