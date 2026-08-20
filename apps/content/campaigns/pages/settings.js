import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { CmpSendingIdentitiesEndpoints } from "@rutba/api-provider/endpoints";

// Sending identities — the from-addresses campaigns send as, each backed by a
// registered MTA sender.
//
// Registration is two steps on purpose. Creating the record is cheap and
// reversible; registering it with the MTA returns a trust token and webhook
// secret exactly ONCE, so that step is explicit and its failure is visible.
//
// The SMTP password is typed here, posted straight through to the MTA (which
// encrypts it at rest) and never stored by the ERP — which is why it is not a
// field on the identity and has to be re-entered if the sender is re-registered.

const emptyDraft = { name: "", from_email: "", from_name: "", reply_to: "" };
const emptySmtp = { host: "", port: 587, secure: false, username: "", password: "" };

export default function SettingsPage() {
    const { jwt } = useAuth();
    const [identities, setIdentities] = useState([]);
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);

    const [draft, setDraft] = useState(emptyDraft);
    const [showDraft, setShowDraft] = useState(false);

    const [setupFor, setSetupFor] = useState(null);
    const [smtp, setSmtp] = useState(emptySmtp);

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        Promise.all([
            CmpSendingIdentitiesEndpoints.list({ pageSize: 100 }),
            // Health is advisory — a failure here must not blank the list.
            CmpSendingIdentitiesEndpoints.getMtaHealth().catch((e) => ({ error: e?.message })),
        ])
            .then(([list, h]) => {
                setIdentities(list?.data || []);
                setHealth(h || null);
            })
            .catch((err) => setNotice({ type: "danger", text: `Failed to load: ${err.message}` }))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const createIdentity = async (e) => {
        e.preventDefault();
        setBusy("create");
        try {
            await CmpSendingIdentitiesEndpoints.create(draft);
            setDraft(emptyDraft);
            setShowDraft(false);
            setNotice({ type: "success", text: "Identity created. Register it with the MTA to start sending." });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Create failed: ${err.message}` });
        } finally {
            setBusy(null);
        }
    };

    const registerIdentity = async (e) => {
        e.preventDefault();
        setBusy("setup");
        try {
            const res = await CmpSendingIdentitiesEndpoints.setupSender(setupFor.documentId, { smtp });
            if (res?.ok) {
                setNotice({ type: "success", text: `${setupFor.name} registered with the MTA.` });
                setSetupFor(null);
                setSmtp(emptySmtp);
                load();
            } else {
                setNotice({ type: "danger", text: res?.message || "Registration failed." });
            }
        } catch (err) {
            setNotice({ type: "danger", text: `Registration failed: ${err.message}` });
        } finally {
            setBusy(null);
        }
    };

    const validate = async (identity) => {
        setBusy(`validate:${identity.documentId}`);
        try {
            const res = await CmpSendingIdentitiesEndpoints.validateSender(identity.documentId);
            setNotice(res?.ok
                ? { type: "success", text: `${identity.name} is reachable.` }
                : { type: "warning", text: `${identity.name}: ${res?.error || "not reachable"}` });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Check failed: ${err.message}` });
        } finally {
            setBusy(null);
        }
    };

    const rotate = async (identity) => {
        if (!window.confirm(
            `Rotate the trust token for "${identity.name}"?\n\n`
            + "The current token stops working immediately. Any in-flight campaign run "
            + "using it will fail until the new token is stored."
        )) return;
        setBusy(`rotate:${identity.documentId}`);
        try {
            await CmpSendingIdentitiesEndpoints.resetToken(identity.documentId);
            setNotice({ type: "success", text: "Token rotated." });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Rotate failed: ${err.message}` });
        } finally {
            setBusy(null);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Settings</h2>
                    <button className="btn btn-primary" onClick={() => setShowDraft((v) => !v)}>
                        <i className="fas fa-plus me-1"></i>Add Sending Identity
                    </button>
                </div>

                <MtaStatus health={health} />

                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                {showDraft && (
                    <form className="card mb-4" onSubmit={createIdentity}>
                        <div className="card-body">
                            <h5 className="card-title">New sending identity</h5>
                            <div className="row g-2">
                                <div className="col-md-3">
                                    <label className="form-label">Name</label>
                                    <input className="form-control" required value={draft.name}
                                        onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">From address</label>
                                    <input className="form-control" type="email" required value={draft.from_email}
                                        onChange={(e) => setDraft({ ...draft, from_email: e.target.value })} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">From name</label>
                                    <input className="form-control" value={draft.from_name}
                                        onChange={(e) => setDraft({ ...draft, from_name: e.target.value })} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Reply-to</label>
                                    <input className="form-control" type="email" value={draft.reply_to}
                                        onChange={(e) => setDraft({ ...draft, reply_to: e.target.value })} />
                                </div>
                            </div>
                            <button className="btn btn-primary mt-3" disabled={busy === "create"}>
                                {busy === "create" ? "Creating…" : "Create"}
                            </button>
                        </div>
                    </form>
                )}

                {loading ? (
                    <p className="text-muted">Loading…</p>
                ) : identities.length === 0 ? (
                    <div className="alert alert-light border">
                        No sending identities yet. Add one, then register it with MTA.
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle">
                            <thead>
                                <tr>
                                    <th>Name</th><th>From</th><th>MTA</th><th>Last checked</th><th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {identities.map((i) => (
                                    <tr key={i.documentId}>
                                        <td>
                                            {i.name}
                                            {i.is_default && <span className="badge bg-secondary ms-2">default</span>}
                                            {!i.is_active && <span className="badge bg-light text-muted border ms-2">inactive</span>}
                                        </td>
                                        <td className="text-muted">
                                            {i.from_name ? `${i.from_name} <${i.from_email}>` : i.from_email}
                                        </td>
                                        <td>
                                            {i.mta_sender_id
                                                ? <span className="badge bg-success">registered</span>
                                                : <span className="badge bg-warning text-dark">not registered</span>}
                                            {i.last_error && (
                                                <div className="small text-danger mt-1">{i.last_error}</div>
                                            )}
                                        </td>
                                        <td className="text-muted small">
                                            {i.last_verified_at ? new Date(i.last_verified_at).toLocaleString() : "—"}
                                        </td>
                                        <td className="text-end">
                                            {!i.mta_sender_id ? (
                                                <button className="btn btn-sm btn-outline-primary"
                                                    onClick={() => { setSetupFor(i); setSmtp(emptySmtp); }}>
                                                    Register with MTA
                                                </button>
                                            ) : (
                                                <>
                                                    <button className="btn btn-sm btn-outline-secondary me-2"
                                                        disabled={busy === `validate:${i.documentId}`}
                                                        onClick={() => validate(i)}>
                                                        {busy === `validate:${i.documentId}` ? "Checking…" : "Check"}
                                                    </button>
                                                    <button className="btn btn-sm btn-outline-danger"
                                                        disabled={busy === `rotate:${i.documentId}`}
                                                        onClick={() => rotate(i)}>
                                                        Rotate token
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {setupFor && (
                    <form className="card border-primary mt-4" onSubmit={registerIdentity}>
                        <div className="card-body">
                            <h5 className="card-title">Register &ldquo;{setupFor.name}&rdquo; with MTA</h5>
                            <p className="text-muted small">
                                The MTA relays through your own SMTP server — it does not deliver
                                direct-to-MX. These credentials are forwarded to the MTA, which encrypts
                                them at rest; the ERP stores the host, port and username for display but
                                never the password.
                            </p>
                            <div className="row g-2">
                                <div className="col-md-4">
                                    <label className="form-label">SMTP host</label>
                                    <input className="form-control" required value={smtp.host}
                                        onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Port</label>
                                    <input className="form-control" type="number" value={smtp.port}
                                        onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Username</label>
                                    <input className="form-control" required value={smtp.username}
                                        onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Password</label>
                                    <input className="form-control" type="password" required value={smtp.password}
                                        onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} />
                                </div>
                                <div className="col-12 form-check ms-2 mt-2">
                                    <input className="form-check-input" type="checkbox" id="smtp-secure"
                                        checked={smtp.secure}
                                        onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })} />
                                    <label className="form-check-label" htmlFor="smtp-secure">
                                        Implicit TLS (port 465). Leave off for STARTTLS on 587.
                                    </label>
                                </div>
                            </div>
                            <div className="mt-3">
                                <button className="btn btn-primary me-2" disabled={busy === "setup"}>
                                    {busy === "setup" ? "Registering…" : "Register"}
                                </button>
                                <button type="button" className="btn btn-link"
                                    onClick={() => { setSetupFor(null); setSmtp(emptySmtp); }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

function MtaStatus({ health }) {
    if (!health) return null;
    if (health.error) {
        return <div className="alert alert-warning">Could not read MTA status: {health.error}</div>;
    }
    if (!health.configured) {
        return (
            <div className="alert alert-warning">
                <strong>MTA is not configured.</strong> Set <code>MTA_BASE_URL</code> and restart
                the API. Campaigns can be authored without it, but no run will send.
            </div>
        );
    }
    if (health.reachable === false) {
        return (
            <div className="alert alert-danger">
                <strong>MTA unreachable</strong> at <code>{health.baseUrl}</code>
                {health.message ? ` — ${health.message}` : ""}
            </div>
        );
    }
    if (health.reachable === null) {
        return (
            <div className="alert alert-info">
                MTA configured at <code>{health.baseUrl}</code>. {health.message}
            </div>
        );
    }
    return (
        <div className="alert alert-success">
            MTA reachable at <code>{health.baseUrl}</code> as <strong>{health.identity}</strong>.
        </div>
    );
}
