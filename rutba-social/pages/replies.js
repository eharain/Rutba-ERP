import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useToast } from "../components/Toast";
import { PlatformBadge } from "../components/PlatformBadge";
import Link from "next/link";

const PAGE_SIZE = 25;

const PLATFORM_COLORS = {
    instagram: "#E1306C",
    facebook: "#1877F2",
    x: "#000000",
    tiktok: "#010101",
    youtube: "#FF0000",
};

export default function RepliesPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [replies, setReplies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const [platformFilter, setPlatformFilter] = useState("all");
    const [directionFilter, setDirectionFilter] = useState("all");

    const loadReplies = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                sort: ['createdAt:desc'],
                pagination: { page, pageSize: PAGE_SIZE },
                populate: ['social_post'],
            };
            const filters = {};
            if (platformFilter !== 'all') filters.platform = { $eq: platformFilter };
            if (directionFilter === 'inbound') filters.is_outbound = { $eq: false };
            if (directionFilter === 'outbound') filters.is_outbound = { $eq: true };
            if (Object.keys(filters).length > 0) params.filters = filters;
            const res = await authApi.get('/social-replies', params);
            setReplies(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount || 1);
        } catch (err) {
            console.error("Failed to load replies", err);
            toast("Failed to load replies.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, page, platformFilter, directionFilter]);

    useEffect(() => { loadReplies(); }, [loadReplies]);

    const handleDelete = async (reply) => {
        if (!confirm("Delete this reply?")) return;
        try {
            await authApi.del(`/social-replies/${reply.documentId}`);
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
                    <div className="col-md-3">
                        <select className="form-select form-select-sm" value={directionFilter} onChange={(e) => { setDirectionFilter(e.target.value); setPage(1); }}>
                            <option value="all">All Directions</option>
                            <option value="inbound">Viewer Comments</option>
                            <option value="outbound">Our Replies</option>
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
                                <div key={reply.id} className={`list-group-item ${reply.is_outbound ? "border-start border-3 border-primary" : ""}`}>
                                    <div className="d-flex justify-content-between align-items-start">
                                        <div className="d-flex align-items-center gap-2">
                                            {reply.author_avatar_url ? (
                                                <img src={reply.author_avatar_url} alt="" className="rounded-circle" style={{ width: 32, height: 32, objectFit: "cover" }} />
                                            ) : (
                                                <div className="rounded-circle bg-light d-flex align-items-center justify-content-center" style={{ width: 32, height: 32 }}>
                                                    <i className={`fas ${reply.is_outbound ? "fa-headset" : "fa-user"} text-muted`} style={{ fontSize: 14 }}></i>
                                                </div>
                                            )}
                                            <div>
                                                <PlatformBadge platform={reply.platform} />
                                                <strong className="ms-1">{reply.author_name || reply.author_handle || "Unknown"}</strong>
                                                {reply.author_handle && reply.author_name && (
                                                    <span className="text-muted small ms-1">@{reply.author_handle}</span>
                                                )}
                                                {reply.is_outbound ? (
                                                    <span className="badge bg-primary ms-1">Our Reply</span>
                                                ) : (
                                                    <span className="badge bg-light text-dark ms-1">Viewer</span>
                                                )}
                                                {reply.social_post && (
                                                    <span className="ms-2 text-muted small">
                                                        on <Link href={`/posts/${reply.social_post.documentId}`}>
                                                            {reply.social_post.title || "Post"}
                                                        </Link>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="d-flex align-items-center gap-2">
                                            <span
                                                className="badge"
                                                style={{
                                                    backgroundColor: PLATFORM_COLORS[reply.platform] || "#6c757d",
                                                    color: reply.platform === "x" ? "#fff" : "#fff",
                                                    fontSize: 10,
                                                }}
                                            >
                                                {reply.platform}
                                            </span>
                                            <small className="text-muted">
                                                {reply.replied_at ? new Date(reply.replied_at).toLocaleString() : reply.createdAt ? new Date(reply.createdAt).toLocaleString() : ""}
                                            </small>
                                            <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(reply)}>
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <p className="mb-0 mt-1" style={{ whiteSpace: "pre-wrap" }}>{reply.body}</p>
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
