import React, { useState, useEffect, useCallback } from "react";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { useToast } from "../../components/Toast";
import { PlatformBadge } from "../../components/PlatformBadge";
import Link from "next/link";

const PAGE_SIZE = 20;

const STATUS_BADGES = {
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

    const loadPosts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                status: 'draft',
                sort: ['createdAt:desc'],
                populate: ['media', 'social_accounts'],
                pagination: { page, pageSize: PAGE_SIZE },
            };
            if (search) {
                params.filters = { ...params.filters, title: { $containsi: search } };
            }
            if (statusFilter !== 'all') {
                params.filters = { ...params.filters, post_status: { $eq: statusFilter } };
            }
            const res = await authApi.get('/social-posts', params);
            setPosts(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount || 1);
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
            await authApi.delete(`/social-posts/${post.documentId}`);
            toast("Post deleted.", "success");
            await loadPosts();
        } catch (err) {
            console.error("Failed to delete post", err);
            toast("Failed to delete post.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-paper-plane me-2"></i>Posts</h3>
                    <Link className="btn btn-primary btn-sm" href="/posts/create">
                        <i className="fas fa-plus me-1"></i>New Post
                    </Link>
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
                                        <th>Title</th>
                                        <th>Platforms</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {posts.map((post) => (
                                        <tr key={post.id}>
                                            <td>
                                                <Link href={`/posts/${post.documentId}`} className="text-decoration-none fw-semibold">
                                                    {post.title}
                                                </Link>
                                                {post.media && post.media.length > 0 && (
                                                    <span className="ms-2 text-muted small">
                                                        <i className="fas fa-paperclip"></i> {post.media.length}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                {(post.platforms || []).map((p) => (
                                                    <PlatformBadge key={p} platform={p} />
                                                ))}
                                            </td>
                                            <td>
                                                <span className={`badge ${STATUS_BADGES[post.post_status] || "bg-secondary"}`}>
                                                    {(post.post_status || "draft").replace("_", " ")}
                                                </span>
                                            </td>
                                            <td className="text-muted small">
                                                {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "—"}
                                            </td>
                                            <td>
                                                <Link className="btn btn-sm btn-outline-primary me-1" href={`/posts/${post.documentId}`}>
                                                    <i className="fas fa-pen"></i>
                                                </Link>
                                                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(post)}>
                                                    <i className="fas fa-trash"></i>
                                                </button>
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
