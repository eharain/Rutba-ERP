import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { useToast } from "../../components/Toast";
import PLATFORMS, { PlatformBadge } from "../../components/PlatformBadge";
import FileView from "@rutba/pos-shared/components/FileView";
import Link from "next/link";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:4000";

const STATUS_BADGES = {
    draft: "bg-secondary",
    scheduled: "bg-warning text-dark",
    publishing: "bg-info",
    published: "bg-success",
    partially_published: "bg-warning",
    failed: "bg-danger",
};

const PLATFORM_COLORS = {
    instagram: "#E1306C",
    facebook: "#1877F2",
    x: "#000000",
    tiktok: "#010101",
    youtube: "#FF0000",
};

export default function PostDetailPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const router = useRouter();
    const { documentId } = router.query;

    const [post, setPost] = useState(null);
    const [isPublished, setIsPublished] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [platforms, setPlatforms] = useState([]);
    const [scheduledAt, setScheduledAt] = useState("");
    const [tagsText, setTagsText] = useState("");
    const [postStatus, setPostStatus] = useState("draft");

    const [coverId, setCoverId] = useState(null);
    const [videoIds, setVideoIds] = useState([]);

    const [selectedAccountIds, setSelectedAccountIds] = useState([]);
    const [selectedProductIds, setSelectedProductIds] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [replies, setReplies] = useState([]);
    const [connectedProducts, setConnectedProducts] = useState([]);

    const [productSearch, setProductSearch] = useState("");
    const [productResults, setProductResults] = useState([]);
    const [productLoading, setProductLoading] = useState(false);
    const loadPost = useCallback(async () => {
        if (!jwt || !documentId) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                authApi.get(`/social-posts/${documentId}`, {
                    status: 'draft',
                    populate: ['cover', 'video', 'social_accounts', 'social_replies', 'products'],
                }),
                authApi.get(`/social-posts/${documentId}`, { status: 'published', fields: ['documentId'] }).catch(() => ({ data: null })),
            ]);
            const p = draftRes.data || draftRes;
            setPost(p);
            setIsPublished(!!(pubRes.data));
            setTitle(p.title || "");
            setBody(p.body || "");
            setPlatforms(p.platforms || []);
            setScheduledAt(p.scheduled_at ? p.scheduled_at.slice(0, 16) : "");
            setTagsText((p.tags || []).join(", "));
            setPostStatus(p.post_status || "draft");
            setCoverId(p.cover?.id || null);
            setVideoIds((p.video || []).map(v => v.id));
            setSelectedAccountIds((p.social_accounts || []).map(a => a.id));
            setSelectedProductIds((p.products || []).map(pr => pr.documentId));
            setConnectedProducts(p.products || []);
            setReplies(p.social_replies || []);
        } catch (err) {
            console.error("Failed to load post", err);
            toast("Failed to load post.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, documentId]);

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

    useEffect(() => { loadPost(); loadAccounts(); }, [loadPost, loadAccounts]);

    const togglePlatform = (platform) => {
        setPlatforms(prev => prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]);
    };

    const toggleAccount = (accountId) => {
        setSelectedAccountIds(prev => prev.includes(accountId) ? prev.filter(id => id !== accountId) : [...prev, accountId]);
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
        setSelectedProductIds(prev => prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]);
    };

    const buildPayload = () => {
        const tags = tagsText ? tagsText.split(",").map(t => t.trim()).filter(Boolean) : [];
        const payload = {
            data: {
                title, body, platforms,
                scheduled_at: scheduledAt || null,
                post_status: scheduledAt && postStatus === "draft" ? "scheduled" : postStatus,
                tags,
                social_accounts: selectedAccountIds,
                products: { set: selectedProductIds },
            },
        };
        if (coverId) payload.data.cover = coverId;
        else payload.data.cover = null;
        if (videoIds.length > 0) payload.data.video = videoIds;
        else payload.data.video = null;
        return payload;
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await authApi.put(`/social-posts/${documentId}?status=draft`, buildPayload());
            toast("Draft saved!", "success");
            await loadPost();
        } catch (err) {
            console.error("Failed to save post", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        setSaving(true);
        try {
            await authApi.put(`/social-posts/${documentId}?status=draft`, buildPayload());
            await authApi.post(`/social-posts/${documentId}/publish`, {});
            setIsPublished(true);
            toast("Post saved & published!", "success");
            await loadPost();
        } catch (err) {
            console.error("Failed to publish post", err);
            toast("Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setSaving(true);
        try {
            await authApi.post(`/social-posts/${documentId}/unpublish`, {});
            setIsPublished(false);
            toast("Post unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish post", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDiscardDraft = async () => {
        if (!confirm("Load the published version into the editor?")) return;
        setSaving(true);
        try {
            await authApi.put(`/social-posts/${documentId}?status=draft`, buildPayload());
            const res = await authApi.get(`/social-posts/${documentId}`, {
                status: 'published',
                populate: ['cover', 'video', 'social_accounts', 'social_replies', 'products'],
            });
            const p = res.data || res;
            if (!p) { toast("No published version found.", "warning"); return; }
            setTitle(p.title || ""); setBody(p.body || "");
            setPlatforms(p.platforms || []);
            setScheduledAt(p.scheduled_at ? p.scheduled_at.slice(0, 16) : "");
            setTagsText((p.tags || []).join(", "));
            setPostStatus(p.post_status || "draft");
            setCoverId(p.cover?.id || null);
            setVideoIds((p.video || []).map(v => v.id));
            setSelectedAccountIds((p.social_accounts || []).map(a => a.id));
            setSelectedProductIds((p.products || []).map(pr => pr.documentId));
            setConnectedProducts(p.products || []);
            setReplies(p.social_replies || []);
            setPost(p);
            toast("Draft saved. Showing published version.", "success");
        } catch (err) {
            console.error("Failed to load published version", err);
            toast("Failed to load published version.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this post?")) return;
        try {
            await authApi.del(`/social-posts/${documentId}`);
            router.push("/posts");
        } catch (err) {
            console.error("Failed to delete post", err);
            toast("Failed to delete.", "danger");
        }
    };
    if (loading) {
        return (<ProtectedRoute><Layout><div className="text-center py-5"><div className="spinner-border"></div></div></Layout></ProtectedRoute>);
    }

    if (!post) {
        return (<ProtectedRoute><Layout><div className="alert alert-warning">Post not found.</div></Layout></ProtectedRoute>);
    }

    const sortedReplies = [...replies].sort((a, b) => {
        const da = a.replied_at || a.createdAt || "";
        const db = b.replied_at || b.createdAt || "";
        return db.localeCompare(da);
    });

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/posts">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Edit Post</h2>
                    {isPublished && <span className="badge bg-success ms-2 align-self-center">Published</span>}
                    {!isPublished && <span className="badge bg-secondary ms-2 align-self-center">Draft</span>}
                    <span className={`badge ${STATUS_BADGES[post.post_status] || "bg-secondary"} ms-2`}>
                        {(post.post_status || "draft").replace("_", " ")}
                    </span>
                    <div className="ms-auto d-flex gap-2">
                        <button className="btn btn-sm btn-outline-danger" onClick={handleDelete}><i className="fas fa-trash me-1"></i>Delete</button>
                        {isPublished && (
                            <button className="btn btn-sm btn-outline-secondary" onClick={handleUnpublish} disabled={saving}><i className="fas fa-eye-slash me-1"></i>Unpublish</button>
                        )}
                        {isPublished && (
                            <button className="btn btn-sm btn-outline-warning" onClick={handleDiscardDraft} disabled={saving}><i className="fas fa-undo me-1"></i>Load Published</button>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Draft"}</button>
                        <button className="btn btn-sm btn-success" onClick={handlePublish} disabled={saving}>
                            <i className="fas fa-upload me-1"></i>{saving ? "Publishing..." : "Save & Publish"}
                        </button>
                    </div>
                </div>

                <div className="row g-3">
                    <div className="col-md-8">
                        <div className="card mb-3">
                            <div className="card-body">
                                <div className="mb-3">
                                    <label className="form-label">Title</label>
                                    <input className="form-control" value={title} onChange={e => setTitle(e.target.value)} />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Body</label>
                                    <textarea className="form-control" value={body} onChange={e => setBody(e.target.value)} rows={6} />
                                    <div className="form-text">{(body || "").length} characters</div>
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Tags (comma-separated)</label>
                                    <input className="form-control" value={tagsText} onChange={e => setTagsText(e.target.value)} />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Schedule</label>
                                    <input className="form-control" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                                </div>
                            </div>
                        </div>

                        <div className="card mb-3">
                            <div className="card-header"><i className="fas fa-image me-2"></i>Cover Image</div>
                            <div className="card-body">
                                <FileView
                                    single={post.cover}
                                    refName="social-post"
                                    refId={post.id}
                                    field="cover"
                                    name={title}
                                    onFileChange={(f, file) => setCoverId(file?.id || null)}
                                />
                                <div className="form-text">Single image used as the post cover/thumbnail.</div>
                            </div>
                        </div>

                        <div className="card mb-3">
                            <div className="card-header"><i className="fas fa-video me-2"></i>Videos</div>
                            <div className="card-body">
                                <FileView
                                    gallery={post.video || []}
                                    multiple
                                    refName="social-post"
                                    refId={post.id}
                                    field="video"
                                    name={title}
                                    accept="video/*"
                                    buttonLabel="Upload Video"
                                    onFileChange={(f, files) => setVideoIds((files || []).map(v => v.id).filter(Boolean))}
                                />
                                <div className="form-text">Attach videos for the post.</div>
                            </div>
                        </div>
                        <div className="card mb-3">
                            <div className="card-header d-flex align-items-center">
                                <i className="fas fa-box me-2"></i><strong>Linked Products</strong>
                                <span className="badge bg-primary ms-2">{selectedProductIds.length}</span>
                            </div>
                            <div className="card-body">
                                {connectedProducts.length > 0 && (
                                    <div className="mb-3">
                                        <small className="text-muted d-block mb-1">Connected:</small>
                                        <div className="d-flex flex-wrap gap-2">
                                            {connectedProducts.map(p => {
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
                                                        <button type="button" className={`btn btn-sm ${selected ? "btn-success" : "btn-outline-secondary"}`} onClick={() => toggleProduct(p.documentId)}>
                                                            {selected && <i className="fas fa-check me-1"></i>}{p.name}
                                                        </button>
                                                        <a href={`${WEB_URL}/product/${p.documentId}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary" title="View on website">
                                                            <i className="fas fa-external-link-alt"></i>
                                                        </a>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <input className="form-control form-control-sm mb-2" placeholder="Search products by name..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                                {productLoading && <div className="spinner-border spinner-border-sm me-2"></div>}
                                {productResults.length > 0 && (
                                    <div className="d-flex flex-wrap gap-2">
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
                                                    <button type="button" className={`btn btn-sm ${selected ? "btn-success" : "btn-outline-secondary"}`} onClick={() => toggleProduct(p.documentId)}>
                                                        {selected && <i className="fas fa-check me-1"></i>}{p.name}
                                                    </button>
                                                    <a href={`${WEB_URL}/product/${p.documentId}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary" title="View on website">
                                                        <i className="fas fa-external-link-alt"></i>
                                                    </a>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                        {post.platform_results && Object.keys(post.platform_results).length > 0 && (
                            <div className="card mb-3">
                                <div className="card-header">Publish Results</div>
                                <div className="card-body">
                                    <table className="table table-sm mb-0">
                                        <thead><tr><th>Platform / Account</th><th>Status</th><th>Detail</th></tr></thead>
                                        <tbody>
                                            {Object.entries(post.platform_results).map(([key, val]) => (
                                                <tr key={key}>
                                                    <td><code>{key}</code></td>
                                                    <td><span className={`badge ${val.status === "success" ? "bg-success" : "bg-danger"}`}>{val.status}</span></td>
                                                    <td className="text-muted small">{val.error || ""}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="card mb-3">
                            <div className="card-header d-flex align-items-center justify-content-between">
                                <span><i className="fas fa-comments me-2"></i>Replies ({replies.length})</span>
                            </div>
                            <div className="card-body">
                                {sortedReplies.length === 0 ? (
                                    <p className="text-muted small mb-0">No replies yet.</p>
                                ) : (
                                    <div className="list-group list-group-flush">
                                        {sortedReplies.map(r => (
                                            <div key={r.id} className={`list-group-item px-0 ${r.is_outbound ? "border-start border-3 border-primary ps-3" : ""}`}>
                                                <div className="d-flex justify-content-between align-items-start">
                                                    <div className="d-flex align-items-center gap-2">
                                                        {r.author_avatar_url ? (
                                                            <img src={r.author_avatar_url} alt="" className="rounded-circle" style={{ width: 28, height: 28, objectFit: "cover" }} />
                                                        ) : (
                                                            <div className="rounded-circle bg-light d-flex align-items-center justify-content-center" style={{ width: 28, height: 28 }}>
                                                                <i className="fas fa-user text-muted" style={{ fontSize: 12 }}></i>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <PlatformBadge platform={r.platform} />
                                                            <strong className="ms-1">{r.author_name || r.author_handle || "Unknown"}</strong>
                                                            {r.author_handle && r.author_name && (
                                                                <span className="text-muted small ms-1">@{r.author_handle}</span>
                                                            )}
                                                            {r.is_outbound && <span className="badge bg-primary ms-1">Our Reply</span>}
                                                        </div>
                                                    </div>
                                                    <div className="d-flex align-items-center gap-2">
                                                        <small className="text-muted">
                                                            {r.replied_at ? new Date(r.replied_at).toLocaleString() : r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                                                        </small>
                                                        <span className="badge" style={{ backgroundColor: PLATFORM_COLORS[r.platform] || "#6c757d", color: "#fff", fontSize: 10 }}>
                                                            {r.platform}
                                                        </span>
                                                    </div>
                                                </div>
                                                <p className="mb-0 mt-1" style={{ whiteSpace: "pre-wrap" }}>{r.body}</p>
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
                                        <input className="form-check-input" type="checkbox" id={`platform-${key}`} checked={platforms.includes(key)} onChange={() => togglePlatform(key)} />
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
                                {accounts.filter(a => platforms.includes(a.platform)).map(a => (
                                    <div className="form-check mb-2" key={a.id}>
                                        <input className="form-check-input" type="checkbox" id={`acc-${a.id}`} checked={selectedAccountIds.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                                        <label className="form-check-label" htmlFor={`acc-${a.id}`}>
                                            {a.account_name} <span className="text-muted">({a.platform})</span>
                                        </label>
                                    </div>
                                ))}
                                {platforms.length > 0 && accounts.filter(a => platforms.includes(a.platform)).length === 0 && (
                                    <p className="text-muted small mb-0">No accounts match selected platforms.</p>
                                )}
                                {(!platforms || platforms.length === 0) && (
                                    <p className="text-muted small mb-0">Select platforms first.</p>
                                )}
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header">Info</div>
                            <div className="card-body small text-muted">
                                <p className="mb-1"><strong>Created:</strong> {post.createdAt ? new Date(post.createdAt).toLocaleString() : ""}</p>
                                <p className="mb-1"><strong>Updated:</strong> {post.updatedAt ? new Date(post.updatedAt).toLocaleString() : ""}</p>
                                {post.published_at_social && (
                                    <p className="mb-1"><strong>Social Published:</strong> {new Date(post.published_at_social).toLocaleString()}</p>
                                )}
                                <p className="mb-0"><strong>CMS Status:</strong> {isPublished ? "Published" : "Draft"}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}