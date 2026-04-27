import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function TeamsPage() {
    const { jwt } = useAuth();
    const [teams, setTeams] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [appRoleOptions, setAppRoleOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [form, setForm] = useState({
        name: "",
        team_slug: "",
        department: "",
        team_manager: "",
        members: [],
        parent_team: "",
        app_roles: {},
    });

    useEffect(() => {
        if (jwt) loadAll();
    }, [jwt]);

    async function loadAll() {
        setLoading(true);
        try {
            const [teamsRes, empRes, depRes] = await Promise.all([
                authApi.get("/hr-teams?sort=name:asc&populate=team_manager,members,parent_team,department", {}, jwt),
                authApi.get("/hr-employees?sort=name:asc", {}, jwt),
                authApi.get("/hr-departments?sort=name:asc", {}, jwt),
            ]);
            setTeams(teamsRes?.data || []);
            setEmployees(empRes?.data || []);
            setDepartments(depRes?.data || []);
            const roleRes = await authApi.get("/hr-teams/app-role-options", {}, jwt);
            setAppRoleOptions(roleRes?.data || []);
        } catch (err) {
            console.error("Failed to load teams", err);
        } finally {
            setLoading(false);
        }
    }

    function setField(field, value) {
        setForm((p) => ({ ...p, [field]: value }));
    }

    function resetForm() {
        setEditingId(null);
        setForm({
            name: "",
            team_slug: "",
            department: "",
            team_manager: "",
            members: [],
            parent_team: "",
            app_roles: {},
        });
    }

    function startEdit(team) {
        setEditingId(team.documentId);
        setForm({
            name: team.name || "",
            team_slug: team.team_slug || "",
            department: team.department?.documentId || "",
            team_manager: team.team_manager?.documentId || "",
            members: (team.members || []).map((m) => m.documentId),
            parent_team: team.parent_team?.documentId || "",
            app_roles: team.app_roles || {},
        });
    }

    function toggleAppRole(appKey, roleKey) {
        setForm((p) => {
            const current = Array.isArray(p.app_roles?.[appKey]) ? p.app_roles[appKey] : [];
            const set = new Set(current);
            if (set.has(roleKey)) set.delete(roleKey);
            else set.add(roleKey);
            return {
                ...p,
                app_roles: {
                    ...(p.app_roles || {}),
                    [appKey]: Array.from(set),
                },
            };
        });
    }

    function toggleMember(documentId) {
        setForm((p) => {
            const set = new Set(p.members);
            if (set.has(documentId)) set.delete(documentId);
            else set.add(documentId);
            return { ...p, members: Array.from(set) };
        });
    }

    async function submit(e) {
        e.preventDefault();
        if (!form.name.trim() || !form.department) return;

        const payload = {
            data: {
                name: form.name.trim(),
                team_slug: form.team_slug?.trim() || undefined,
                department: { documentId: form.department },
                team_manager: form.team_manager ? { documentId: form.team_manager } : null,
                members: form.members.map((id) => ({ documentId: id })),
                parent_team: form.parent_team ? { documentId: form.parent_team } : null,
                app_roles: form.app_roles || {},
            },
        };

        setSaving(true);
        try {
            if (editingId) {
                await authApi.put(`/hr-teams/${editingId}`, payload, jwt);
            } else {
                await authApi.post("/hr-teams", payload, jwt);
            }
            resetForm();
            await loadAll();
        } catch (err) {
            console.error("Failed to save team", err);
        } finally {
            setSaving(false);
        }
    }

    const managerOptions = useMemo(() => employees, [employees]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Teams</h2>
                    <button className="btn btn-sm btn-outline-secondary" onClick={loadAll}>
                        <i className="fas fa-rotate me-1" />Refresh
                    </button>
                </div>

                <div className="card mb-4">
                    <div className="card-header bg-light fw-semibold">
                        {editingId ? "Edit Team" : "Create Team"}
                    </div>
                    <div className="card-body">
                        <form onSubmit={submit}>
                            <div className="row g-3">
                                <div className="col-md-4">
                                    <label className="form-label">Team Name</label>
                                    <input className="form-control" value={form.name} onChange={(e) => setField("name", e.target.value)} required />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Team Slug</label>
                                    <input className="form-control" value={form.team_slug} onChange={(e) => setField("team_slug", e.target.value)} placeholder="e.g. team-hr" />
                                    <small className="text-muted">If empty, auto-generated from department/name</small>
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Department</label>
                                    <select className="form-select" value={form.department} onChange={(e) => setField("department", e.target.value)} required>
                                        <option value="">— Select Department —</option>
                                        {departments.map((d) => (
                                            <option key={d.documentId} value={d.documentId}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Team Manager</label>
                                    <select className="form-select" value={form.team_manager} onChange={(e) => setField("team_manager", e.target.value)}>
                                        <option value="">— Select —</option>
                                        {managerOptions.map((e) => (
                                            <option key={e.documentId} value={e.documentId}>{e.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label">Parent Team</label>
                                    <select className="form-select" value={form.parent_team} onChange={(e) => setField("parent_team", e.target.value)}>
                                        <option value="">— None —</option>
                                        {teams
                                            .filter((t) => t.documentId !== editingId)
                                            .map((t) => (
                                                <option key={t.documentId} value={t.documentId}>{t.name}</option>
                                            ))}
                                    </select>
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label">Members</label>
                                    <div className="border rounded p-2" style={{ maxHeight: 180, overflowY: "auto" }}>
                                        {employees.map((e) => (
                                            <div key={e.documentId} className="form-check">
                                                <input
                                                    className="form-check-input"
                                                    type="checkbox"
                                                    id={`member-${e.documentId}`}
                                                    checked={form.members.includes(e.documentId)}
                                                    onChange={() => toggleMember(e.documentId)}
                                                />
                                                <label className="form-check-label" htmlFor={`member-${e.documentId}`}>
                                                    {e.name}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="col-12">
                                    <label className="form-label">App Roles</label>
                                    <div className="border rounded p-2">
                                        {appRoleOptions.length === 0 && <span className="text-muted">No app role options available.</span>}
                                        {appRoleOptions.map((opt) => (
                                            <div key={opt.appKey} className="mb-2">
                                                <div className="fw-semibold small text-uppercase text-muted mb-1">{opt.appName}</div>
                                                <div className="d-flex flex-wrap gap-3">
                                                    {(opt.enabledGroups || []).map((group) => (
                                                        <div className="form-check" key={`${opt.appKey}-${group}`}>
                                                            <input
                                                                className="form-check-input"
                                                                type="checkbox"
                                                                id={`role-${opt.appKey}-${group}`}
                                                                checked={Array.isArray(form.app_roles?.[opt.appKey]) && form.app_roles[opt.appKey].includes(group)}
                                                                onChange={() => toggleAppRole(opt.appKey, group)}
                                                            />
                                                            <label className="form-check-label" htmlFor={`role-${opt.appKey}-${group}`}>
                                                                {group}
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="d-flex gap-2 mt-3">
                                <button className="btn btn-primary" type="submit" disabled={saving}>
                                    {saving ? "Saving..." : editingId ? "Update Team" : "Create Team"}
                                </button>
                                {editingId && (
                                    <button className="btn btn-outline-secondary" type="button" onClick={resetForm}>
                                        Cancel Edit
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>

                {loading && <p>Loading teams...</p>}

                {!loading && teams.length === 0 && (
                    <div className="alert alert-info">No teams found.</div>
                )}

                {!loading && teams.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Team</th>
                                    <th>Slug</th>
                                    <th>Department</th>
                                    <th>Manager</th>
                                    <th>Parent Team</th>
                                    <th>Members</th>
                                    <th>App Roles</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {teams.map((t) => (
                                    <tr key={t.id}>
                                        <td>{t.name}</td>
                                        <td><code>{t.team_slug || "—"}</code></td>
                                        <td>{t.department?.name || "—"}</td>
                                        <td>{t.team_manager?.name || "—"}</td>
                                        <td>{t.parent_team?.name || "—"}</td>
                                        <td>{(t.members || []).map((m) => m.name).join(", ") || "—"}</td>
                                        <td className="small">
                                            {t.app_roles && Object.keys(t.app_roles).length > 0
                                                ? Object.entries(t.app_roles)
                                                    .map(([appKey, roles]) => `${appKey}: ${(roles || []).join("/")}`)
                                                    .join(" | ")
                                                : "—"}
                                        </td>
                                        <td>
                                            <button className="btn btn-sm btn-outline-primary" onClick={() => startEdit(t)}>
                                                Edit
                                            </button>
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
