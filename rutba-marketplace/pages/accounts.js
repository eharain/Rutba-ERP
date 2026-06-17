import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MarketplaceAccountsEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";
import { appPost } from "../components/appClient";

const REGIONS = ["pk", "bd", "lk", "np", "mm"];

const EMPTY_FORM = {
    platform: "daraz",
    account_name: "",
    region: "pk",
    seller_id: "",
    // Per-account credentials. Each marketplace provides keys its own way
    // (OAuth app key/secret, static API key, long-lived token); the adapter
    // prefers these over the app-level env defaults. Stored `private`, so they
    // never read back — blank on edit means "keep existing".
    api_key: "",
    api_secret: "",
    access_token: "",
    refresh_token: "",
    is_active: true,
    sync_orders_enabled: true,
    sync_inventory_enabled: true,
};

const CRED_FIELDS = ["api_key", "api_secret", "access_token", "refresh_token"];

export default function AccountsPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);

    const loadAccounts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await MarketplaceAccountsEndpoints.list({ sort: ["createdAt:desc"] });
            setAccounts(res.data || []);
        } catch (err) {
            console.error("Failed to load accounts", err);
            toast("Failed to load accounts.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    // OAuth popup-closer postMessage (callback served from this app's origin).
    useEffect(() => {
        const onMessage = (e) => {
            if (e.origin !== window.location.origin) return;
            const d = e.data;
            if (!d || d.source !== "rutba-marketplace-oauth") return;
            if (d.ok) { toast(`Connected ${d.message || ""}`.trim(), "success"); loadAccounts(); }
            else { toast(d.message || "Connection failed.", "danger"); }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [loadAccounts]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    };

    const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); };
    const openEdit = (acc) => {
        setEditing(acc);
        setForm({
            platform: acc.platform || "daraz",
            account_name: acc.account_name || "",
            region: acc.region || "pk",
            seller_id: acc.seller_id || "",
            api_key: "", api_secret: "", access_token: "", refresh_token: "",
            is_active: acc.is_active !== false,
            sync_orders_enabled: acc.sync_orders_enabled !== false,
            sync_inventory_enabled: acc.sync_inventory_enabled !== false,
        });
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Don't send blank credential fields — that would wipe stored secrets
            // on an edit (they never read back, so the form shows them blank).
            const data = { ...form };
            for (const k of CRED_FIELDS) { if (!data[k]) delete data[k]; }
            const payload = { data };
            if (editing) {
                await MarketplaceAccountsEndpoints.update(editing.documentId, payload);
                toast("Account updated.", "success");
            } else {
                await MarketplaceAccountsEndpoints.create(payload);
                toast("Account created. Click Connect to authorize via OAuth.", "success");
            }
            setShowForm(false); setEditing(null); setForm({ ...EMPTY_FORM });
            await loadAccounts();
        } catch (err) {
            console.error("Failed to save account", err);
            toast(err?.response?.data?.error?.message || "Failed to save account (admin role required).", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (acc) => {
        if (!confirm(`Delete account "${acc.account_name}"?`)) return;
        try {
            await MarketplaceAccountsEndpoints.del(acc.documentId);
            toast("Account deleted.", "success");
            await loadAccounts();
        } catch (err) {
            toast("Failed to delete account.", "danger");
        }
    };

    const runAction = async (acc, path, label, openPopup) => {
        setBusyId(acc.documentId + path);
        try {
            const res = await appPost(`/api/accounts/${acc.documentId}${path}`, jwt);
            if (openPopup) {
                const url = res?.url;
                if (!url) { toast("No connect URL returned — is DARAZ_APP_KEY configured?", "warning"); return; }
                const w = 640, h = 760;
                const left = window.screenX + (window.outerWidth - w) / 2;
                const top = window.screenY + (window.outerHeight - h) / 2;
                const popup = window.open(url, "rutba-marketplace-oauth", `width=${w},height=${h},left=${left},top=${top}`);
                if (!popup) toast("Popup blocked — allow popups, then click Connect again.", "warning");
                return;
            }
            const summary = res?.status
                ? `${label}: ${res.created || 0} created, ${res.updated || 0} updated, ${res.failed || 0} failed`
                : (res?.ok ? `${label}: OK` : `${label} done`);
            toast(summary, res?.failed > 0 ? "warning" : "success");
            await loadAccounts();
        } catch (err) {
            toast(`${label} failed: ${err.message}`, "danger");
        } finally {
            setBusyId(null);
        }
    };

    const busy = (acc, path) => busyId === acc.documentId + path;

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-plug me-2"></i>Marketplace Accounts</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreate}>
                        <i className="fas fa-plus me-1"></i>Add Account
                    </button>
                </div>

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-body">
                            <h5>{editing ? "Edit Account" : "New Account"}</h5>
                            <form onSubmit={handleSubmit}>
                                <div className="row g-3">
                                    <div className="col-md-3">
                                        <label className="form-label">Platform</label>
                                        <select className="form-select" name="platform" value={form.platform} onChange={handleChange}>
                                            <option value="daraz">Daraz</option>
                                        </select>
                                    </div>
                                    <div className="col-md-5">
                                        <label className="form-label">Account Name</label>
                                        <input className="form-control" name="account_name" value={form.account_name} onChange={handleChange} required />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">Region</label>
                                        <select className="form-select" name="region" value={form.region} onChange={handleChange}>
                                            {REGIONS.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">Seller ID</label>
                                        <input className="form-control" name="seller_id" value={form.seller_id} onChange={handleChange} placeholder="Optional" />
                                    </div>
                                    <div className="col-12">
                                        <hr className="my-1" />
                                        <small className="text-muted">Credentials — optional. Daraz uses a server-level app key/secret + Connect (OAuth); enter here only for a per-account override. Blank on edit keeps the stored value.</small>
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">App Key / API Key</label>
                                        <input className="form-control" name="api_key" value={form.api_key} onChange={handleChange} type="password" autoComplete="off" />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">App Secret / API Secret</label>
                                        <input className="form-control" name="api_secret" value={form.api_secret} onChange={handleChange} type="password" autoComplete="off" />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Access Token</label>
                                        <input className="form-control" name="access_token" value={form.access_token} onChange={handleChange} type="password" autoComplete="off" placeholder="usually obtained via Connect" />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Refresh Token</label>
                                        <input className="form-control" name="refresh_token" value={form.refresh_token} onChange={handleChange} type="password" autoComplete="off" />
                                    </div>
                                    <div className="col-12 d-flex gap-4">
                                        <div className="form-check">
                                            <input className="form-check-input" type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} id="isActive" />
                                            <label className="form-check-label" htmlFor="isActive">Active</label>
                                        </div>
                                        <div className="form-check">
                                            <input className="form-check-input" type="checkbox" name="sync_orders_enabled" checked={form.sync_orders_enabled} onChange={handleChange} id="syncOrders" />
                                            <label className="form-check-label" htmlFor="syncOrders">Auto-sync orders</label>
                                        </div>
                                        <div className="form-check">
                                            <input className="form-check-input" type="checkbox" name="sync_inventory_enabled" checked={form.sync_inventory_enabled} onChange={handleChange} id="syncInv" />
                                            <label className="form-check-label" htmlFor="syncInv">Auto-sync inventory</label>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 d-flex gap-2">
                                    <button className="btn btn-success btn-sm" type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
                                </div>
                                <p className="text-muted small mt-2 mb-0">App credentials (Daraz app key/secret) are set on the server via env; per-account OAuth tokens are obtained with Connect.</p>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : accounts.length === 0 ? (
                    <div className="alert alert-info">No marketplace accounts yet. Click "Add Account", then Connect to authorize via OAuth.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Platform</th><th>Account</th><th>Region</th><th>Status</th>
                                    <th>Connection</th><th>Last Orders Sync</th><th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((acc) => (
                                    <tr key={acc.id}>
                                        <td><span className="badge bg-warning text-dark text-capitalize">{acc.platform}</span></td>
                                        <td>{acc.account_name}{acc.seller_id ? <div className="text-muted small">seller {acc.seller_id}</div> : null}</td>
                                        <td><code>{(acc.region || "—").toUpperCase()}</code></td>
                                        <td>{acc.is_active ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Inactive</span>}</td>
                                        <td>{acc.last_connected_at
                                            ? <span className="badge bg-success" title={new Date(acc.last_connected_at).toLocaleString()}><i className="fas fa-link me-1"></i>Connected</span>
                                            : <span className="badge bg-light text-dark border"><i className="fas fa-unlink me-1"></i>Not connected</span>}</td>
                                        <td className="small">{acc.last_orders_synced_at ? new Date(acc.last_orders_synced_at).toLocaleString() : "—"}</td>
                                        <td>
                                            <div className="d-flex gap-1 flex-wrap">
                                                <button className="btn btn-sm btn-outline-success" title="Connect via OAuth" disabled={busy(acc, "/connect-url")} onClick={() => runAction(acc, "/connect-url", "Connect", true)}>
                                                    {busy(acc, "/connect-url") ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-plug me-1"></i>Connect</>}
                                                </button>
                                                <button className="btn btn-sm btn-outline-secondary" title="Test connection" disabled={busy(acc, "/validate")} onClick={() => runAction(acc, "/validate", "Validate")}>
                                                    <i className="fas fa-heartbeat"></i>
                                                </button>
                                                <button className="btn btn-sm btn-outline-info" title="Sync orders now" disabled={busy(acc, "/sync-orders")} onClick={() => runAction(acc, "/sync-orders", "Order sync")}>
                                                    {busy(acc, "/sync-orders") ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-download me-1"></i>Orders</>}
                                                </button>
                                                <button className="btn btn-sm btn-outline-info" title="Push inventory now" disabled={busy(acc, "/sync-inventory")} onClick={() => runAction(acc, "/sync-inventory", "Inventory sync")}>
                                                    {busy(acc, "/sync-inventory") ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-upload me-1"></i>Stock</>}
                                                </button>
                                                <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => openEdit(acc)}><i className="fas fa-pen"></i></button>
                                                <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => handleDelete(acc)}><i className="fas fa-trash"></i></button>
                                            </div>
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
