import React, { useState, useEffect, useCallback } from "react";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { useToast } from "../../components/Toast";
import { PlatformBadge } from "../../components/PlatformBadge";
import Link from "next/link";

const PAGE_SIZE = 20;

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

    const publishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await authApi.post(`/social-posts/${docId}/publish`, {});
            setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: true } : p));
            toast("Published!", "success");
        } catch (err) {
            console.error("Failed to publish", err);
            toast("Failed to publish.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
    };

    const unpublishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await authApi.post(`/social-posts/${docId}/unpublish`, {});
            setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false } : p));
            toast("Unpublished.", "success");
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
        if (!confirm(`Publish ${ids.length} post(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await authApi.post(`/social-posts/${docId}/publish`, {}); ok++; setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: true } : p)); }
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
            try { await authApi.post(`/social-posts/${docId}/unpublish`, {}); ok++; setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false } : p)); }
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
                authApi.get('/social-posts', params),
                authApi.get('/social-posts', { status: 'published', fields: ['documentId'], pagination: { pageSize: 200 } }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(p => p.documentId));
            setPosts((draftRes.data || []).map(p => ({ ...p, _isPublished: pubIds.has(p.documentId) })));
            setPageCount(draftRes.meta?.pagination?.pageCount || 1);
        } catch (err) {
            console.error("Failed to load posts", err);
            toast("Failed to load posts.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, page, search, statusFilter]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    const handleDelete = async (post) => {
        if (!confirm(`Delete post "${post.title}"?`)) return;
        try {
            await authApi.del(`/social-posts/${post.documentId}`);
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
                    <div className="d-flex gap-2">
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
                                                    <img src={StraipImageUrl(post.cover)} alt="" className="rounded" style={{ width: 40, height: 40, objectFit: "cover" }} />
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
