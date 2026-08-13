import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MailAccountsEndpoints, MailServersEndpoints, UsersEndpoints } from "@rutba/api-provider/endpoints";

/**
 * Per-user mailbox panel for the user edit page: what this user can open
 * (owned + role-reachable shared inboxes), attach/detach against existing
 * accounts, and provision a brand-new address on a registered mail server.
 */
export default function UserMailboxes({ userId, userEmail, userRoleKeys = [] }) {
    const [accounts, setAccounts] = useState([]);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [busy, setBusy] = useState(false);
    const [attachId, setAttachId] = useState("");
    const [provision, setProvision] = useState(null);
    const [provisioning, setProvisioning] = useState(false);

    const uid = Number(userId);

    useEffect(() => { if (uid) loadAll(); }, [uid]);

    async function loadAll() {
        setLoading(true);
        setError("");
        try {
            const [accRes, srvRes] = await Promise.all([
                MailAccountsEndpoints.listAccess(),
                MailServersEndpoints.list({ pageSize: 100 }).catch(() => ({ data: [] })),
            ]);
            setAccounts(accRes?.data || []);
            setServers((srvRes?.data || []).filter((s) => s.is_active !== false));
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Failed to load mailboxes");
        } finally {
            setLoading(false);
        }
    }

    const owned = useMemo(() => accounts.filter((a) => (a.owners || []).some((o) => o.id === uid)), [accounts, uid]);
    const viaRoles = useMemo(() => {
        const keys = userRoleKeys.map((k) => String(k).toLowerCase());
        return accounts.filter((a) =>
            a.kind === "shared"
            && !(a.owners || []).some((o) => o.id === uid)
            && (a.access_roles || []).some((k) => keys.includes(String(k).toLowerCase())));
    }, [accounts, uid, userRoleKeys]);
    const attachable = useMemo(() => accounts.filter((a) =>
        !(a.owners || []).some((o) => o.id === uid)
        && (a.kind === "shared" || (a.owners || []).length === 0)), [accounts, uid]);

    async function handleAttach() {
        if (!attachId) return;
        const account = accounts.find((a) => a.documentId === attachId);
        if (!account) return;
        setBusy(true);
        setError("");
        try {
            const nextOwners = [...(account.owners || []).map((o) => o.id), uid];
            await MailAccountsEndpoints.setAccess(account.documentId, { owners: nextOwners });
            setSuccess(`Attached ${account.email}.`);
            setAttachId("");
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Failed to attach");
        } finally {
            setBusy(false);
        }
    }

    async function handleDetach(account) {
        if (!confirm(`Remove this user from ${account.email}?`)) return;
        setBusy(true);
        setError("");
        try {
            const nextOwners = (account.owners || []).map((o) => o.id).filter((id) => id !== uid);
            await MailAccountsEndpoints.setAccess(account.documentId, { owners: nextOwners });
            setSuccess(`Detached ${account.email}.`);
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Failed to detach");
        } finally {
            setBusy(false);
        }
    }

    function openProvision() {
        const suggested = String(userEmail || "").split("@")[0] || "";
        setProvision({
            serverId: servers[0]?.documentId || "",
            localPart: suggested,
            domain: servers[0]?.mail_domains?.[0] || "",
            name: "",
        });
    }

    const provisionDomains = useMemo(() => {
        if (!provision) return [];
        const server = servers.find((s) => s.documentId === provision.serverId);
        return server?.mail_domains || [];
    }, [provision, servers]);

    async function handleProvision(e) {
        e.preventDefault();
        if (!provision.localPart || !provision.domain) {
            setError("Local part and domain are required.");
            return;
        }
        setProvisioning(true);
        setError("");
        try {
            const res = await UsersEndpoints.createMailbox(uid, {
                ...(provision.serverId ? { serverId: provision.serverId } : {}),
                localPart: provision.localPart.trim().toLowerCase(),
                domain: provision.domain.trim().toLowerCase(),
                ...(provision.name ? { name: provision.name } : {}),
                kind: "personal",
            });
            setSuccess(`Provisioned ${res?.account?.email} for this user.`);
            setProvision(null);
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Provisioning failed");
        } finally {
            setProvisioning(false);
        }
    }

    const row = (a, via) => (
        <tr key={`${via}-${a.documentId}`}>
            <td>
                <div className="fw-semibold">{a.name}</div>
                <div className="small text-muted">{a.email}</div>
            </td>
            <td>
                <span className={`badge ${a.kind === "shared" ? "bg-info text-dark" : "bg-secondary"}`}>{a.kind}</span>
            </td>
            <td className="small text-muted">
                {via === "owner" ? "Owner" : <>Via role{(a.access_roles || []).length ? <>: <code>{(a.access_roles || []).join(", ")}</code></> : ""}</>}
            </td>
            <td className="text-end">
                {via === "owner" && (
                    <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => handleDetach(a)}>
                        Detach
                    </button>
                )}
            </td>
        </tr>
    );

    return (
        <div className="card mb-4">
            <div className="card-header bg-light d-flex justify-content-between align-items-center">
                <h5 className="mb-0"><i className="fas fa-envelope me-2"></i>Mailboxes</h5>
                <div className="d-flex gap-2">
                    <Link href="/mailboxes" className="btn btn-sm btn-outline-secondary">All Mailboxes</Link>
                    <button type="button" className="btn btn-sm btn-primary" onClick={openProvision}>
                        <i className="fas fa-plus me-1"></i>Assign New Email
                    </button>
                </div>
            </div>
            <div className="card-body">
                {error && <div className="alert alert-danger py-2">{error}</div>}
                {success && <div className="alert alert-success py-2">{success}</div>}

                {provision && (
                    <form onSubmit={handleProvision} className="border rounded p-3 mb-3 bg-light">
                        <div className="row g-2">
                            <div className="col-md-3">
                                <label className="form-label small">Mail server</label>
                                <select className="form-select form-select-sm" value={provision.serverId} onChange={e => setProvision(p => ({ ...p, serverId: e.target.value, domain: "" }))}>
                                    <option value="">Built-in (env)</option>
                                    {servers.map((s) => <option key={s.documentId} value={s.documentId}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="col-md-3">
                                <label className="form-label small">Local part</label>
                                <input className="form-control form-control-sm" value={provision.localPart} onChange={e => setProvision(p => ({ ...p, localPart: e.target.value }))} required />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label small">Domain</label>
                                {provisionDomains.length ? (
                                    <select className="form-select form-select-sm" value={provision.domain} onChange={e => setProvision(p => ({ ...p, domain: e.target.value }))} required>
                                        <option value="">— Select —</option>
                                        {provisionDomains.map((d) => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                ) : (
                                    <input className="form-control form-control-sm" placeholder="rutba.pk" value={provision.domain} onChange={e => setProvision(p => ({ ...p, domain: e.target.value }))} required />
                                )}
                            </div>
                            <div className="col-md-3">
                                <label className="form-label small">Display name</label>
                                <input className="form-control form-control-sm" value={provision.name} onChange={e => setProvision(p => ({ ...p, name: e.target.value }))} />
                            </div>
                        </div>
                        <div className="d-flex gap-2 mt-2">
                            <button type="submit" className="btn btn-sm btn-success" disabled={provisioning}>
                                {provisioning ? "Provisioning..." : "Provision & Assign"}
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setProvision(null)}>Cancel</button>
                        </div>
                    </form>
                )}

                {loading ? (
                    <p className="text-muted mb-0">Loading...</p>
                ) : (
                    <>
                        {owned.length === 0 && viaRoles.length === 0 ? (
                            <p className="text-muted">No mailboxes assigned.</p>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-sm align-middle mb-2">
                                    <thead className="table-light">
                                        <tr>
                                            <th>Mailbox</th>
                                            <th>Kind</th>
                                            <th>Access</th>
                                            <th style={{ width: 90 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {owned.map((a) => row(a, "owner"))}
                                        {viaRoles.map((a) => row(a, "role"))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {attachable.length > 0 && (
                            <div className="d-flex align-items-end gap-2 mt-2">
                                <div style={{ minWidth: 280 }}>
                                    <label className="form-label small mb-1">Attach existing account</label>
                                    <select className="form-select form-select-sm" value={attachId} onChange={(e) => setAttachId(e.target.value)}>
                                        <option value="">— Select account —</option>
                                        {attachable.map((a) => (
                                            <option key={a.documentId} value={a.documentId}>
                                                {a.email} ({a.kind}{a.kind === "personal" && (a.owners || []).length === 0 ? ", unowned" : ""})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button type="button" className="btn btn-sm btn-outline-primary" disabled={!attachId || busy} onClick={handleAttach}>
                                    Attach
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
