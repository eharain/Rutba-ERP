import React, { useState, useEffect, useCallback } from "react";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, SocialPostsEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../../components/Toast";
import { PlatformBadge } from "../../components/PlatformBadge";
import ExcelIO from "../../components/ExcelIO";
import Link from "next/link";

const PAGE_SIZE = 20;

// Bulk-edit columns. documentId/id/contentType/publish are auto-emitted by
// ExcelIO. Keep the documentId on a row to update it; clear it (or add a new
// row) to create a draft. platforms/tags round-trip as comma-separated lists.
const POST_EXCEL_COLUMNS = [
    { key: "title", isLabel: true, width: 36 },
    { key: "body", width: 90 },
    {
        key: "platforms", width: 30,
        format: (r) => (Array.isArray(r.platforms) ? r.platforms.join(", ") : (r.platforms || "")),
        parse: (cell) => String(cell).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    },
    {
        key: "tags", width: 28,
        format: (r) => (Array.isArray(r.tags) ? r.tags.join(", ") : (r.tags || "")),
        parse: (cell) => String(cell).split(",").map((s) => s.trim()).filter(Boolean),
    },
    {
        key: "scheduled_at", width: 20,
        format: (r) => (r.scheduled_at ? new Date(r.scheduled_at).toISOString() : ""),
    },
    {
        // draft | scheduled are the meaningful editable values; the publish/
        // failed states are managed by the Publish flow, not the spreadsheet.
        key: "post_status", width: 18,
        format: (r) => r.post_status || "draft",
    },
    {
        key: "published_at_social", width: 22, readOnly: true,
        format: (r) => (r.published_at_social ? new Date(r.published_at_social).toISOString() : ""),
    },
];

const POST_STATUS_BADGES = {
    draft: "bg-secondary",
    scheduled: "bg-warning text-dark",
    publishing: "bg-info",
    published: "bg-success",
    partially_published: "bg-warning",
    failed: "bg-danger",
};

export default function PostsPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [publishing, setPublishing] = useState({});

    const toggleSelected = (docId) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    };

    const filteredPostIds = posts.map(p => p.documentId);
    const allSelected = filteredPostIds.length > 0 && filteredPostIds.every(id => selectedIds.has(id));
    const toggleSelectAll = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) { filteredPostIds.forEach(id => next.delete(id)); } else { filteredPostIds.forEach(id => next.add(id)); }
            return next;
        });
    };

    const summarizeResult = (res) => {
        const r = res?.data || res || {};
        if (typeof r.successes === "number" && typeof r.attempted === "number") {
            return { ok: r.successes, fail: Math.max(0, r.attempted - r.successes), status: r.post_status };
        }
        return { ok: 1, fail: 0 };
    };

    const publishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            const res = await SocialPostsEndpoints.publishSocial(docId);
            const { ok, fail } = summarizeResult(res);
            setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: ok > 0 } : p));
            if (fail > 0 && ok > 0) toast(`Published to ${ok} platform(s), ${fail} failed.`, "warning");
            else if (ok > 0) toast(`Published to ${ok} platform(s)!`, "success");
            else toast("Publish failed on all platforms. Check the post's Publish Results.", "danger");
        } catch (err) {
            console.error("Failed to publish", err);
            toast(err?.response?.data?.error?.message || "Failed to publish.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
    };

    const unpublishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await SocialPostsEndpoints.unpublishSocial(docId);
            setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false } : p));
            toast("Removed from platforms.", "success");
        } catch (err) {
            console.error("Failed to unpublish", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
    };

    const bulkPublish = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`Publish ${ids.length} post(s) to their connected platforms?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { const res = await SocialPostsEndpoints.publishSocial(docId); const s = summarizeResult(res); if (s.ok > 0) { ok++; setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: true } : p)); } else { fail++; } }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Published ${ok} post(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const bulkUnpublish = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`Unpublish ${ids.length} post(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await SocialPostsEndpoints.unpublishSocial(docId); ok++; setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false } : p)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Unpublished ${ok} post(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const loadPosts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                status: 'draft',
                sort: ['createdAt:desc'],
                populate: ['cover', 'social_accounts', 'products'],
                pagination: { page, pageSize: PAGE_SIZE },
            };
            const filters = {};
            if (search.trim()) filters.title = { $containsi: search.trim() };
            if (statusFilter !== 'all') filters.post_status = { $eq: statusFilter };
            if (Object.keys(filters).length > 0) params.filters = filters;

            const [draftRes, pubRes] = await Promise.all([
                SocialPostsEndpoints.list(params),
                SocialPostsEndpoints.publishedMarker(),
            ]);
            const pubIds = new Set((pubRes.data || []).map(p => p.documentId));
            setPosts((draftRes.data || []).map(p => ({ ...p, _isPublished: pubIds.has(p.documentId) })));
            setPageCount(draftRes.meta?.pagination?.pageCount || 1);
            setTotal(draftRes.meta?.pagination?.total || 0);
        } catch (err) {
            console.error("Failed to load posts", err);
            toast("Failed to load posts.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, page, search, statusFilter]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    // Pull every draft matching the current filters (for "Export All"). Marks
    // _isPublished from publishedMarker so the sheet's publish column is right.
    const fetchAllPosts = useCallback(async () => {
        const out = [];
        let p = 1;
        const PAGE = 100;
        const filters = {};
        if (search.trim()) filters.title = { $containsi: search.trim() };
        if (statusFilter !== 'all') filters.post_status = { $eq: statusFilter };
        while (true) {
            const params = { status: 'draft', sort: ['createdAt:desc'], pagination: { page: p, pageSize: PAGE } };
            if (Object.keys(filters).length > 0) params.filters = filters;
            const res = await SocialPostsEndpoints.list(params);
            const arr = res.data || [];
            out.push(...arr);
            if (arr.length < PAGE) break;
            p += 1;
            if (p > 500) break;
        }
        try {
            const pub = await SocialPostsEndpoints.publishedMarker();
            const pubIds = new Set((pub.data || []).map(x => x.documentId));
            out.forEach(r => { r._isPublished = pubIds.has(r.documentId); });
        } catch { /* publish column falls back to publishedAt */ }
        return out;
    }, [search, statusFilter]);

    const handleDelete = async (post) => {
        if (!confirm(`Delete post "${post.title}"?`)) return;
        try {
            await SocialPostsEndpoints.del(post.documentId);
            toast("Post deleted.", "success");
            await loadPosts();
        } catch (err) {
            console.error("Failed to delete post", err);
            toast("Failed to delete post.", "danger");
        }
    };

    const selectedCount = [...selectedIds].filter(id => filteredPostIds.includes(id)).length;

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-paper-plane me-2"></i>Posts</h3>
                    <div className="d-flex gap-2 align-items-center">
                        {selectedCount > 0 && (
                            <>
                                <button className="btn btn-success btn-sm" onClick={bulkPublish}>
                                    <i className="fas fa-upload me-1"></i>Publish ({selectedCount})
                                </button>
                                <button className="btn btn-outline-secondary btn-sm" onClick={bulkUnpublish}>
                                    <i className="fas fa-eye-slash me-1"></i>Unpublish ({selectedCount})
                                </button>
                            </>
                        )}
                        <ExcelIO
                            entityLabel="Social Posts"
                            contentType="api::social-post.social-post"
                            columns={POST_EXCEL_COLUMNS}
                            rows={posts}
                            selectedIds={selectedIds}
                            total={total}
                            fetchAll={fetchAllPosts}
                            onAfterImport={loadPosts}
                        />
                        <Link className="btn btn-primary btn-sm" href="/posts/create">
                            <i className="fas fa-plus me-1"></i>New Post
                        </Link>
                    </div>
                </div>

                <div className="row g-2 mb-3">
                    <div className="col-md-6">
                        <input
                            className="form-control form-control-sm"
                            placeholder="Search posts..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        />
                    </div>
                    <div className="col-md-3">
                        <select className="form-select form-select-sm" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                            <option value="all">All Statuses</option>
                            <option value="draft">Draft</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="published">Published</option>
                            <option value="failed">Failed</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : posts.length === 0 ? (
                    <div className="alert alert-info">No posts found. Create your first post!</div>
                ) : (
                    <>
                        <div className="table-responsive">
                            <table className="table table-hover align-middle">
                                <thead>
                                    <tr>
                                        <th style={{ width: 30 }}>
                                            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                                        </th>
                                        <th style={{ width: 50 }}></th>
                                        <th>Title</th>
                                        <th>Platforms</th>
                                        <th>Post Status</th>
                                        <th>CMS</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {posts.map((post) => (
                                        <tr key={post.id}>
                                            <td>
                                                <input type="checkbox" checked={selectedIds.has(post.documentId)} onChange={() => toggleSelected(post.documentId)} />
                                            </td>
                                            <td>
                                                {post.cover ? (
                                                    <img src={MediaUtilsEndpoints.strapiImageUrl(post.cover)} alt="" className="rounded" style={{ width: 40, height: 40, objectFit: "cover" }} />
                                                ) : (
                                                    <div className="bg-light rounded d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
                                                        <i className="fas fa-image text-muted"></i>
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <Link href={`/posts/${post.documentId}`} className="text-decoration-none fw-semibold">
                                                    {post.title}
                                                </Link>
                                                {(post.products || []).length > 0 && (
                                                    <span className="ms-2 text-muted small" title="Linked products">
                                                        <i className="fas fa-box"></i> {post.products.length}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                {(post.platforms || []).map((p) => (
                                                    <PlatformBadge key={p} platform={p} />
                                                ))}
                                            </td>
                                            <td>
                                                <span className={`badge ${POST_STATUS_BADGES[post.post_status] || "bg-secondary"}`}>
                                                    {(post.post_status || "draft").replace("_", " ")}
                                                </span>
                                            </td>
                                            <td>
                                                {post._isPublished ? (
                                                    <span className="badge bg-success">Published</span>
                                                ) : (
                                                    <span className="badge bg-secondary">Draft</span>
                                                )}
                                            </td>
                                            <td className="text-muted small">
                                                {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ""}
                                            </td>
                                            <td>
                                                <div className="d-flex gap-1">
                                                    <Link className="btn btn-sm btn-outline-primary" href={`/posts/${post.documentId}`}>
                                                        <i className="fas fa-pen"></i>
                                                    </Link>
                                                    {post._isPublished ? (
                                                        <button className="btn btn-sm btn-outline-secondary" onClick={() => unpublishOne(post.documentId)} disabled={publishing[post.documentId]}>
                                                            {publishing[post.documentId] ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-eye-slash"></i>}
                                                        </button>
                                                    ) : (
                                                        <button className="btn btn-sm btn-outline-success" onClick={() => publishOne(post.documentId)} disabled={publishing[post.documentId]}>
                                                            {publishing[post.documentId] ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-upload"></i>}
                                                        </button>
                                                    )}
                                                    <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(post)}>
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {pageCount > 1 && (
                            <nav>
                                <ul className="pagination pagination-sm justify-content-center">
                                    <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                                        <button className="page-link" onClick={() => setPage(page - 1)}>Prev</button>
                                    </li>
                                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                                        <li key={p} className={`page-item ${p === page ? "active" : ""}`}>
                                            <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                                        </li>
                                    ))}
                                    <li className={`page-item ${page >= pageCount ? "disabled" : ""}`}>
                                        <button className="page-link" onClick={() => setPage(page + 1)}>Next</button>
                                    </li>
                                </ul>
                            </nav>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
