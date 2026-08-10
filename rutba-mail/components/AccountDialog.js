import { useState, useEffect } from "react";
import EnumSelect from "@rutba/pos-shared/components/EnumSelect";
import { MailAccountsEndpoints } from "@rutba/api-provider/endpoints";

// Add/edit a BYO IMAP/SMTP mailbox.
//
// Password fields are WRITE-ONLY: the API never returns credentials (they are
// private, encrypted columns), so editing shows blank password inputs and a
// blank submit leaves the stored secret untouched — the backend guarantees a
// password-less PUT never wipes ciphertext.

const EMPTY = {
    name: "", kind: "personal", email: "", from_name: "", reply_to: "",
    imap_host: "", imap_port: 993, imap_secure: true, imap_username: "", imap_password: "",
    smtp_host: "", smtp_port: 465, smtp_secure: true, smtp_username: "", smtp_password: "",
    signature_html: "", is_active: true, access_roles: [],
};

export default function AccountDialog({ account, onSaved, onClose }) {
    const editing = Boolean(account?.documentId);
    const [draft, setDraft] = useState(EMPTY);
    const [busy, setBusy] = useState(null);
    const [test, setTest] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (account) {
            setDraft({
                ...EMPTY,
                ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, account[k] ?? EMPTY[k]])),
                imap_password: "",
                smtp_password: "",
            });
        } else {
            setDraft(EMPTY);
        }
        setTest(null);
        setError(null);
    }, [account]);

    const set = (k) => (e) => {
        const v = e?.target?.type === "checkbox" ? e.target.checked : e.target.value;
        setDraft((d) => ({ ...d, [k]: v }));
    };
    const setNum = (k) => (e) => setDraft((d) => ({ ...d, [k]: Number(e.target.value) || 0 }));

    const [prefilledFrom, setPrefilledFrom] = useState(null);

    // Company domains resolve their IMAP/SMTP settings from the mail-server
    // registry (User Management → Email Servers) — typed hosts are never
    // overwritten, and unknown domains just stay manual BYO.
    const prefillFromRegistry = async () => {
        const domain = String(draft.email || "").split("@")[1]?.trim().toLowerCase();
        if (!domain || draft.imap_host || draft.smtp_host) return;
        try {
            const res = await MailAccountsEndpoints.getServerDefaults(domain);
            if (res?.found && res.settings) {
                setDraft((d) => (d.imap_host || d.smtp_host ? d : { ...d, ...res.settings }));
                setPrefilledFrom(res.server?.name || domain);
            }
        } catch {
            /* registry unavailable — manual entry works as before */
        }
    };

    const runTest = async () => {
        setBusy("test");
        setTest(null);
        setError(null);
        try {
            const res = await MailAccountsEndpoints.validateConnection({
                ...(editing ? { documentId: account.documentId } : {}),
                settings: draft,
            });
            setTest(res);
        } catch (err) {
            setError(`Connection test failed: ${err.message}`);
        } finally {
            setBusy(null);
        }
    };

    const save = async (e) => {
        e.preventDefault();
        setBusy("save");
        setError(null);
        try {
            const data = { ...draft };
            if (!data.imap_password) delete data.imap_password;
            if (!data.smtp_password) delete data.smtp_password;
            if (editing) await MailAccountsEndpoints.update(account.documentId, data);
            else await MailAccountsEndpoints.create(data);
            onSaved?.();
        } catch (err) {
            setError(`Save failed: ${err.message}`);
        } finally {
            setBusy(null);
        }
    };

    return (
        <form className="card border-primary mb-4" onSubmit={save}>
            <div className="card-body">
                <div className="d-flex justify-content-between align-items-start">
                    <h5 className="card-title">{editing ? `Edit "${account.name}"` : "Connect a mailbox"}</h5>
                    <button type="button" className="btn-close" onClick={onClose}></button>
                </div>
                <p className="text-muted small mb-3">
                    Any IMAP/SMTP mailbox works — mailcow, Hostinger, Gmail (app password).
                    Mail is read live from the server; the ERP stores only the connection
                    settings, with passwords encrypted.
                </p>

                <div className="row g-2">
                    <div className="col-md-4">
                        <label className="form-label">Display name</label>
                        <input className="form-control" required value={draft.name} onChange={set("name")} />
                    </div>
                    <div className="col-md-2">
                        <label className="form-label">Kind</label>
                        <EnumSelect name="mail-account" field="kind" value={draft.kind} onChange={set("kind")} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Email address</label>
                        <input className="form-control" type="email" required value={draft.email}
                            onChange={set("email")} onBlur={prefillFromRegistry} />
                        {prefilledFrom && (
                            <div className="form-text text-success">
                                Server settings filled from “{prefilledFrom}”.
                            </div>
                        )}
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">From name</label>
                        <input className="form-control" value={draft.from_name} onChange={set("from_name")} />
                    </div>
                </div>

                <h6 className="mt-3 mb-1">IMAP (reading)</h6>
                <div className="row g-2">
                    <div className="col-md-4">
                        <label className="form-label">Host</label>
                        <input className="form-control" required value={draft.imap_host} onChange={set("imap_host")} />
                    </div>
                    <div className="col-md-2">
                        <label className="form-label">Port</label>
                        <input className="form-control" type="number" value={draft.imap_port} onChange={setNum("imap_port")} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Username <span className="text-muted">(blank = email)</span></label>
                        <input className="form-control" value={draft.imap_username} onChange={set("imap_username")} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Password{editing && <span className="text-muted"> (blank = keep current)</span>}</label>
                        <input className="form-control" type="password" autoComplete="new-password"
                            required={!editing} value={draft.imap_password} onChange={set("imap_password")} />
                    </div>
                    <div className="col-12 form-check ms-2">
                        <input className="form-check-input" type="checkbox" id="imap-secure"
                            checked={draft.imap_secure} onChange={set("imap_secure")} />
                        <label className="form-check-label" htmlFor="imap-secure">
                            Implicit TLS (993). Leave off for STARTTLS on 143.
                        </label>
                    </div>
                </div>

                <h6 className="mt-3 mb-1">SMTP (sending)</h6>
                <div className="row g-2">
                    <div className="col-md-4">
                        <label className="form-label">Host</label>
                        <input className="form-control" required value={draft.smtp_host} onChange={set("smtp_host")} />
                    </div>
                    <div className="col-md-2">
                        <label className="form-label">Port</label>
                        <input className="form-control" type="number" value={draft.smtp_port} onChange={setNum("smtp_port")} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Username <span className="text-muted">(blank = IMAP)</span></label>
                        <input className="form-control" value={draft.smtp_username} onChange={set("smtp_username")} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Password <span className="text-muted">(blank = IMAP password)</span></label>
                        <input className="form-control" type="password" autoComplete="new-password"
                            value={draft.smtp_password} onChange={set("smtp_password")} />
                    </div>
                    <div className="col-12 form-check ms-2">
                        <input className="form-check-input" type="checkbox" id="smtp-secure"
                            checked={draft.smtp_secure} onChange={set("smtp_secure")} />
                        <label className="form-check-label" htmlFor="smtp-secure">
                            Implicit TLS (465). Leave off for STARTTLS on 587.
                        </label>
                    </div>
                </div>

                <div className="row g-2 mt-1">
                    <div className="col-md-4">
                        <label className="form-label">Reply-to (optional)</label>
                        <input className="form-control" value={draft.reply_to} onChange={set("reply_to")} />
                    </div>
                    <div className="col-md-8">
                        <label className="form-label">Signature (HTML, appended on compose)</label>
                        <textarea className="form-control" rows={2} value={draft.signature_html} onChange={set("signature_html")} />
                    </div>
                    {draft.kind === "shared" && (
                        <div className="col-md-6">
                            <label className="form-label">
                                Access roles <span className="text-muted">(app-role keys, comma-separated — e.g. crm_staff)</span>
                            </label>
                            <input className="form-control"
                                value={(draft.access_roles || []).join(", ")}
                                onChange={(e) => setDraft((d) => ({
                                    ...d,
                                    access_roles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                                }))} />
                        </div>
                    )}
                    <div className="col-12 form-check ms-2">
                        <input className="form-check-input" type="checkbox" id="acc-active"
                            checked={draft.is_active} onChange={set("is_active")} />
                        <label className="form-check-label" htmlFor="acc-active">Active</label>
                    </div>
                </div>

                {test && (
                    <div className={`alert mt-3 mb-0 alert-${test.ok ? "success" : "warning"}`}>
                        <div>
                            <strong>IMAP:</strong>{" "}
                            {test.imap?.ok ? <span className="text-success">OK</span> : <span className="text-danger">{test.imap?.error || "failed"}</span>}
                        </div>
                        <div>
                            <strong>SMTP:</strong>{" "}
                            {test.smtp?.ok ? <span className="text-success">OK</span> : <span className="text-danger">{test.smtp?.error || "failed"}</span>}
                        </div>
                        {test.specialFolders && (
                            <div className="small text-muted mt-1">
                                Detected folders: {Object.entries(test.specialFolders).map(([k, v]) => `${k} → ${v}`).join(", ") || "none"}
                            </div>
                        )}
                    </div>
                )}
                {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}

                <div className="mt-3">
                    <button type="button" className="btn btn-outline-secondary me-2" disabled={busy !== null} onClick={runTest}>
                        {busy === "test" ? "Testing…" : "Test connection"}
                    </button>
                    <button className="btn btn-primary me-2" disabled={busy !== null}>
                        {busy === "save" ? "Saving…" : editing ? "Save changes" : "Add mailbox"}
                    </button>
                    <button type="button" className="btn btn-link" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </form>
    );
}
