import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useToast } from "../components/Toast";
import { PlatformBadge } from "../components/PlatformBadge";
import Link from "next/link";

const PAGE_SIZE = 25;

export default function RepliesPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [replies, setReplies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const [platformFilter, setPlatformFilter] = useState("all");

    const loadReplies = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                sort: ['createdAt:desc'],
                pagination: { page, pageSize: PAGE_SIZE },
                populate: ['social_post'],
            };
            if (platformFilter !== 'all') {
                params.filters = { platform: { $eq: platformFilter } };
            }
            const res = await authApi.get('/social-replies', params);
            setReplies(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount || 1);
        } catch (err) {
            console.error("Failed to load replies", err);
            toast("Failed to load replies.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, page, platformFilter]);

    useEffect(() => { loadReplies(); }, [loadReplies]);

    const handleDelete = async (reply) => {
        if (!confirm("Delete this reply?")) return;
        try {
            await authApi.delete(`/social-replies/${reply.documentId}`);
            toast("Reply deleted.", "success");
            await loadReplies();
        } catch (err) {
            console.error("Failed to delete reply", err);
            toast("Failed to delete reply.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-comments me-2"></i>Replies</h3>
                </div>

                <div className="row g-2 mb-3">
                    <div className="col-md-3">
                        <select className="form-select form-select-sm" value={platformFilter} onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }}>
                            <option value="all">All Platforms</option>
                            <option value="instagram">Instagram</option>
                            <option value="facebook">Facebook</option>
                            <option value="x">X</option>
                            <option value="tiktok">TikTok</option>
                            <option value="youtube">YouTube</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : replies.length === 0 ? (
                    <div className="alert alert-info">No replies found.</div>
                ) : (
                    <>
                        <div className="list-group mb-3">
                            {replies.map((reply) => (
                                <div key={reply.id} className="list-group-item">
                                    <div className="d-flex justify-content-between align-items-start">
                                        <div>
                                            <PlatformBadge platform={reply.platform} />
                                            <strong className="ms-1">{reply.author_name || reply.author_handle || "Unknown"}</strong>
                                            {reply.is_outbound && <span className="badge bg-info ms-1">Outbound</span>}
                                            {reply.social_post && (
                                                <span className="ms-2 text-muted small">
                                                    on <Link href={`/posts/${reply.social_post.documentId}`}>
                                                        {reply.social_post.title || "Post"}
                                                    </Link>
                                                </span>
                                            )}
                                        </div>
                                        <div className="d-flex align-items-center gap-2">
                                            <small className="text-muted">
                                                {reply.replied_at ? new Date(reply.replied_at).toLocaleString() : reply.createdAt ? new Date(reply.createdAt).toLocaleString() : ""}
                                            </small>
                                            <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(reply)}>
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <p className="mb-0 mt-1">{reply.body}</p>
                                </div>
                            ))}
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
