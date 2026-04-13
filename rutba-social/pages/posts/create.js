import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { useToast } from "../../components/Toast";
import PLATFORMS from "../../components/PlatformBadge";
import FileView from "@rutba/pos-shared/components/FileView";
import Link from "next/link";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:4000";

export default function CreatePostPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const router = useRouter();

    const [accounts, setAccounts] = useState([]);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [platforms, setPlatforms] = useState([]);
    const [scheduledAt, setScheduledAt] = useState("");
    const [tagsText, setTagsText] = useState("");
    const [selectedAccountIds, setSelectedAccountIds] = useState([]);
    const [coverId, setCoverId] = useState(null);
    const [videoIds, setVideoIds] = useState([]);
    const [saving, setSaving] = useState(false);

    // Product picker
    const [selectedProductIds, setSelectedProductIds] = useState([]);
    const [productSearch, setProductSearch] = useState("");
    const [productResults, setProductResults] = useState([]);
    const [productLoading, setProductLoading] = useState(false);

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

    const togglePlatform = (platform) => {
        setPlatforms(prev =>
            prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
        );
    };

    const toggleAccount = (accountId) => {
        setSelectedAccountIds(prev =>
            prev.includes(accountId) ? prev.filter(id => id !== accountId) : [...prev, accountId]
        );
    };

    const searchProducts = useCallback(async () => {
        if (!jwt || !productSearch.trim()) { setProductResults([]); return; }
        setProductLoading(true);
        try {
            const res = await authApi.get('/products', {
                status: 'draft',
                filters: { name: { $containsi: productSearch.trim() } },
                fields: ['name', 'sku', 'documentId'],
                populate: ['logo'],
                pagination: { pageSize: 20 },
                sort: ['name:asc'],
            });
            setProductResults(res.data || []);
        } catch (err) {
            console.error("Failed to search products", err);
        } finally {
            setProductLoading(false);
        }
    }, [jwt, productSearch]);

    useEffect(() => {
        const timer = setTimeout(searchProducts, 400);
        return () => clearTimeout(timer);
    }, [searchProducts]);

    const toggleProduct = (docId) => {
        setSelectedProductIds(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (platforms.length === 0) {
            toast("Select at least one platform.", "warning");
            return;
        }
        setSaving(true);
        try {
            const tags = tagsText ? tagsText.split(",").map(t => t.trim()).filter(Boolean) : [];
            const payload = {
                data: {
                    title,
                    body,
                    platforms,
                    scheduled_at: scheduledAt || null,
                    post_status: scheduledAt ? "scheduled" : "draft",
                    tags,
                    social_accounts: selectedAccountIds,
                    products: { set: selectedProductIds },
                },
            };
            if (coverId) payload.data.cover = coverId;
            if (videoIds.length > 0) payload.data.video = videoIds;
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
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/posts">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h3 className="mb-0"><i className="fas fa-plus me-2"></i>New Post</h3>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="row g-3">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Title</label>
                                        <input className="form-control" value={title} onChange={e => setTitle(e.target.value)} required />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Body</label>
                                        <textarea className="form-control" value={body} onChange={e => setBody(e.target.value)} rows={6} required />
                                        <div className="form-text">{(body || "").length} characters</div>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Tags (comma-separated)</label>
                                        <input className="form-control" value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="e.g. sale, new-arrival, promo" />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Schedule (optional)</label>
                                        <input className="form-control" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Cover Image */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-image me-2"></i>Cover Image</div>
                                <div className="card-body">
                                    <FileView
                                        single={null}
                                        field="cover"
                                        name={title}
                                        autoUpload={false}
                                        onFileChange={(f, file) => setCoverId(file?.id || null)}
                                    />
                                    <div className="form-text">Single image used as the post cover/thumbnail.</div>
                                </div>
                            </div>

                            {/* Video */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-video me-2"></i>Videos</div>
                                <div className="card-body">
                                    <FileView
                                        gallery={[]}
                                        multiple
                                        field="video"
                                        name={title}
                                        autoUpload={false}
                                        accept="video/*"
                                        buttonLabel="Upload Video"
                                        onFileChange={(f, files) => setVideoIds((files || []).map(v => v.id).filter(Boolean))}
                                    />
                                    <div className="form-text">Attach videos for the post.</div>
                                </div>
                            </div>

                            {/* Product Linker */}
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-box me-2"></i>
                                    <strong>Linked Products</strong>
                                    <span className="badge bg-primary ms-2">{selectedProductIds.length}</span>
                                </div>
                                <div className="card-body">
                                    <input
                                        className="form-control form-control-sm mb-2"
                                        placeholder="Search products by name..."
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                    />
                                    {productLoading && <div className="spinner-border spinner-border-sm me-2"></div>}
                                    {productResults.length > 0 && (
                                        <div className="d-flex flex-wrap gap-2 mb-2">
                                            {productResults.map(p => {
                                                const selected = selectedProductIds.includes(p.documentId);
                                                return (
                                                    <div key={p.documentId} className="d-inline-flex align-items-center gap-1">
                                                        {p.logo?.url ? (
                                                            <img src={StraipImageUrl(p.logo)} alt={p.name} style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />
                                                        ) : (
                                                            <span className="text-muted" style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                                                <i className="fas fa-image"></i>
                                                            </span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className={`btn btn-sm ${selected ? "btn-success" : "btn-outline-secondary"}`}
                                                            onClick={() => toggleProduct(p.documentId)}
                                                        >
                                                            {selected && <i className="fas fa-check me-1"></i>}
                                                            {p.name}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {selectedProductIds.length > 0 && (
                                        <div className="mt-2">
                                            <small className="text-muted">Selected: {selectedProductIds.length} product(s)</small>
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
                                                checked={platforms.includes(key)}
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
                                            .filter(a => platforms.includes(a.platform))
                                            .map(a => (
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
                                    {platforms.length > 0 && accounts.filter(a => platforms.includes(a.platform)).length === 0 && (
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
