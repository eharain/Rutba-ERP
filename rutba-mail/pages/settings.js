import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MailAccountsEndpoints, MailServersEndpoints } from "@rutba/api-provider/endpoints";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";
import AccountDialog from "../components/AccountDialog";

// Connected mailboxes. Staff see the accounts they own (personal + shared they
// belong to); mail_admin sees everything. Passwords are write-only — the API
// never returns them.

export default function SettingsPage() {
    const { jwt } = useAuth();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);
    const [editing, setEditing] = useState(undefined); // undefined = closed; null = new; object = edit
    const [showProvision, setShowProvision] = useState(false);

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        MailAccountsEndpoints.list({ pageSize: 100 })
            .then((res) => setAccounts(res?.data || []))
            .catch((err) => setNotice({ type: "danger", text: `Failed to load: ${err.message}` }))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const validate = async (account) => {
        setBusy(`validate:${account.documentId}`);
        try {
            const res = await MailAccountsEndpoints.validateConnection({ documentId: account.documentId, settings: {} });
            setNotice(res?.ok
                ? { type: "success", text: `${account.name}: IMAP and SMTP are reachable.` }
                : { type: "warning", text: `${account.name}: ${res?.imap?.error || res?.smtp?.error || "not reachable"}` });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Check failed: ${err.message}` });
        } finally {
            setBusy(null);
        }
    };

    const remove = async (account) => {
        if (!window.confirm(
            `Delete the mailbox connection "${account.name}"?\n\n`
            + "This only removes the ERP's connection and stored credentials — the "
            + "mailbox itself and its mail stay untouched on the mail server."
        )) return;
        setBusy(`delete:${account.documentId}`);
        try {
            await MailAccountsEndpoints.del(account.documentId);
            setNotice({ type: "success", text: "Mailbox connection removed." });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Delete failed: ${err.message}` });
        } finally {
            setBusy(null);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Mail Accounts</h2>
                    <div>
                        <a className="btn btn-link me-2" href={`${APP_URLS.users}/mailboxes`} target="_blank" rel="noreferrer"
                            title="Owners, shared access, servers and per-user assignment are managed centrally in User Management">
                            <i className="fas fa-users-gear me-1"></i>Manage in User Management
                        </a>
                        <button className="btn btn-outline-primary me-2" onClick={() => setShowProvision((v) => !v)}>
                            <i className="fas fa-server me-1"></i>Provision mailbox
                        </button>
                        <button className="btn btn-primary" onClick={() => setEditing(null)}>
                            <i className="fas fa-plus me-1"></i>Connect Mailbox
                        </button>
                    </div>
                </div>

                {showProvision && (
                    <ProvisionForm
                        onDone={(msg) => { setShowProvision(false); setNotice(msg); load(); }}
                        onClose={() => setShowProvision(false)}
                    />
                )}

                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                {editing !== undefined && (
                    <AccountDialog
                        account={editing}
                        onClose={() => setEditing(undefined)}
                        onSaved={() => { setEditing(undefined); setNotice({ type: "success", text: "Mailbox saved." }); load(); }}
                    />
                )}

                {loading ? (
                    <p className="text-muted">Loading…</p>
                ) : accounts.length === 0 ? (
                    <div className="alert alert-light border">
                        No mailboxes connected yet. Connect your first IMAP/SMTP account to
                        read and send mail from inside the ERP.
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle">
                            <thead>
                                <tr>
                                    <th>Name</th><th>Address</th><th>Kind</th><th>Server</th><th>Status</th><th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((a) => (
                                    <tr key={a.documentId}>
                                        <td>{a.name}</td>
                                        <td className="text-muted">{a.email}</td>
                                        <td>
                                            <span className={`badge ${a.kind === "shared" ? "bg-info" : "bg-secondary"}`}>{a.kind}</span>
                                        </td>
                                        <td className="text-muted small">{a.imap_host}</td>
                                        <td>
                                            {!a.is_active
                                                ? <span className="badge bg-light text-muted border">inactive</span>
                                                : a.last_error
                                                    ? <span className="badge bg-danger" title={a.last_error}>error</span>
                                                    : a.last_checked_at
                                                        ? <span className="badge bg-success">connected</span>
                                                        : <span className="badge bg-warning text-dark">unchecked</span>}
                                            {a.last_error && <div className="small text-danger mt-1">{a.last_error}</div>}
                                        </td>
                                        <td className="text-end">
                                            <button className="btn btn-sm btn-outline-secondary me-2"
                                                disabled={busy === `validate:${a.documentId}`}
                                                onClick={() => validate(a)}>
                                                {busy === `validate:${a.documentId}` ? "Checking…" : "Check"}
                                            </button>
                                            <button className="btn btn-sm btn-outline-primary me-2" onClick={() => setEditing(a)}>
                                                Edit
                                            </button>
                                            <button className="btn btn-sm btn-outline-danger"
                                                disabled={busy === `delete:${a.documentId}`}
                                                onClick={() => remove(a)}>
                                                Remove
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

/**
 * Create a mailbox on a registered mail server and connect it in one step
 * (mail_admin only). Servers and their domains come from the User Management
 * registry (Email Servers); "auto" picks the server hosting the chosen domain,
 * and the MAILCOW_* env server remains the last fallback. The generated
 * password is stored encrypted; nobody ever sees it.
 */
function ProvisionForm({ onDone, onClose }) {
    const [servers, setServers] = useState([]);
    const [form, setForm] = useState({ serverId: "", localPart: "", domain: "", name: "", kind: "shared", accessRoles: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        MailServersEndpoints.list({ pageSize: 100, filters: { is_active: true } })
            .then((res) => setServers(res?.data || []))
            .catch(() => setServers([]));
    }, []);

    const server = servers.find((s) => s.documentId === form.serverId);
    const domains = server
        ? (server.mail_domains || [])
        : [...new Set(servers.flatMap((s) => s.mail_domains || []))];

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const accessRoles = form.accessRoles.split(",").map((s) => s.trim()).filter(Boolean);
            const res = await MailAccountsEndpoints.createProvision({
                localPart: form.localPart.trim().toLowerCase(),
                domain: form.domain.trim().toLowerCase(),
                ...(form.name ? { name: form.name } : {}),
                kind: form.kind,
                ...(form.serverId ? { serverId: form.serverId } : {}),
                ...(form.kind === "shared" && accessRoles.length ? { access_roles: accessRoles } : {}),
            });
            onDone({ type: "success", text: `Provisioned and connected ${res?.account?.email}.` });
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <form className="card border-primary mb-4" onSubmit={submit}>
            <div className="card-body">
                <div className="d-flex justify-content-between align-items-start">
                    <h5 className="card-title">Provision a mailbox</h5>
                    <button type="button" className="btn-close" onClick={onClose}></button>
                </div>
                {!servers.length && (
                    <p className="text-muted small">
                        No mail servers registered — add one in{" "}
                        <a href={`${APP_URLS.users}/email-servers`} target="_blank" rel="noreferrer">User Management → Email Servers</a>,
                        or set the MAILCOW_* env fallback.
                    </p>
                )}
                <div className="row g-2 align-items-end">
                    {servers.length > 0 && (
                        <div className="col-md-3">
                            <label className="form-label">Server</label>
                            <select className="form-select" value={form.serverId}
                                onChange={(e) => setForm({ ...form, serverId: e.target.value, domain: "" })}>
                                <option value="">auto (match domain)</option>
                                {servers.map((s) => <option key={s.documentId} value={s.documentId}>{s.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="col-md-2">
                        <label className="form-label">Local part</label>
                        <input className="form-control" required placeholder="support"
                            value={form.localPart} onChange={(e) => setForm({ ...form, localPart: e.target.value })} />
                    </div>
                    <div className="col-md-2">
                        <label className="form-label">Domain</label>
                        {domains.length ? (
                            <select className="form-select" required value={form.domain}
                                onChange={(e) => setForm({ ...form, domain: e.target.value })}>
                                <option value="">— pick —</option>
                                {domains.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                        ) : (
                            <input className="form-control" required placeholder="rutba.pk"
                                value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
                        )}
                    </div>
                    <div className="col-md-2">
                        <label className="form-label">Display name</label>
                        <input className="form-control" value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div className="col-md-2">
                        <label className="form-label">Kind</label>
                        <select className="form-select" value={form.kind}
                            onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                            <option value="shared">shared</option>
                            <option value="personal">personal</option>
                        </select>
                    </div>
                    <div className="col-md-1">
                        <button className="btn btn-primary w-100" disabled={busy}>{busy ? "…" : "Go"}</button>
                    </div>
                    {form.kind === "shared" && (
                        <div className="col-md-6">
                            <label className="form-label">
                                Access roles <span className="text-muted">(app-role keys, comma-separated — e.g. crm_staff)</span>
                            </label>
                            <input className="form-control" placeholder="mail_staff, crm_staff"
                                value={form.accessRoles} onChange={(e) => setForm({ ...form, accessRoles: e.target.value })} />
                        </div>
                    )}
                </div>
                {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
            </div>
        </form>
    );
}
