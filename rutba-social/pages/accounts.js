import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useToast } from "../components/Toast";
import PLATFORMS, { PlatformBadge } from "../components/PlatformBadge";

const EMPTY_FORM = {
    platform: "instagram",
    account_name: "",
    api_key: "",
    api_secret: "",
    access_token: "",
    refresh_token: "",
    page_id: "",
    is_active: true,
};

export default function AccountsPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);

    const loadAccounts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await authApi.get('/social-accounts', { sort: ['createdAt:desc'] });
            setAccounts(res.data || []);
        } catch (err) {
            console.error("Failed to load accounts", err);
            toast("Failed to load accounts.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    };

    const openCreate = () => {
        setEditing(null);
        setForm({ ...EMPTY_FORM });
        setShowForm(true);
    };

    const openEdit = (account) => {
        setEditing(account);
        setForm({
            platform: account.platform || "instagram",
            account_name: account.account_name || "",
            api_key: account.api_key || "",
            api_secret: account.api_secret || "",
            access_token: account.access_token || "",
            refresh_token: account.refresh_token || "",
            page_id: account.page_id || "",
            is_active: account.is_active !== false,
        });
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = { data: { ...form } };
            if (editing) {
                await authApi.put(`/social-accounts/${editing.documentId}`, payload);
                toast("Account updated.", "success");
            } else {
                await authApi.post("/social-accounts", payload);
                toast("Account created.", "success");
            }
            setShowForm(false);
            setEditing(null);
            setForm({ ...EMPTY_FORM });
            await loadAccounts();
        } catch (err) {
            console.error("Failed to save account", err);
            toast("Failed to save account.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (account) => {
        if (!confirm(`Delete account "${account.account_name}"?`)) return;
        try {
            await authApi.del(`/social-accounts/${account.documentId}`);
            toast("Account deleted.", "success");
            await loadAccounts();
        } catch (err) {
            console.error("Failed to delete account", err);
            toast("Failed to delete account.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-key me-2"></i>Social Accounts</h3>
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
                                    <div className="col-md-4">
                                        <label className="form-label">Platform</label>
                                        <select className="form-select" name="platform" value={form.platform} onChange={handleChange}>
                                            {Object.entries(PLATFORMS).map(([key, p]) => (
                                                <option key={key} value={key}>{p.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Account Name</label>
                                        <input className="form-control" name="account_name" value={form.account_name} onChange={handleChange} required />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Page / Channel ID</label>
                                        <input className="form-control" name="page_id" value={form.page_id} onChange={handleChange} placeholder="Optional" />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">API Key / Client ID</label>
                                        <input className="form-control" name="api_key" value={form.api_key} onChange={handleChange} type="password" autoComplete="off" />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">API Secret / Client Secret</label>
                                        <input className="form-control" name="api_secret" value={form.api_secret} onChange={handleChange} type="password" autoComplete="off" />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Access Token</label>
                                        <input className="form-control" name="access_token" value={form.access_token} onChange={handleChange} type="password" autoComplete="off" />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Refresh Token</label>
                                        <input className="form-control" name="refresh_token" value={form.refresh_token} onChange={handleChange} type="password" autoComplete="off" />
                                    </div>
                                    <div className="col-12">
                                        <div className="form-check">
                                            <input className="form-check-input" type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} id="isActive" />
                                            <label className="form-check-label" htmlFor="isActive">Active</label>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 d-flex gap-2">
                                    <button className="btn btn-success btn-sm" type="submit" disabled={saving}>
                                        {saving ? "Saving..." : "Save"}
                                    </button>
                                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : accounts.length === 0 ? (
                    <div className="alert alert-info">No social accounts configured yet. Click "Add Account" to connect a platform.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Platform</th>
                                    <th>Account Name</th>
                                    <th>Page / Channel ID</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((acc) => (
                                    <tr key={acc.id}>
                                        <td><PlatformBadge platform={acc.platform} /></td>
                                        <td>{acc.account_name}</td>
                                        <td><code>{acc.page_id || "—"}</code></td>
                                        <td>
                                            {acc.is_active
                                                ? <span className="badge bg-success">Active</span>
                                                : <span className="badge bg-secondary">Inactive</span>}
                                        </td>
                                        <td>
                                            <button className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(acc)}>
                                                <i className="fas fa-pen"></i>
                                            </button>
                                            <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(acc)}>
                                                <i className="fas fa-trash"></i>
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
