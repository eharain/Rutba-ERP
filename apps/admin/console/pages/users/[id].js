import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppAccessGate from "../../components/AppAccessGate";
import { UsersEndpoints, AppDomainsEndpoints } from "@rutba/api-provider/endpoints";
import UserMailboxes from "../../components/UserMailboxes";
import UserNotificationPrefs from "../../components/UserNotificationPrefs";

export default function EditUserPage() {
    const router = useRouter();
    const { id } = router.query;

    const [roles, setRoles] = useState([]);
    const [appAccesses, setAppAccesses] = useState([]);
    const [employees, setEmployees] = useState([]);
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
        hr_employee: "",
        domain_accesses: [],
        admin_domain_accesses: [],
    });

    // Advanced per-role editor — separate save path (setAppRoles) that
    // replaces the whole role set with exactly the picked keys.
    const [roleKeys, setRoleKeys] = useState([]);
    const [roleKeysDirty, setRoleKeysDirty] = useState(false);
    const [savingRoles, setSavingRoles] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        if (id) loadAll();
    }, [id]);

    async function loadAll() {
        setLoading(true);
        try {
            const [userData, rolesRes, aaRes, empRes] = await Promise.all([
                UsersEndpoints.byId(id),
                UsersEndpoints.listRoles(),
                AppDomainsEndpoints.list(),
                UsersEndpoints.listEmployees().catch(() => ({ data: [] })),
            ]);

            setRoles(rolesRes?.roles || []);
            setAppAccesses(aaRes?.data || aaRes || []);
            setEmployees(empRes?.data || []);

            const u = userData?.data || userData;
            setForm({
                username: u.username || "",
                displayName: u.displayName || "",
                email: u.email || "",
                password: "",
                confirmed: u.confirmed ?? true,
                blocked: u.blocked ?? false,
                role: u.role?.id || "",
                hr_employee: u.hr_employee?.id || "",
                domain_accesses: (u.domain_accesses || []),
                admin_domain_accesses: (u.admin_domain_accesses || []),
            });
            setRoleKeys((u.app_roles || []).map((r) => r.key).filter(Boolean).sort());
            setRoleKeysDirty(false);
        } catch (err) {
            setError("Failed to load user: " + (err.message || ""));
        } finally {
            setLoading(false);
        }
    }

    const allRoleKeyOptions = useMemo(() => {
        const keys = new Set();
        for (const aa of appAccesses) {
            for (const k of aa.roleKeys || []) keys.add(k);
        }
        return Array.from(keys).sort();
    }, [appAccesses]);

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
                    adminSet.delete(domainKey); // Remove admin if removing user
                } else {
                    appSet.add(domainKey);
                }
            }

            if (kind === "admin") {
                if (adminSet.has(domainKey)) {
                    adminSet.delete(domainKey);
                } else {
                    adminSet.add(domainKey);
                    appSet.add(domainKey); // Admin implies user
                }
            }

            return {
                ...prev,
                domain_accesses: Array.from(appSet),
                admin_domain_accesses: Array.from(adminSet),
            };
        });
    }

    function toggleRoleKey(key) {
        setRoleKeys((prev) => {
            const set = new Set(prev);
            if (set.has(key)) set.delete(key);
            else set.add(key);
            return Array.from(set).sort();
        });
        setRoleKeysDirty(true);
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
                hr_employee: form.hr_employee === "" ? null : Number(form.hr_employee),
                domain_accesses: form.domain_accesses,
                admin_domain_accesses: form.admin_domain_accesses,
            };
            // Only include password if the admin typed a new one
            if (form.password) {
                payload.password = form.password;
            }
            await UsersEndpoints.update(id, payload);
            setSuccess("User updated successfully.");
            await loadAll();
        } catch (err) {
            const msg = err?.response?.data?.error?.message || err.message || "Failed to update user";
            setError(msg);
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveRoleKeys() {
        setError("");
        setSuccess("");
        setSavingRoles(true);
        try {
            await UsersEndpoints.setAppRoles(id, roleKeys);
            setSuccess("Roles updated.");
            await loadAll();
        } catch (err) {
            const msg = err?.response?.data?.error?.message || err.message || "Failed to update roles";
            setError(msg);
        } finally {
            setSavingRoles(false);
        }
    }

    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;
        try {
            await UsersEndpoints.del(id);
            router.push("/users");
        } catch (err) {
            setError("Failed to delete user: " + (err.message || ""));
        }
    }

    if (loading) return <Layout><ProtectedRoute><AppAccessGate><p>Loading user...</p></AppAccessGate></ProtectedRoute></Layout>;

    return (
        <Layout>
            <ProtectedRoute>
                <AppAccessGate>
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
                                User Type &amp; API Permissions
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
                                <div className="col-md-6">
                                    <label className="form-label fw-semibold">Linked Employee</label>
                                    <select className="form-select" value={form.hr_employee} onChange={e => setField("hr_employee", e.target.value)}>
                                        <option value="">— Not linked —</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>
                                                {emp.name}{emp.designation ? ` — ${emp.designation}` : ""}{emp.user && String(emp.user.id) !== String(id) ? ` (linked to ${emp.user.displayName || emp.user.email})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="form-text">Connects this account to its HR employee record (ESS, teams, leave)</div>
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
                                                const hasUser = form.domain_accesses.includes(aa.key);
                                                // A domain with no *_admin role can never hold admin access,
                                                // so treat it as user-only rather than drawing a switch that
                                                // silently reverts on the next read.
                                                const adminAvailable = aa.hasAdminRole !== false;
                                                const hasAdmin = adminAvailable && form.admin_domain_accesses.includes(aa.key);
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
                                                                    onChange={() => toggleAppAccess(aa.key, "user")}
                                                                />
                                                            </div>
                                                            {hasUser && !hasAdmin && (
                                                                <i className="fas fa-check text-success ms-1"></i>
                                                            )}
                                                        </td>
                                                        <td className="text-center">
                                                            {adminAvailable ? (
                                                                <>
                                                                    <div className="form-check form-switch d-inline-block">
                                                                        <input
                                                                            className="form-check-input"
                                                                            type="checkbox"
                                                                            id={`aa-admin-${aa.id}`}
                                                                            checked={hasAdmin}
                                                                            onChange={() => toggleAppAccess(aa.key, "admin")}
                                                                        />
                                                                    </div>
                                                                    {hasAdmin && (
                                                                        <i className="fas fa-star text-warning ms-1"></i>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <span className="text-muted small" title={`No admin role exists for "${aa.key}" (roles: ${(aa.roleKeys || []).join(", ") || "none"})`}>
                                                                    n/a
                                                                </span>
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

                    <div className="d-flex gap-2 mb-4">
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

                {/* Individual roles (advanced) — outside the main form: its save
                    REPLACES the whole role set, bypassing the matrix bundles. */}
                <div className="card mb-4 border-warning">
                    <div className="card-header bg-light d-flex justify-content-between align-items-center">
                        <h5 className="mb-0">
                            <i className="fas fa-sliders-h me-2"></i>
                            Individual Roles (advanced)
                        </h5>
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowAdvanced(v => !v)}>
                            {showAdvanced ? "Hide" : "Show"}
                        </button>
                    </div>
                    {showAdvanced && (
                        <div className="card-body">
                            <div className="alert alert-warning">
                                <i className="fas fa-triangle-exclamation me-2"></i>
                                Grants <strong>exactly</strong> the selected roles — the only way to assign a single role
                                (e.g. <code>ess_employee</code> alone). Saving here replaces everything the matrix above granted.
                            </div>
                            <div className="row">
                                {allRoleKeyOptions.map((key) => (
                                    <div key={key} className="col-md-3 col-sm-4 col-6">
                                        <div className="form-check">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id={`rk-${key}`}
                                                checked={roleKeys.includes(key)}
                                                onChange={() => toggleRoleKey(key)}
                                            />
                                            <label className="form-check-label small" htmlFor={`rk-${key}`}>
                                                <code>{key}</code>
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                className="btn btn-warning mt-3"
                                disabled={savingRoles || !roleKeysDirty}
                                onClick={handleSaveRoleKeys}
                            >
                                <i className="fas fa-save me-1"></i>
                                {savingRoles ? "Saving roles..." : `Save Roles (${roleKeys.length})`}
                            </button>
                        </div>
                    )}
                </div>

                {/* Mailboxes — owned + role-reachable, attach/detach, provision */}
                <UserMailboxes userId={id} userEmail={form.email} userRoleKeys={roleKeys} />

                {/* Notification preferences — per-category toggles */}
                <UserNotificationPrefs userId={id} />
                    </AppAccessGate>
                </ProtectedRoute>
            </Layout>
    );
}
