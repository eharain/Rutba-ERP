import React, { useState, useEffect, useCallback, useMemo } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { SocialRelayProvidersEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";
import PLATFORMS from "../components/PlatformBadge";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";

// A relay provider is a third-party aggregator API (Ayrshare, Postiz, …) that
// posts to several platforms through ONE key — the Meta/TikTok developer apps,
// app review and token refresh live on the provider's side, not ours. Which
// providers exist, what each needs (API URL? team id?) and which platforms it
// can reach all come from /social-relay-providers/meta (the server-side adapter
// registry) so nothing is hardcoded here.

const EMPTY_FORM = {
    name: "",
    provider: "",
    api_key: "",
    api_url: "",
    target_id: "",
    platforms: [],
    is_active: true,
};

export default function RelaysPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [relays, setRelays] = useState([]);
    const [providerMeta, setProviderMeta] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);

    const metaByKey = useMemo(
        () => Object.fromEntries(providerMeta.map((p) => [p.key, p])),
        [providerMeta],
    );
    const currentMeta = metaByKey[form.provider] || null;

    const loadRelays = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await SocialRelayProvidersEndpoints.list({ sort: ["createdAt:asc"] });
            setRelays(res.data || []);
        } catch (err) {
            console.error("Failed to load relay providers", err);
            toast("Failed to load relay providers.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadRelays(); }, [loadRelays]);

    useEffect(() => {
        if (!jwt) return;
        SocialRelayProvidersEndpoints.providerMeta()
            .then((res) => {
                const r = res?.data || res || {};
                setProviderMeta(Array.isArray(r.providers) ? r.providers : []);
            })
            .catch((err) => {
                console.error("Failed to load provider catalogue", err);
                setProviderMeta([]);
            });
    }, [jwt]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name === "provider") {
            const meta = metaByKey[value];
            setForm((prev) => ({
                ...prev,
                provider: value,
                // Provider-specific routing fields mean different things per
                // provider — never carry them across a switch.
                api_url: "",
                target_id: "",
                // Start with everything the provider supports selected; the
                // whole point of the platforms picker is trimming this down.
                platforms: meta ? [...(meta.platforms || [])] : [],
            }));
            return;
        }
        setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    };

    const togglePlatform = (key) => setForm((prev) => ({
        ...prev,
        platforms: prev.platforms.includes(key)
            ? prev.platforms.filter((p) => p !== key)
            : [...prev.platforms, key],
    }));

    const openCreate = () => {
        setEditing(null);
        const firstProvider = providerMeta[0];
        setForm({
            ...EMPTY_FORM,
            provider: firstProvider?.key || "",
            platforms: firstProvider ? [...(firstProvider.platforms || [])] : [],
        });
        setShowForm(true);
    };

    const openEdit = (relay) => {
        setEditing(relay);
        setForm({
            name: relay.name || "",
            provider: relay.provider || "",
            api_key: "", // private → reads back blank; blank on save = keep stored value
            api_url: relay.api_url || "",
            target_id: relay.target_id || "",
            platforms: Array.isArray(relay.platforms) ? relay.platforms : [],
            is_active: relay.is_active !== false,
        });
        setShowForm(true);
    };

    const runTest = async (relay, { silentOk = false } = {}) => {
        setBusyId(relay.documentId);
        try {
            const res = await SocialRelayProvidersEndpoints.validate(relay.documentId);
            const r = res?.data || res || {};
            if (r.ok) {
                if (!silentOk) toast(`✅ ${relay.name}: ${r.detail || "connection OK"}`, "success");
            } else {
                toast(`⚠️ ${relay.name}: ${r.detail || "validation failed"}`, "warning");
            }
            await loadRelays();
            return !!r.ok;
        } catch (err) {
            console.error("Relay test failed", err);
            toast(`Relay test failed for ${relay.name}.`, "danger");
            return false;
        } finally {
            setBusyId(null);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.provider) { toast("Pick a provider first.", "warning"); return; }
        if (!form.platforms.length) { toast("Select at least one platform to post through this relay.", "warning"); return; }
        if (currentMeta?.needsApiUrl === "required" && !form.api_url.trim()) {
            toast("This provider needs an API URL.", "warning");
            return;
        }
        setSaving(true);
        try {
            const data = { ...form, api_url: form.api_url.trim() || null };
            // api_key is write-only (private in the schema) — blank while editing
            // means "keep the stored key", not "wipe it".
            if (editing && !data.api_key) delete data.api_key;
            let saved;
            if (editing) {
                const res = await SocialRelayProvidersEndpoints.update(editing.documentId, { data });
                saved = res?.data || editing;
                toast("Relay provider updated.", "success");
            } else {
                const res = await SocialRelayProvidersEndpoints.create({ data });
                saved = res?.data || null;
                toast("Relay provider added.", "success");
            }
            setShowForm(false);
            setEditing(null);
            setForm({ ...EMPTY_FORM });
            await loadRelays();
            // Probe the key right away so a typo'd key fails at save time, not on
            // the first real post.
            if (saved?.documentId) {
                const ok = await runTest({ ...saved, name: data.name }, { silentOk: false });
                if (!ok) toast("The relay was saved but its key did not validate — check it.", "warning");
            }
        } catch (err) {
            console.error("Failed to save relay provider", err);
            toast("Failed to save relay provider.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (relay) => {
        if (!confirm(`Delete relay provider "${relay.name}"?`)) return;
        try {
            await SocialRelayProvidersEndpoints.del(relay.documentId);
            toast("Relay provider deleted.", "success");
            await loadRelays();
        } catch (err) {
            console.error("Failed to delete relay provider", err);
            toast("Failed to delete relay provider.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <PermissionCheck adminOnly appKey="admin" required="admin">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-tower-broadcast me-2"></i>Social Relay Providers</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreate} disabled={!providerMeta.length}>
                        <i className="fas fa-plus me-1"></i>Add Relay
                    </button>
                </div>

                <p className="text-muted small">
                    A relay posts to several platforms through one aggregator API key — no Meta/TikTok
                    developer apps, app review, or token plumbing on our side. Connect your accounts on the
                    provider&apos;s dashboard, paste its key here, and pick the platforms it should cover.
                    Posting through it then happens in{" "}
                    <a href={`${APP_URLS.social}/posts`}>Social Media → Posts</a>, via the{" "}
                    <strong>Relay</strong> buttons there.
                </p>

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-body">
                            <h5>{editing ? "Edit Relay" : "New Relay"}</h5>
                            <form onSubmit={handleSubmit}>
                                <div className="row g-3">
                                    <div className="col-md-4">
                                        <label className="form-label">Provider</label>
                                        <select className="form-select" name="provider" value={form.provider}
                                            onChange={handleChange} disabled={!!editing}>
                                            {providerMeta.map((p) => (
                                                <option key={p.key} value={p.key}>{p.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-md-8">
                                        <label className="form-label">Name <span className="text-muted small">(a label for you)</span></label>
                                        <input className="form-control" name="name" value={form.name}
                                            onChange={handleChange} required placeholder="e.g. Ayrshare — rutba.pk" />
                                    </div>

                                    {currentMeta && (
                                        <div className="col-12">
                                            <div className="alert alert-info py-2 mb-0 small">
                                                <div className="fw-semibold mb-2">
                                                    <i className="fas fa-circle-info me-1"></i>Setting up {currentMeta.label}
                                                </div>
                                                {currentMeta.help?.signup && (
                                                    <div className="mb-1 d-flex align-items-start">
                                                        <span className="badge bg-primary me-2 flex-shrink-0">1 · Account</span>
                                                        <span>
                                                            {currentMeta.help.signup}
                                                            {currentMeta.websiteUrl && (
                                                                <>
                                                                    {" "}
                                                                    <a href={currentMeta.websiteUrl} target="_blank" rel="noopener noreferrer">
                                                                        {currentMeta.websiteUrl.replace(/^https?:\/\//, "")}
                                                                        <i className="fas fa-arrow-up-right-from-square ms-1"></i>
                                                                    </a>
                                                                </>
                                                            )}
                                                        </span>
                                                    </div>
                                                )}
                                                {currentMeta.help?.connect && (
                                                    <div className="mb-1 d-flex align-items-start">
                                                        <span className="badge bg-primary me-2 flex-shrink-0">2 · Connect</span>
                                                        <span>{currentMeta.help.connect}</span>
                                                    </div>
                                                )}
                                                {currentMeta.help?.key && (
                                                    <div className="mb-1 d-flex align-items-start">
                                                        <span className="badge bg-primary me-2 flex-shrink-0">3 · API key</span>
                                                        <span>{currentMeta.help.key}</span>
                                                    </div>
                                                )}
                                                {currentMeta.help?.note && (
                                                    <div className="mt-1 text-body-secondary">
                                                        <i className="fas fa-circle-info me-1"></i>{currentMeta.help.note}
                                                    </div>
                                                )}
                                                {(currentMeta.apiBase || form.api_url) && (
                                                    <div className="mt-1">
                                                        <i className="fas fa-plug me-1"></i>Posts will be sent to{" "}
                                                        <code>{form.api_url.trim() || currentMeta.apiBase}</code>
                                                    </div>
                                                )}
                                                <div className="mt-1 d-flex gap-3">
                                                    {currentMeta.websiteUrl && (
                                                        <a href={currentMeta.websiteUrl} target="_blank" rel="noopener noreferrer">
                                                            <i className="fas fa-globe me-1"></i>Provider dashboard
                                                        </a>
                                                    )}
                                                    {currentMeta.docsUrl && (
                                                        <a href={currentMeta.docsUrl} target="_blank" rel="noopener noreferrer">
                                                            <i className="fas fa-book me-1"></i>API docs
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="col-md-6">
                                        <label className="form-label">API Key</label>
                                        <input className="form-control" name="api_key" type="password" value={form.api_key}
                                            onChange={handleChange} autoComplete="off"
                                            placeholder={editing ? "leave blank to keep the stored key" : "paste the provider's API key"} />
                                    </div>
                                    {currentMeta?.needsApiUrl !== "no" && (
                                        <div className="col-md-6">
                                            <label className="form-label">
                                                API URL
                                                {currentMeta?.needsApiUrl === "optional" && <span className="text-muted small ms-1">(optional — for self-hosted)</span>}
                                            </label>
                                            <input className="form-control" name="api_url" value={form.api_url}
                                                onChange={handleChange} autoComplete="off"
                                                placeholder={currentMeta?.needsApiUrl === "required" ? "https://… (the endpoint posts are sent to)" : "https://… (leave blank for the provider's cloud)"} />
                                        </div>
                                    )}
                                    {currentMeta?.targetLabel && (
                                        <div className="col-md-6">
                                            <label className="form-label">{currentMeta.targetLabel}</label>
                                            <input className="form-control" name="target_id" value={form.target_id}
                                                onChange={handleChange} autoComplete="off" />
                                        </div>
                                    )}

                                    <div className="col-12">
                                        <label className="form-label mb-1">Platforms to post through this relay</label>
                                        <p className="text-muted small mb-2">
                                            Only platforms you also have connected on {currentMeta?.label || "the provider"}&apos;s
                                            dashboard will actually go out — the Test button shows what&apos;s linked there.
                                        </p>
                                        <div className="d-flex flex-wrap gap-2">
                                            {(currentMeta?.platforms || []).map((key) => {
                                                const p = PLATFORMS[key] || { label: key, icon: "fas fa-share-nodes" };
                                                const on = form.platforms.includes(key);
                                                return (
                                                    <button key={key} type="button"
                                                        className={`btn btn-sm ${on ? "btn-primary" : "btn-outline-secondary"}`}
                                                        onClick={() => togglePlatform(key)}>
                                                        <i className={`${p.icon} me-1`}></i>{p.label}
                                                        {on && <i className="fas fa-check ms-1"></i>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="col-12">
                                        <div className="form-check">
                                            <input className="form-check-input" type="checkbox" name="is_active"
                                                checked={form.is_active} onChange={handleChange} id="relayActive" />
                                            <label className="form-check-label" htmlFor="relayActive">Active</label>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 d-flex gap-2">
                                    <button className="btn btn-success btn-sm" type="submit" disabled={saving}>
                                        {saving ? "Saving..." : "Save & Test"}
                                    </button>
                                    <button className="btn btn-secondary btn-sm" type="button"
                                        onClick={() => { setShowForm(false); setEditing(null); }}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : relays.length === 0 ? (
                    <div className="alert alert-info">
                        No relay providers yet. Add one to push posts through an aggregator API
                        (Ayrshare, Postiz, Zernio, Post Bridge, bundle.social — or your own webhook).
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Provider</th>
                                    <th>Platforms</th>
                                    <th>Status</th>
                                    <th>Last check</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {relays.map((relay) => {
                                    const meta = metaByKey[relay.provider];
                                    return (
                                        <tr key={relay.id}>
                                            <td>
                                                {relay.name}
                                                {relay.target_id && (
                                                    <div className="small text-muted"><i className="fas fa-bullseye me-1"></i>{relay.target_id}</div>
                                                )}
                                            </td>
                                            <td>
                                                {meta?.websiteUrl ? (
                                                    <a href={meta.websiteUrl} target="_blank" rel="noopener noreferrer"
                                                        className="text-decoration-none" title={`Open the ${meta.label} dashboard`}>
                                                        <span className="badge bg-dark">
                                                            {meta.label}<i className="fas fa-arrow-up-right-from-square ms-1"></i>
                                                        </span>
                                                    </a>
                                                ) : (
                                                    <span className="badge bg-dark">{meta?.label || relay.provider}</span>
                                                )}
                                                <div className="small text-muted text-truncate" style={{ maxWidth: 200 }}
                                                    title="Where posts are sent">
                                                    {relay.api_url || meta?.apiBase || ""}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="d-flex flex-wrap gap-1">
                                                    {(relay.platforms || []).map((key) => {
                                                        const p = PLATFORMS[key] || { label: key, icon: "fas fa-share-nodes" };
                                                        return (
                                                            <span key={key} className="badge bg-light text-dark border" title={p.label}>
                                                                <i className={p.icon}></i>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td>
                                                {relay.is_active !== false
                                                    ? <span className="badge bg-success">Active</span>
                                                    : <span className="badge bg-secondary">Inactive</span>}
                                            </td>
                                            <td>
                                                {relay.last_error ? (
                                                    <span className="badge bg-danger" title={relay.last_error}>
                                                        <i className="fas fa-triangle-exclamation me-1"></i>Error
                                                    </span>
                                                ) : relay.last_validated_at ? (
                                                    <span className="badge bg-success" title={new Date(relay.last_validated_at).toLocaleString()}>
                                                        <i className="fas fa-check me-1"></i>OK
                                                    </span>
                                                ) : (
                                                    <span className="badge bg-light text-dark border">Never tested</span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="d-flex gap-1">
                                                    <button className="btn btn-sm btn-outline-secondary" title="Test the API key"
                                                        disabled={busyId === relay.documentId} onClick={() => runTest(relay)}>
                                                        {busyId === relay.documentId
                                                            ? <span className="spinner-border spinner-border-sm"></span>
                                                            : <i className="fas fa-heartbeat"></i>}
                                                    </button>
                                                    <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => openEdit(relay)}>
                                                        <i className="fas fa-pen"></i>
                                                    </button>
                                                    <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => handleDelete(relay)}>
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                </PermissionCheck>
            </Layout>
        </ProtectedRoute>
    );
}
