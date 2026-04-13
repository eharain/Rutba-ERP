import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { useToast } from "../../components/Toast";
import PLATFORMS, { PlatformBadge } from "../../components/PlatformBadge";
import Link from "next/link";

const STATUS_BADGES = {
    draft: "bg-secondary",
    scheduled: "bg-warning text-dark",
    publishing: "bg-info",
    published: "bg-success",
    partially_published: "bg-warning",
    failed: "bg-danger",
};

export default function PostDetailPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const router = useRouter();
    const { documentId } = router.query;
    const fileInputRef = useRef();

    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [mediaFiles, setMediaFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState([]);
    const [replies, setReplies] = useState([]);

    const loadPost = useCallback(async () => {
        if (!jwt || !documentId) return;
        setLoading(true);
        try {
            const res = await authApi.get(`/social-posts/${documentId}`, {
                status: 'draft',
                populate: ['media', 'social_accounts', 'social_replies'],
            });
            const data = res.data;
            setPost(data);
            setMediaFiles(data?.media || []);
            setSelectedAccountIds((data?.social_accounts || []).map((a) => a.id));
            setReplies(data?.social_replies || []);
            setForm({
                title: data?.title || "",
                body: data?.body || "",
                platforms: data?.platforms || [],
                scheduled_at: data?.scheduled_at ? data.scheduled_at.slice(0, 16) : "",
                tags: (data?.tags || []).join(", "),
            });
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
            prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
        );
    };

    const handleFileUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            const fd = new FormData();
            for (const file of files) fd.append("files", file);
            const res = await authApi.post("/upload", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setMediaFiles((prev) => [...prev, ...(res.data || [])]);
            toast(`Uploaded ${(res.data || []).length} file(s).`, "success");
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

    const handleSave = async () => {
        setSaving(true);
        try {
            const tags = form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
            await authApi.put(`/social-posts/${documentId}`, {
                data: {
                    title: form.title,
                    body: form.body,
                    platforms: form.platforms,
                    scheduled_at: form.scheduled_at || null,
                    post_status: form.scheduled_at ? "scheduled" : (post?.post_status || "draft"),
                    tags,
                    media: mediaFiles.map((f) => f.id),
                    social_accounts: selectedAccountIds,
                },
            });
            toast("Post saved.", "success");
            setEditing(false);
            await loadPost();
        } catch (err) {
            console.error("Failed to save post", err);
            toast("Failed to save post.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        if (!confirm("Publish this post to the selected platforms now?")) return;
        setPublishing(true);
        try {
            // Save first to ensure latest data
            const tags = form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
            await authApi.put(`/social-posts/${documentId}`, {
                data: {
                    title: form.title,
                    body: form.body,
                    platforms: form.platforms,
                    tags,
                    media: mediaFiles.map((f) => f.id),
                    social_accounts: selectedAccountIds,
                    post_status: "publishing",
                    published_at_social: new Date().toISOString(),
                },
            });

            // Trigger publish to each platform
            const results = {};
            for (const platform of (form.platforms || [])) {
                const platformAccounts = accounts.filter(
                    (a) => a.platform === platform && selectedAccountIds.includes(a.id)
                );
                for (const account of platformAccounts) {
                    try {
                        await authApi.post(`/social-posts/${documentId}/publish`, {
                            platform,
                            account_id: account.id,
                        });
                        results[`${platform}_${account.id}`] = { status: "success" };
                    } catch (err) {
                        results[`${platform}_${account.id}`] = {
                            status: "failed",
                            error: err?.response?.data?.error?.message || err.message,
                        };
                    }
                }
            }

            const allSuccess = Object.values(results).every((r) => r.status === "success");
            const allFailed = Object.values(results).every((r) => r.status === "failed");
            const finalStatus = allSuccess ? "published" : allFailed ? "failed" : "partially_published";

            await authApi.put(`/social-posts/${documentId}`, {
                data: {
                    post_status: finalStatus,
                    platform_results: results,
                },
            });

            toast(
                finalStatus === "published"
                    ? "Published successfully!"
                    : finalStatus === "failed"
                        ? "Publishing failed on all platforms."
                        : "Published partially — some platforms failed.",
                finalStatus === "published" ? "success" : "warning"
            );
            setEditing(false);
            await loadPost();
        } catch (err) {
            console.error("Publish failed", err);
            toast("Publishing failed.", "danger");
        } finally {
            setPublishing(false);
        }
    };

    if (loading) {
        return (
            <ProtectedRoute>
                <Layout>
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                </Layout>
            </ProtectedRoute>
        );
    }

    if (!post) {
        return (
            <ProtectedRoute>
                <Layout>
                    <div className="alert alert-warning">Post not found.</div>
                </Layout>
            </ProtectedRoute>
        );
    }

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />

                <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <Link href="/posts" className="text-decoration-none me-2">← Posts</Link>
                        <span className={`badge ${STATUS_BADGES[post.post_status] || "bg-secondary"} ms-2`}>
                            {(post.post_status || "draft").replace("_", " ")}
                        </span>
                    </div>
                    <div className="d-flex gap-2">
                        {!editing && (
                            <button className="btn btn-outline-primary btn-sm" onClick={() => setEditing(true)}>
                                <i className="fas fa-pen me-1"></i>Edit
                            </button>
                        )}
                        <button
                            className="btn btn-success btn-sm"
                            onClick={handlePublish}
                            disabled={publishing || form.platforms.length === 0}
                        >
                            {publishing ? (
                                <><span className="spinner-border spinner-border-sm me-1"></span>Publishing...</>
                            ) : (
                                <><i className="fas fa-share me-1"></i>Publish Now</>
                            )}
                        </button>
                    </div>
                </div>

                <div className="row g-3">
                    <div className="col-md-8">
                        <div className="card mb-3">
                            <div className="card-body">
                                {editing ? (
                                    <>
                                        <div className="mb-3">
                                            <label className="form-label">Title</label>
                                            <input className="form-control" name="title" value={form.title} onChange={handleChange} />
                                        </div>
                                        <div className="mb-3">
                                            <label className="form-label">Body</label>
                                            <textarea className="form-control" name="body" value={form.body} onChange={handleChange} rows={6} />
                                            <div className="form-text">{(form.body || "").length} characters</div>
                                        </div>
                                        <div className="mb-3">
                                            <label className="form-label">Tags</label>
                                            <input className="form-control" name="tags" value={form.tags} onChange={handleChange} />
                                        </div>
                                        <div className="mb-3">
                                            <label className="form-label">Schedule</label>
                                            <input className="form-control" type="datetime-local" name="scheduled_at" value={form.scheduled_at} onChange={handleChange} />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <h4>{post.title}</h4>
                                        <p style={{ whiteSpace: "pre-wrap" }}>{post.body}</p>
                                        {post.tags && post.tags.length > 0 && (
                                            <div className="mb-2">
                                                {post.tags.map((t, i) => (
                                                    <span key={i} className="badge bg-light text-dark me-1">#{t}</span>
                                                ))}
                                            </div>
                                        )}
                                        {post.scheduled_at && (
                                            <p className="text-muted small">
                                                <i className="fas fa-clock me-1"></i>Scheduled: {new Date(post.scheduled_at).toLocaleString()}
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Media */}
                        <div className="card mb-3">
                            <div className="card-header">Media</div>
                            <div className="card-body">
                                {editing && (
                                    <>
                                        <input type="file" ref={fileInputRef} className="form-control form-control-sm mb-2" multiple accept="image/*,video/*" onChange={handleFileUpload} />
                                        {uploading && <div className="spinner-border spinner-border-sm me-2"></div>}
                                    </>
                                )}
                                {mediaFiles.length > 0 ? (
                                    <div className="d-flex flex-wrap gap-2 mt-2">
                                        {mediaFiles.map((f) => (
                                            <div key={f.id} className="position-relative" style={{ width: 100, height: 100 }}>
                                                {f.mime?.startsWith("image/") ? (
                                                    <img src={StraipImageUrl(f)} alt={f.name} className="rounded" style={{ width: 100, height: 100, objectFit: "cover" }} />
                                                ) : (
                                                    <div className="bg-dark text-white rounded d-flex align-items-center justify-content-center" style={{ width: 100, height: 100 }}>
                                                        <i className="fas fa-video fa-2x"></i>
                                                    </div>
                                                )}
                                                {editing && (
                                                    <button type="button" className="btn btn-sm btn-danger position-absolute top-0 end-0" style={{ padding: "0 5px", fontSize: 11 }} onClick={() => removeMedia(f.id)}>×</button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-muted small mb-0">No media attached.</p>
                                )}
                            </div>
                        </div>

                        {/* Platform Results */}
                        {post.platform_results && Object.keys(post.platform_results).length > 0 && (
                            <div className="card mb-3">
                                <div className="card-header">Publish Results</div>
                                <div className="card-body">
                                    <table className="table table-sm mb-0">
                                        <thead>
                                            <tr><th>Platform / Account</th><th>Status</th><th>Detail</th></tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(post.platform_results).map(([key, val]) => (
                                                <tr key={key}>
                                                    <td><code>{key}</code></td>
                                                    <td>
                                                        <span className={`badge ${val.status === "success" ? "bg-success" : "bg-danger"}`}>{val.status}</span>
                                                    </td>
                                                    <td className="text-muted small">{val.error || "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Replies */}
                        <div className="card mb-3">
                            <div className="card-header">Replies ({replies.length})</div>
                            <div className="card-body">
                                {replies.length === 0 ? (
                                    <p className="text-muted small mb-0">No replies yet.</p>
                                ) : (
                                    <div className="list-group list-group-flush">
                                        {replies.map((r) => (
                                            <div key={r.id} className="list-group-item px-0">
                                                <div className="d-flex justify-content-between">
                                                    <div>
                                                        <PlatformBadge platform={r.platform} />
                                                        <strong className="ms-1">{r.author_name || r.author_handle || "Unknown"}</strong>
                                                        {r.is_outbound && <span className="badge bg-info ms-1">You</span>}
                                                    </div>
                                                    <small className="text-muted">
                                                        {r.replied_at ? new Date(r.replied_at).toLocaleString() : ""}
                                                    </small>
                                                </div>
                                                <p className="mb-0 mt-1">{r.body}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {editing && (
                            <div className="d-flex gap-2">
                                <button className="btn btn-success" onClick={handleSave} disabled={saving}>
                                    {saving ? "Saving..." : "Save Changes"}
                                </button>
                                <button className="btn btn-secondary" onClick={() => { setEditing(false); loadPost(); }}>
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="col-md-4">
                        <div className="card mb-3">
                            <div className="card-header">Platforms</div>
                            <div className="card-body">
                                {editing ? (
                                    Object.entries(PLATFORMS).map(([key, p]) => (
                                        <div className="form-check mb-2" key={key}>
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id={`platform-${key}`}
                                                checked={(form.platforms || []).includes(key)}
                                                onChange={() => togglePlatform(key)}
                                            />
                                            <label className="form-check-label" htmlFor={`platform-${key}`}>
                                                <i className={`${p.icon} me-1`} style={{ color: p.color }}></i>{p.label}
                                            </label>
                                        </div>
                                    ))
                                ) : (
                                    <div>
                                        {(post.platforms || []).map((p) => (
                                            <PlatformBadge key={p} platform={p} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card mb-3">
                            <div className="card-header">Linked Accounts</div>
                            <div className="card-body">
                                {editing ? (
                                    accounts
                                        .filter((a) => (form.platforms || []).includes(a.platform))
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
                                ) : (
                                    <div>
                                        {(post.social_accounts || []).map((a) => (
                                            <div key={a.id} className="mb-1">
                                                <PlatformBadge platform={a.platform} /> {a.account_name}
                                            </div>
                                        ))}
                                        {(!post.social_accounts || post.social_accounts.length === 0) && (
                                            <p className="text-muted small mb-0">No accounts linked.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header">Info</div>
                            <div className="card-body small text-muted">
                                <p className="mb-1"><strong>Created:</strong> {post.createdAt ? new Date(post.createdAt).toLocaleString() : "—"}</p>
                                <p className="mb-1"><strong>Updated:</strong> {post.updatedAt ? new Date(post.updatedAt).toLocaleString() : "—"}</p>
                                {post.published_at_social && (
                                    <p className="mb-0"><strong>Published:</strong> {new Date(post.published_at_social).toLocaleString()}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
