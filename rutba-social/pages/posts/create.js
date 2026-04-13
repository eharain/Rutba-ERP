import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { useToast } from "../../components/Toast";
import PLATFORMS from "../../components/PlatformBadge";

export default function CreatePostPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const router = useRouter();
    const fileInputRef = useRef();

    const [accounts, setAccounts] = useState([]);
    const [form, setForm] = useState({
        title: "",
        body: "",
        platforms: [],
        scheduled_at: "",
        tags: "",
    });
    const [selectedAccountIds, setSelectedAccountIds] = useState([]);
    const [mediaFiles, setMediaFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    const loadAccounts = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await authApi.get('/social-accounts', {
                filters: { is_active: { $eq: true } },
                sort: ['platform:asc'],
            });
            setAccounts(res.data || []);
        } catch (err) {
            console.error("Failed to load accounts", err);
        }
    }, [jwt]);

    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const togglePlatform = (platform) => {
        setForm((prev) => {
            const platforms = prev.platforms.includes(platform)
                ? prev.platforms.filter((p) => p !== platform)
                : [...prev.platforms, platform];
            return { ...prev, platforms };
        });
    };

    const toggleAccount = (accountId) => {
        setSelectedAccountIds((prev) =>
            prev.includes(accountId)
                ? prev.filter((id) => id !== accountId)
                : [...prev, accountId]
        );
    };

    const handleFileUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            const fd = new FormData();
            for (const file of files) {
                fd.append("files", file);
            }
            const res = await authApi.post("/upload", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            const uploaded = res.data || [];
            setMediaFiles((prev) => [...prev, ...uploaded]);
            toast(`Uploaded ${uploaded.length} file(s).`, "success");
        } catch (err) {
            console.error("Upload failed", err);
            toast("Upload failed.", "danger");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const removeMedia = (id) => {
        setMediaFiles((prev) => prev.filter((f) => f.id !== id));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.platforms.length === 0) {
            toast("Select at least one platform.", "warning");
            return;
        }
        setSaving(true);
        try {
            const tags = form.tags
                ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
                : [];
            const payload = {
                data: {
                    title: form.title,
                    body: form.body,
                    platforms: form.platforms,
                    scheduled_at: form.scheduled_at || null,
                    post_status: form.scheduled_at ? "scheduled" : "draft",
                    tags,
                    media: mediaFiles.map((f) => f.id),
                    social_accounts: selectedAccountIds,
                },
            };
            const res = await authApi.post("/social-posts", payload);
            toast("Post created!", "success");
            router.push(`/posts/${res.data?.documentId}`);
        } catch (err) {
            console.error("Failed to create post", err);
            toast("Failed to create post.", "danger");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <h3 className="mb-3"><i className="fas fa-plus me-2"></i>New Post</h3>

                <form onSubmit={handleSubmit}>
                    <div className="row g-3">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Title</label>
                                        <input className="form-control" name="title" value={form.title} onChange={handleChange} required />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Body</label>
                                        <textarea className="form-control" name="body" value={form.body} onChange={handleChange} rows={6} required />
                                        <div className="form-text">{(form.body || "").length} characters</div>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Tags (comma-separated)</label>
                                        <input className="form-control" name="tags" value={form.tags} onChange={handleChange} placeholder="e.g. sale, new-arrival, promo" />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Schedule (optional)</label>
                                        <input className="form-control" type="datetime-local" name="scheduled_at" value={form.scheduled_at} onChange={handleChange} />
                                    </div>
                                </div>
                            </div>

                            <div className="card mb-3">
                                <div className="card-header">Media</div>
                                <div className="card-body">
                                    <input type="file" ref={fileInputRef} className="form-control form-control-sm mb-2" multiple accept="image/*,video/*" onChange={handleFileUpload} />
                                    {uploading && <div className="spinner-border spinner-border-sm me-2"></div>}
                                    {mediaFiles.length > 0 && (
                                        <div className="d-flex flex-wrap gap-2 mt-2">
                                            {mediaFiles.map((f) => (
                                                <div key={f.id} className="position-relative" style={{ width: 80, height: 80 }}>
                                                    {f.mime?.startsWith("image/") ? (
                                                        <img src={StraipImageUrl(f)} alt={f.name} className="rounded" style={{ width: 80, height: 80, objectFit: "cover" }} />
                                                    ) : (
                                                        <div className="bg-dark text-white rounded d-flex align-items-center justify-content-center" style={{ width: 80, height: 80 }}>
                                                            <i className="fas fa-video"></i>
                                                        </div>
                                                    )}
                                                    <button type="button" className="btn btn-sm btn-danger position-absolute top-0 end-0" style={{ padding: "0 4px", fontSize: 10 }} onClick={() => removeMedia(f.id)}>×</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="col-md-4">
                            <div className="card mb-3">
                                <div className="card-header">Platforms</div>
                                <div className="card-body">
                                    {Object.entries(PLATFORMS).map(([key, p]) => (
                                        <div className="form-check mb-2" key={key}>
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id={`platform-${key}`}
                                                checked={form.platforms.includes(key)}
                                                onChange={() => togglePlatform(key)}
                                            />
                                            <label className="form-check-label" htmlFor={`platform-${key}`}>
                                                <i className={`${p.icon} me-1`} style={{ color: p.color }}></i>{p.label}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="card mb-3">
                                <div className="card-header">Linked Accounts</div>
                                <div className="card-body">
                                    {accounts.length === 0 ? (
                                        <p className="text-muted small mb-0">No active accounts. <a href="/accounts">Configure accounts</a>.</p>
                                    ) : (
                                        accounts
                                            .filter((a) => form.platforms.includes(a.platform))
                                            .map((a) => (
                                                <div className="form-check mb-2" key={a.id}>
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        id={`acc-${a.id}`}
                                                        checked={selectedAccountIds.includes(a.id)}
                                                        onChange={() => toggleAccount(a.id)}
                                                    />
                                                    <label className="form-check-label" htmlFor={`acc-${a.id}`}>
                                                        {a.account_name} <span className="text-muted">({a.platform})</span>
                                                    </label>
                                                </div>
                                            ))
                                    )}
                                    {form.platforms.length > 0 && accounts.filter((a) => form.platforms.includes(a.platform)).length === 0 && (
                                        <p className="text-muted small mb-0">No accounts match selected platforms.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="d-flex gap-2 mt-3">
                        <button className="btn btn-success" type="submit" disabled={saving}>
                            {saving ? "Saving..." : "Create Post"}
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => router.push("/posts")}>
                            Cancel
                        </button>
                    </div>
                </form>
            </Layout>
        </ProtectedRoute>
    );
}
