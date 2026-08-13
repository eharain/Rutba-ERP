import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    MailAccountsEndpoints,
    MailServersEndpoints,
    MailTagsEndpoints,
    MailSnippetsEndpoints,
} from "@rutba/api-provider/endpoints";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";
import AccountDialog from "../components/AccountDialog";
import RichTextArea from "../components/RichTextArea";

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

    const [resetResult, setResetResult] = useState(null);

    const resetPassword = async (account) => {
        if (!window.confirm(
            `Generate a NEW password for ${account.email} on its mail server?\n\n`
            + "The old password stops working immediately (webmail, phones, other "
            + "clients). The new one is shown ONCE — the ERP keeps only an "
            + "encrypted copy for its own connection."
        )) return;
        setBusy(`reset:${account.documentId}`);
        try {
            const res = await MailAccountsEndpoints.setMailboxPassword(account.documentId);
            setResetResult({ email: res.email, password: res.password });
        } catch (err) {
            setNotice({ type: "danger", text: `Password reset failed: ${err.message}` });
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
                        <a className="btn btn-link me-2" href={`${APP_URLS.admin}/mailboxes`} target="_blank" rel="noreferrer"
                            title="Owners, shared access, servers and per-user assignment are managed centrally in Rutba Admin">
                            <i className="fas fa-users-gear me-1"></i>Manage in Rutba Admin
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

                {resetResult && (
                    <div className="alert alert-warning">
                        <div className="d-flex justify-content-between align-items-start">
                            <div>
                                <strong>New password for {resetResult.email}</strong> — copy it now; it is shown only once.
                                <div className="mt-1">
                                    <code className="fs-6 user-select-all">{resetResult.password}</code>
                                    <button className="btn btn-sm btn-outline-secondary ms-2"
                                        onClick={() => navigator.clipboard?.writeText(resetResult.password)}>
                                        <i className="fa-regular fa-copy me-1"></i>Copy
                                    </button>
                                </div>
                                <div className="small text-muted mt-1">
                                    Use it in webmail or on a phone. The ERP's own connection was updated automatically.
                                </div>
                            </div>
                            <button type="button" className="btn-close" onClick={() => setResetResult(null)}></button>
                        </div>
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
                                            {a.provisioning_source === "mailcow" && (
                                                <button className="btn btn-sm btn-outline-warning me-2"
                                                    title="Generate a new mailbox password (for webmail / phones)"
                                                    disabled={busy === `reset:${a.documentId}`}
                                                    onClick={() => resetPassword(a)}>
                                                    {busy === `reset:${a.documentId}` ? "…" : "Reset password"}
                                                </button>
                                            )}
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

                <div className="row g-3 mt-1">
                    <div className="col-lg-6"><TagsPanel /></div>
                    <div className="col-lg-6"><SnippetsPanel /></div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

const TAG_COLORS = ["#0d6efd", "#6610f2", "#d63384", "#dc3545", "#fd7e14", "#198754", "#20c997", "#6c757d"];

/**
 * Tag registry admin. Tags are stored on messages as IMAP keywords, so they
 * survive without import and show in any mail client; the registry maps the
 * keyword to a name + color. Writes need mail admin/manager (API-enforced).
 */
function TagsPanel() {
    const [tags, setTags] = useState([]);
    const [draft, setDraft] = useState({ name: "", color: TAG_COLORS[0] });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = () => MailTagsEndpoints.list().then((res) => setTags(res?.data || [])).catch(() => {});
    useEffect(() => { load(); }, []);

    const add = async (e) => {
        e.preventDefault();
        if (!draft.name.trim()) return;
        setBusy(true);
        setError(null);
        try {
            await MailTagsEndpoints.create({ name: draft.name.trim(), color: draft.color });
            setDraft({ name: "", color: TAG_COLORS[(tags.length + 1) % TAG_COLORS.length] });
            load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (tag) => {
        if (!window.confirm(`Delete the tag "${tag.name}"? Messages keep the keyword but it stops rendering.`)) return;
        try {
            await MailTagsEndpoints.del(tag.documentId);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="card h-100">
            <div className="card-header py-2"><strong><i className="fa-solid fa-tags me-2"></i>Tags</strong></div>
            <div className="card-body py-2">
                <p className="text-muted small mb-2">
                    Label messages across every mailbox. Tags live on the mail server itself,
                    so they survive in webmail and other clients too.
                </p>
                <div className="d-flex flex-wrap gap-1 mb-2">
                    {tags.map((t) => (
                        <span key={t.documentId} className="badge" style={{ backgroundColor: t.color || "#6c757d" }}>
                            {t.name}
                            <i className="fa-solid fa-xmark ms-1" role="button" onClick={() => remove(t)}></i>
                        </span>
                    ))}
                    {!tags.length && <span className="text-muted small">No tags yet.</span>}
                </div>
                <form className="d-flex gap-1" onSubmit={add}>
                    <input className="form-control form-control-sm" placeholder="New tag name…"
                        value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    <input type="color" className="form-control form-control-sm form-control-color"
                        value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
                    <button className="btn btn-sm btn-outline-primary" disabled={busy || !draft.name.trim()}>Add</button>
                </form>
                {error && <div className="alert alert-warning py-1 px-2 small mt-2 mb-0">{error}</div>}
            </div>
        </div>
    );
}

/** Canned replies. Personal by default; managers can publish team snippets. */
function SnippetsPanel() {
    const [snippets, setSnippets] = useState([]);
    const [editing, setEditing] = useState(undefined); // undefined closed; null new; row edit
    const [draft, setDraft] = useState({ name: "", body_html: "", scope: "personal" });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = () => MailSnippetsEndpoints.list({ pageSize: 100 }).then((res) => setSnippets(res?.data || [])).catch(() => {});
    useEffect(() => { load(); }, []);

    const openEditor = (row) => {
        setEditing(row);
        setDraft(row ? { name: row.name, body_html: row.body_html, scope: row.scope } : { name: "", body_html: "", scope: "personal" });
        setError(null);
    };

    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            if (editing?.documentId) await MailSnippetsEndpoints.update(editing.documentId, draft);
            else await MailSnippetsEndpoints.create(draft);
            setEditing(undefined);
            load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (row) => {
        if (!window.confirm(`Delete the snippet "${row.name}"?`)) return;
        try {
            await MailSnippetsEndpoints.del(row.documentId);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="card h-100">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
                <strong><i className="fa-solid fa-clipboard me-2"></i>Snippets (canned replies)</strong>
                <button className="btn btn-sm btn-outline-primary" onClick={() => openEditor(null)}>
                    <i className="fa-solid fa-plus me-1"></i>New
                </button>
            </div>
            <div className="card-body py-2">
                {editing !== undefined ? (
                    <form onSubmit={save}>
                        <div className="d-flex gap-1 mb-2">
                            <input className="form-control form-control-sm" required placeholder="Snippet name…"
                                value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                            <select className="form-select form-select-sm" style={{ width: "9rem" }} value={draft.scope}
                                onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                                <option value="personal">Personal</option>
                                <option value="global">Team (shared)</option>
                            </select>
                        </div>
                        <RichTextArea value={draft.body_html} onChange={(v) => setDraft((d) => ({ ...d, body_html: v }))} minHeight="6rem" />
                        {error && <div className="alert alert-warning py-1 px-2 small mt-2 mb-0">{error}</div>}
                        <div className="mt-2">
                            <button className="btn btn-sm btn-primary me-2" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                            <button type="button" className="btn btn-sm btn-link" onClick={() => setEditing(undefined)}>Cancel</button>
                        </div>
                    </form>
                ) : (
                    <>
                        <p className="text-muted small mb-2">
                            Reusable answers, one click away in compose. Shared inboxes live on these.
                        </p>
                        {snippets.map((s) => (
                            <div key={s.documentId} className="d-flex justify-content-between align-items-center border-bottom py-1">
                                <span className="small">
                                    {s.scope === "global" && <span className="badge bg-info me-1">team</span>}
                                    {s.name}
                                </span>
                                <span>
                                    <button className="btn btn-sm btn-link py-0" onClick={() => openEditor(s)}>Edit</button>
                                    <button className="btn btn-sm btn-link text-danger py-0" onClick={() => remove(s)}>Delete</button>
                                </span>
                            </div>
                        ))}
                        {!snippets.length && <div className="text-muted small">No snippets yet.</div>}
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * Create a mailbox on a registered mail server and connect it in one step
 * (mail_admin only). Servers and their domains come from the Rutba Admin
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
                        <a href={`${APP_URLS.admin}/email-servers`} target="_blank" rel="noreferrer">Rutba Admin → Email Servers</a>,
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
