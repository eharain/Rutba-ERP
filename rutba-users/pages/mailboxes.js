import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../components/AppAccessGate";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import {
    MailAccountsEndpoints,
    MailServersEndpoints,
    UsersEndpoints,
    AppDomainsEndpoints,
} from "@rutba/api-provider/endpoints";

const EMPTY_PROVISION = {
    userId: "",
    serverId: "",
    localPart: "",
    domain: "",
    name: "",
    kind: "personal",
};

export default function MailboxesPage() {
    const [accounts, setAccounts] = useState([]);
    const [servers, setServers] = useState([]);
    const [directory, setDirectory] = useState([]);
    const [roleKeys, setRoleKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Access editor dialog
    const [editing, setEditing] = useState(null); // account being edited
    const [draftOwners, setDraftOwners] = useState([]);
    const [draftRoles, setDraftRoles] = useState([]);
    const [savingAccess, setSavingAccess] = useState(false);

    // Provision dialog
    const [provision, setProvision] = useState(null);
    const [provisioning, setProvisioning] = useState(false);

    useEffect(() => { loadAll(); }, []);

    async function loadAll() {
        setLoading(true);
        setError("");
        try {
            const [accRes, srvRes, dirRes, domRes] = await Promise.all([
                MailAccountsEndpoints.listAccess(),
                MailServersEndpoints.list({ pageSize: 100 }).catch(() => ({ data: [] })),
                UsersEndpoints.listDirectory().catch(() => ({ data: [] })),
                AppDomainsEndpoints.list().catch(() => ({ data: [] })),
            ]);
            setAccounts(accRes?.data || []);
            setServers((srvRes?.data || []).filter((s) => s.is_active !== false));
            setDirectory(dirRes?.data || []);
            const keys = new Set();
            for (const d of domRes?.data || []) for (const k of d.roleKeys || []) keys.add(k);
            setRoleKeys(Array.from(keys).sort());
        } catch (err) {
            setError("Failed to load mailboxes: " + (err?.response?.data?.message || err.message || ""));
        } finally {
            setLoading(false);
        }
    }

    const userLabel = (u) => u.displayName || u.username || u.email || `#${u.id}`;

    function openAccess(account) {
        setEditing(account);
        setDraftOwners((account.owners || []).map((o) => o.id));
        setDraftRoles(account.access_roles || []);
    }

    function toggleOwner(id) {
        setDraftOwners((prev) => {
            const set = new Set(prev);
            if (set.has(id)) set.delete(id);
            else {
                if (editing?.kind !== "shared") return [id]; // personal = single owner
                set.add(id);
            }
            return Array.from(set);
        });
    }

    function toggleRole(key) {
        setDraftRoles((prev) => {
            const set = new Set(prev);
            if (set.has(key)) set.delete(key);
            else set.add(key);
            return Array.from(set).sort();
        });
    }

    async function saveAccess() {
        setSavingAccess(true);
        setError("");
        try {
            await MailAccountsEndpoints.setAccess(editing.documentId, {
                owners: draftOwners,
                ...(editing.kind === "shared" ? { access_roles: draftRoles } : {}),
            });
            setSuccess(`Access updated for ${editing.email}.`);
            setEditing(null);
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Failed to save access");
        } finally {
            setSavingAccess(false);
        }
    }

    const provisionDomains = useMemo(() => {
        if (!provision) return [];
        const server = servers.find((s) => s.documentId === provision.serverId);
        return server?.mail_domains || [];
    }, [provision, servers]);

    async function handleProvision(e) {
        e.preventDefault();
        setError("");
        setSuccess("");
        if (!provision.userId || !provision.localPart || !provision.domain) {
            setError("User, local part and domain are required.");
            return;
        }
        setProvisioning(true);
        try {
            const res = await UsersEndpoints.createMailbox(provision.userId, {
                ...(provision.serverId ? { serverId: provision.serverId } : {}),
                localPart: provision.localPart.trim().toLowerCase(),
                domain: provision.domain.trim().toLowerCase(),
                ...(provision.name ? { name: provision.name } : {}),
                kind: provision.kind,
            });
            setSuccess(`Provisioned ${res?.account?.email} and assigned it.`);
            setProvision(null);
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Provisioning failed");
        } finally {
            setProvisioning(false);
        }
    }

    return (
        <Layout fullWidth>
            <ProtectedRoute>
                <AppAccessGate>
                <PermissionCheck adminOnly appKey="users" required="users">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0"><i className="fas fa-envelope me-2"></i>Mailboxes</h2>
                    <div className="d-flex gap-2">
                        <Link href="/email-servers" className="btn btn-sm btn-outline-secondary">
                            <i className="fas fa-server me-1"></i>Email Servers
                        </Link>
                        <button className="btn btn-sm btn-primary" onClick={() => setProvision({ ...EMPTY_PROVISION, serverId: servers[0]?.documentId || "" })}>
                            <i className="fas fa-plus me-1"></i>Assign New Email
                        </button>
                    </div>
                </div>

                <p className="text-muted small mb-3">
                    Who owns which mailbox, and which roles can open shared inboxes. Personal mailboxes have exactly one
                    owner; shared inboxes open to their owners plus any holder of the listed roles. Provisioning a new
                    address creates the mailbox on the registered mail server automatically.
                </p>

                {error && <div className="alert alert-danger">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                {provision && (
                    <div className="card mb-4 border-primary">
                        <div className="card-body">
                            <h5 className="card-title">Assign a new email address</h5>
                            <form onSubmit={handleProvision}>
                                <div className="row g-3">
                                    <div className="col-md-4">
                                        <label className="form-label">User *</label>
                                        <select className="form-select" value={provision.userId} onChange={e => setProvision(p => ({ ...p, userId: e.target.value }))} required>
                                            <option value="">— Select user —</option>
                                            {directory.map((u) => (
                                                <option key={u.id} value={u.id}>{userLabel(u)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Mail server</label>
                                        <select className="form-select" value={provision.serverId} onChange={e => setProvision(p => ({ ...p, serverId: e.target.value, domain: "" }))}>
                                            <option value="">Built-in (env-configured)</option>
                                            {servers.map((s) => (
                                                <option key={s.documentId} value={s.documentId}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Type</label>
                                        <select className="form-select" value={provision.kind} onChange={e => setProvision(p => ({ ...p, kind: e.target.value }))}>
                                            <option value="personal">Personal mailbox</option>
                                            <option value="shared">Shared inbox</option>
                                        </select>
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Local part *</label>
                                        <input className="form-control" placeholder="firstname.lastname" value={provision.localPart} onChange={e => setProvision(p => ({ ...p, localPart: e.target.value }))} required />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Domain *</label>
                                        {provisionDomains.length ? (
                                            <select className="form-select" value={provision.domain} onChange={e => setProvision(p => ({ ...p, domain: e.target.value }))} required>
                                                <option value="">— Select domain —</option>
                                                {provisionDomains.map((d) => <option key={d} value={d}>{d}</option>)}
                                            </select>
                                        ) : (
                                            <input className="form-control" placeholder="rutba.pk" value={provision.domain} onChange={e => setProvision(p => ({ ...p, domain: e.target.value }))} required />
                                        )}
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Display name</label>
                                        <input className="form-control" placeholder="defaults to the address" value={provision.name} onChange={e => setProvision(p => ({ ...p, name: e.target.value }))} />
                                    </div>
                                </div>
                                {provision.localPart && provision.domain && (
                                    <div className="small text-muted mt-2">
                                        Will provision <code>{provision.localPart.trim().toLowerCase()}@{provision.domain.trim().toLowerCase()}</code> and assign it to the selected user.
                                    </div>
                                )}
                                <div className="d-flex gap-2 mt-3">
                                    <button type="submit" className="btn btn-success" disabled={provisioning}>
                                        {provisioning ? "Provisioning..." : "Provision & Assign"}
                                    </button>
                                    <button type="button" className="btn btn-outline-secondary" onClick={() => setProvision(null)}>Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {editing && (
                    <div className="card mb-4 border-warning">
                        <div className="card-body">
                            <h5 className="card-title">
                                Access — {editing.name} <code className="ms-1">{editing.email}</code>
                                <span className={`badge ms-2 ${editing.kind === "shared" ? "bg-info text-dark" : "bg-secondary"}`}>{editing.kind}</span>
                            </h5>
                            <div className="row g-3">
                                <div className="col-md-6">
                                    <label className="form-label fw-semibold">
                                        Owners {editing.kind !== "shared" && <small className="text-muted fw-normal">(personal — exactly one)</small>}
                                    </label>
                                    <div className="border rounded p-2" style={{ maxHeight: 260, overflowY: "auto" }}>
                                        {directory.map((u) => (
                                            <div key={u.id} className="form-check">
                                                <input
                                                    className="form-check-input"
                                                    type={editing.kind === "shared" ? "checkbox" : "radio"}
                                                    name="owner-pick"
                                                    id={`own-${u.id}`}
                                                    checked={draftOwners.includes(u.id)}
                                                    onChange={() => toggleOwner(u.id)}
                                                />
                                                <label className="form-check-label small" htmlFor={`own-${u.id}`}>
                                                    {userLabel(u)} <span className="text-muted">{u.email}</span>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {editing.kind === "shared" && (
                                    <div className="col-md-6">
                                        <label className="form-label fw-semibold">Access roles <small className="text-muted fw-normal">(role holders can open this inbox)</small></label>
                                        <div className="border rounded p-2" style={{ maxHeight: 260, overflowY: "auto" }}>
                                            {roleKeys.map((key) => (
                                                <div key={key} className="form-check">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        id={`ar-${key}`}
                                                        checked={draftRoles.includes(key)}
                                                        onChange={() => toggleRole(key)}
                                                    />
                                                    <label className="form-check-label small" htmlFor={`ar-${key}`}>
                                                        <code>{key}</code>
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="d-flex gap-2 mt-3">
                                <button className="btn btn-warning" disabled={savingAccess} onClick={saveAccess}>
                                    {savingAccess ? "Saving..." : "Save Access"}
                                </button>
                                <button className="btn btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <p>Loading mailboxes...</p>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead className="table-dark">
                                <tr>
                                    <th>Mailbox</th>
                                    <th>Kind</th>
                                    <th>Owners</th>
                                    <th>Access roles</th>
                                    <th>Source</th>
                                    <th style={{ width: 110 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.length === 0 && (
                                    <tr><td colSpan="6" className="text-center text-muted py-4">No mail accounts</td></tr>
                                )}
                                {accounts.map((a) => (
                                    <tr key={a.documentId} className={a.is_active === false ? "opacity-50" : ""}>
                                        <td>
                                            <div className="fw-semibold">{a.name}</div>
                                            <div className="small text-muted">{a.email}</div>
                                        </td>
                                        <td>
                                            <span className={`badge ${a.kind === "shared" ? "bg-info text-dark" : "bg-secondary"}`}>
                                                {a.kind === "shared" ? <><i className="fas fa-users me-1"></i>shared</> : "personal"}
                                            </span>
                                        </td>
                                        <td>
                                            {(a.owners || []).length === 0
                                                ? <span className="text-muted">—</span>
                                                : (a.owners || []).map((o) => (
                                                    <span key={o.id} className="badge bg-light text-dark border me-1 mb-1">{userLabel(o)}</span>
                                                ))}
                                        </td>
                                        <td>
                                            {(a.access_roles || []).length === 0
                                                ? <span className="text-muted">—</span>
                                                : (a.access_roles || []).map((k) => (
                                                    <span key={k} className="badge bg-light text-dark border me-1 mb-1"><code>{k}</code></span>
                                                ))}
                                        </td>
                                        <td>
                                            <span className={`badge ${a.provisioning_source === "mailcow" ? "bg-success" : "bg-secondary"}`}>
                                                {a.provisioning_source || "byo"}
                                            </span>
                                        </td>
                                        <td className="text-end">
                                            <button className="btn btn-sm btn-outline-primary" onClick={() => openAccess(a)}>
                                                <i className="fas fa-user-shield me-1"></i>Access
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                </PermissionCheck>
                </AppAccessGate>
            </ProtectedRoute>
        </Layout>
    );
}
