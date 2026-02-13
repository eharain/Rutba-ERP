import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../../components/AppAccessGate";
import { authApi } from "@rutba/pos-shared/lib/api";

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
        app_accesses: [],
    });

    useEffect(() => {
        loadOptions();
    }, []);

    async function loadOptions() {
        try {
            const rolesRes = await authApi.get("/users-permissions/roles");
            setRoles(rolesRes?.roles || []);

            const aaRes = await authApi.get("/app-accesses");
            setAppAccesses(aaRes?.data || aaRes || []);
        } catch (err) {
            console.error("Failed to load options", err);
        }
    }

    function setField(field, value) {
        setForm(prev => ({ ...prev, [field]: value }));
    }

    function toggleAppAccess(id) {
        setForm(prev => {
            const current = prev.app_accesses;
            return {
                ...prev,
                app_accesses: current.includes(id) ? current.filter(a => a !== id) : [...current, id],
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
                app_accesses: form.app_accesses,
            };
            await authApi.post("/users", payload);
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
                            <label className="form-label">App Access</label>
                            <div className="d-flex flex-wrap gap-2">
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

export async function getServerSideProps() { return { props: {} }; }
