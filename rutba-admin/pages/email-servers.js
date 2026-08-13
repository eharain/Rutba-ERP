import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../components/AppAccessGate";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { MailServersEndpoints } from "@rutba/api-provider/endpoints";

const EMPTY = {
    name: "",
    kind: "mailcow",
    base_url: "",
    api_key: "",
    mail_domains: "",
    imap_host: "",
    smtp_host: "",
    is_active: true,
};

export default function EmailServersPage() {
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [draft, setDraft] = useState(null); // null = closed; {...EMPTY} or server = open
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [checkingId, setCheckingId] = useState(null);

    useEffect(() => { loadServers(); }, []);

    async function loadServers() {
        setLoading(true);
        try {
            const res = await MailServersEndpoints.list({ pageSize: 100 });
            setServers(res?.data || []);
        } catch (err) {
            setError("Failed to load mail servers: " + (err.message || ""));
        } finally {
            setLoading(false);
        }
    }

    function openNew() {
        setTestResult(null);
        setDraft({ ...EMPTY });
    }

    function openEdit(server) {
        setTestResult(null);
        setDraft({
            documentId: server.documentId,
            name: server.name || "",
            kind: server.kind || "mailcow",
            base_url: server.base_url || "",
            api_key: "",
            mail_domains: (server.mail_domains || []).join(", "),
            imap_host: server.imap_host || "",
            smtp_host: server.smtp_host || "",
            is_active: server.is_active !== false,
        });
    }

    function draftPayload() {
        return {
            name: draft.name,
            kind: draft.kind,
            base_url: draft.base_url.trim(),
            ...(draft.api_key.trim() ? { api_key: draft.api_key.trim() } : {}),
            mail_domains: draft.mail_domains.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
            imap_host: draft.imap_host.trim() || null,
            smtp_host: draft.smtp_host.trim() || null,
            is_active: draft.is_active,
        };
    }

    async function handleTest() {
        setTesting(true);
        setTestResult(null);
        setError("");
        try {
            const res = await MailServersEndpoints.validateServer({
                ...(draft.documentId ? { documentId: draft.documentId } : {}),
                ...(draft.base_url.trim() ? { base_url: draft.base_url.trim() } : {}),
                ...(draft.api_key.trim() ? { api_key: draft.api_key.trim() } : {}),
            });
            setTestResult(res);
            if (res?.domains?.length && !draft.mail_domains.trim()) {
                setDraft((p) => ({ ...p, mail_domains: res.domains.join(", ") }));
            }
        } catch (err) {
            setTestResult({ ok: false, message: err?.response?.data?.message || err.message });
        } finally {
            setTesting(false);
        }
    }

    async function handleSave(e) {
        e.preventDefault();
        setError("");
        setSuccess("");
        setSaving(true);
        try {
            if (draft.documentId) {
                await MailServersEndpoints.update(draft.documentId, draftPayload());
                setSuccess("Server updated.");
            } else {
                if (!draft.api_key.trim()) {
                    setError("An admin API key is required for a new server.");
                    setSaving(false);
                    return;
                }
                await MailServersEndpoints.create(draftPayload());
                setSuccess("Server registered.");
            }
            setDraft(null);
            await loadServers();
        } catch (err) {
            setError(err?.response?.data?.error?.message || err?.response?.data?.message || err.message || "Save failed");
        } finally {
            setSaving(false);
        }
    }

    async function handleCheck(server) {
        setCheckingId(server.documentId);
        setError("");
        try {
            const res = await MailServersEndpoints.validateServer({ documentId: server.documentId });
            setSuccess(`${server.name}: OK — ${res.mailboxCount ?? "?"} mailboxes${res.domains?.length ? `, domains: ${res.domains.join(", ")}` : ""}`);
            await loadServers();
        } catch (err) {
            setError(`${server.name}: ${err?.response?.data?.message || err.message}`);
            await loadServers();
        } finally {
            setCheckingId(null);
        }
    }

    async function handleDelete(server) {
        if (!confirm(`Remove mail server "${server.name}"? Provisioned accounts keep working — only automatic provisioning through it stops.`)) return;
        try {
            await MailServersEndpoints.del(server.documentId);
            setSuccess(`"${server.name}" removed.`);
            await loadServers();
        } catch (err) {
            setError("Failed to remove: " + (err.message || ""));
        }
    }

    return (
        <Layout>
            <ProtectedRoute>
                <AppAccessGate>
                <PermissionCheck adminOnly appKey="admin" required="admin">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2><i className="fas fa-server me-2"></i>Email Servers</h2>
                    <button className="btn btn-primary" onClick={openNew}>
                        <i className="fas fa-plus me-1"></i> Register Server
                    </button>
                </div>

                <div className="alert alert-info">
                    Register a mail server's admin endpoint (mailcow-type, e.g. <code>https://mail.trustlist.uk</code>)
                    and assigning an email to a user provisions the mailbox automatically. The admin API key is stored
                    encrypted and never shown again.
                </div>

                {error && <div className="alert alert-danger">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                {draft && (
                    <div className="card mb-4">
                        <div className="card-body">
                            <h5 className="card-title">{draft.documentId ? "Edit Server" : "Register Server"}</h5>
                            <form onSubmit={handleSave}>
                                <div className="row g-3">
                                    <div className="col-md-4">
                                        <label className="form-label">Name *</label>
                                        <input className="form-control" value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} required />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">Type</label>
                                        <select className="form-select" value={draft.kind} onChange={e => setDraft(p => ({ ...p, kind: e.target.value }))}>
                                            <option value="mailcow">mailcow</option>
                                        </select>
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Admin base URL *</label>
                                        <input className="form-control" placeholder="https://mail.trustlist.uk" value={draft.base_url} onChange={e => setDraft(p => ({ ...p, base_url: e.target.value }))} required />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Admin API key {draft.documentId ? <small className="text-muted">(blank keeps the stored key)</small> : "*"}</label>
                                        <input className="form-control" type="password" value={draft.api_key} onChange={e => setDraft(p => ({ ...p, api_key: e.target.value }))} />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Email domains <small className="text-muted">(comma-separated; auto-filled by Test)</small></label>
                                        <input className="form-control" placeholder="rutba.pk, trustlist.uk" value={draft.mail_domains} onChange={e => setDraft(p => ({ ...p, mail_domains: e.target.value }))} />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">IMAP host <small className="text-muted">(default: server hostname)</small></label>
                                        <input className="form-control" value={draft.imap_host} onChange={e => setDraft(p => ({ ...p, imap_host: e.target.value }))} />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">SMTP host <small className="text-muted">(default: server hostname)</small></label>
                                        <input className="form-control" value={draft.smtp_host} onChange={e => setDraft(p => ({ ...p, smtp_host: e.target.value }))} />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Active</label>
                                        <div className="form-check form-switch mt-1">
                                            <input className="form-check-input" type="checkbox" checked={draft.is_active} onChange={e => setDraft(p => ({ ...p, is_active: e.target.checked }))} />
                                        </div>
                                    </div>
                                </div>

                                {testResult && (
                                    <div className={`alert mt-3 mb-0 ${testResult.ok ? "alert-success" : "alert-danger"}`}>
                                        {testResult.ok
                                            ? <>Connection OK — {testResult.mailboxCount ?? "?"} mailboxes{testResult.domains?.length ? <>, domains: {testResult.domains.join(", ")}</> : null}</>
                                            : <>Connection failed: {testResult.message}</>}
                                    </div>
                                )}

                                <div className="d-flex gap-2 mt-3">
                                    <button type="button" className="btn btn-outline-info" onClick={handleTest} disabled={testing || (!draft.documentId && (!draft.base_url.trim() || !draft.api_key.trim()))}>
                                        <i className="fas fa-plug me-1"></i>{testing ? "Testing..." : "Test connection"}
                                    </button>
                                    <button type="submit" className="btn btn-success" disabled={saving}>
                                        {saving ? "Saving..." : (draft.documentId ? "Save Changes" : "Register")}
                                    </button>
                                    <button type="button" className="btn btn-outline-secondary" onClick={() => setDraft(null)}>Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Admin URL</th>
                                    <th>Domains</th>
                                    <th>Status</th>
                                    <th style={{ width: 200 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {servers.length === 0 && (
                                    <tr><td colSpan="6" className="text-center text-muted py-4">No mail servers registered</td></tr>
                                )}
                                {servers.map(s => (
                                    <tr key={s.documentId}>
                                        <td className="fw-semibold">{s.name}</td>
                                        <td><span className="badge bg-secondary">{s.kind}</span></td>
                                        <td><code>{s.base_url}</code></td>
                                        <td>
                                            {(s.mail_domains || []).map((d) => (
                                                <span key={d} className="badge bg-light text-dark border me-1 mb-1">{d}</span>
                                            ))}
                                        </td>
                                        <td>
                                            {s.is_active === false
                                                ? <span className="badge bg-secondary">Disabled</span>
                                                : s.last_error
                                                    ? <span className="badge bg-danger" title={s.last_error}>Error</span>
                                                    : s.last_checked_at
                                                        ? <span className="badge bg-success">OK</span>
                                                        : <span className="badge bg-warning text-dark">Untested</span>}
                                        </td>
                                        <td className="text-end">
                                            <button className="btn btn-sm btn-outline-info me-1" disabled={checkingId === s.documentId} onClick={() => handleCheck(s)}>
                                                {checkingId === s.documentId ? "..." : "Check"}
                                            </button>
                                            <button className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(s)}>Edit</button>
                                            <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(s)}><i className="fas fa-trash"></i></button>
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
