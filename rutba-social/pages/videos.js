/**
 * Video Library — every video in the media library, and where each one is used.
 *
 * Two sources meet here: the media library's video files (mime video/*) and
 * the posts that reference them, either in the `video` attachment slot or in a
 * `media` gallery. The library list is the spine — a video uploaded but not
 * yet used by any post still shows, which is what makes this a gallery and
 * not just an index of attachments. From any card a video can be watched,
 * downloaded, uploaded fresh, or ATTACHED to a post: that appends it to the
 * post's `video` field (the slot every publishing path reads), and re-publishes
 * posts that are already live so the poster and the public API see it —
 * mirroring the studio's attach semantics, a draft is never first-published.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    MediaUtilsEndpoints, MediaLibraryEndpoints, SocialPostsEndpoints, UploadEndpoints,
} from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";
import Link from "next/link";
import { imageItems, isVideoFile } from "../lib/video-maker";

const FETCH_PAGE = 100;
const MAX_PAGES = 20;
const CARDS_PER_PAGE = 12;

const POST_STATUS_BADGES = {
    draft: "bg-secondary",
    scheduled: "bg-warning text-dark",
    publishing: "bg-info",
    published: "bg-success",
    partially_published: "bg-warning",
    failed: "bg-danger",
};

// Strapi reports `size` in KB.
function formatBytes(kb) {
    if (!kb && kb !== 0) return "";
    if (kb < 1) return `${Math.round(kb * 1024)} B`;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

export default function VideosPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const uploadInputRef = useRef();

    const [files, setFiles] = useState([]); // library video files
    const [posts, setPosts] = useState([]); // all posts, for usage + attach
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [page, setPage] = useState(1);

    const [search, setSearch] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [usageFilter, setUsageFilter] = useState("all"); // all | attached | unattached
    const [sort, setSort] = useState("createdAt:desc");

    // Attach flow: which file the picker is open for, and its own state.
    const [attachFile, setAttachFile] = useState(null);
    const [attachSearch, setAttachSearch] = useState("");
    const [attachingTo, setAttachingTo] = useState(null); // post documentId in flight
    const [republishLive, setRepublishLive] = useState(true);

    const loadAll = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const libFiles = [];
            for (let p = 1; p <= MAX_PAGES; p++) {
                const res = await MediaLibraryEndpoints.files({
                    mime: "video", sort: "createdAt:desc", page: p, pageSize: FETCH_PAGE,
                });
                const rows = res.data || [];
                // A server that predates the `video` mime filter returns every
                // file — keep only real videos either way.
                libFiles.push(...rows.filter(isVideoFile));
                const pc = res.meta?.pagination?.pageCount || 1;
                if (p >= pc || rows.length === 0) break;
            }

            const allPosts = [];
            for (let p = 1; p <= MAX_PAGES; p++) {
                const res = await SocialPostsEndpoints.list({
                    status: "draft",
                    sort: ["createdAt:desc"],
                    populate: ["cover", "media", "video"],
                    pagination: { page: p, pageSize: FETCH_PAGE },
                });
                const rows = res.data || [];
                allPosts.push(...rows);
                const pc = res.meta?.pagination?.pageCount || 1;
                if (p >= pc || rows.length < FETCH_PAGE) break;
            }
            let pubIds = new Set();
            try {
                const pub = await SocialPostsEndpoints.publishedMarker();
                pubIds = new Set((pub.data || []).map((x) => x.documentId));
            } catch { /* treat everything as draft-only */ }

            setFiles(libFiles);
            setPosts(allPosts.map((p) => ({ ...p, _isPublished: pubIds.has(p.documentId) })));
        } catch (err) {
            console.error("Failed to load the video library", err);
            toast("Failed to load the video library.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // file id → the posts using it. Also folds in videos a post references that
    // the library listing missed (page cap), so nothing in use can be unlisted.
    const { rows, usage } = useMemo(() => {
        const use = new Map();
        const extra = [];
        const known = new Set(files.map((f) => f.id));
        for (const post of posts) {
            const note = (file, source) => {
                if (!file?.url) return;
                if (!use.has(file.id)) use.set(file.id, []);
                use.get(file.id).push({ post, source });
                if (!known.has(file.id)) { known.add(file.id); extra.push(file); }
            };
            (post.video || []).forEach((f) => note(f, "attached"));
            (post.media || []).filter(isVideoFile).forEach((f) => note(f, "gallery"));
        }
        return { rows: [...files, ...extra], usage: use };
    }, [files, posts]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const from = dateFrom ? new Date(dateFrom) : null;
        const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
        const list = rows.filter((file) => {
            const used = usage.get(file.id) || [];
            if (usageFilter === "attached" && used.length === 0) return false;
            if (usageFilter === "unattached" && used.length > 0) return false;
            if (q) {
                const hay = `${file.name || ""} ${file.alternativeText || ""} ${used.map((u) => u.post.title || "").join(" ")}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            const created = file.createdAt ? new Date(file.createdAt) : null;
            if (from && (!created || created < from)) return false;
            if (to && (!created || created > to)) return false;
            return true;
        });
        const [field, order] = sort.split(":");
        const dir = order === "asc" ? 1 : -1;
        list.sort((a, b) => {
            if (field === "size") return ((a.size || 0) - (b.size || 0)) * dir;
            if (field === "name") return String(a.name || "").localeCompare(String(b.name || "")) * dir;
            return String(a.createdAt || "").localeCompare(String(b.createdAt || "")) * dir;
        });
        return list;
    }, [rows, usage, search, dateFrom, dateTo, usageFilter, sort]);

    useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, usageFilter, sort]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / CARDS_PER_PAGE));
    const clampedPage = Math.min(page, pageCount);
    const pageItems = filtered.slice((clampedPage - 1) * CARDS_PER_PAGE, clampedPage * CARDS_PER_PAGE);

    const copyUrl = (file) => {
        navigator.clipboard.writeText(MediaUtilsEndpoints.strapiImageUrl(file))
            .then(() => toast("URL copied to clipboard.", "success"))
            .catch(() => toast("Failed to copy URL.", "danger"));
    };

    const handleUpload = async (e) => {
        const picked = Array.from(e.target.files || []);
        if (!picked.length) return;
        setUploading(true);
        try {
            await UploadEndpoints.uploadFiles(picked, null, null, null, { name: null, alt: null, caption: null });
            toast(`Uploaded ${picked.length} video(s).`, "success");
            await loadAll();
        } catch (err) {
            console.error("Upload failed", err);
            toast("Upload failed.", "danger");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    // ── attach to post ──────────────────────────────────────
    const openAttach = (file) => { setAttachFile(file); setAttachSearch(""); };

    const attachToPost = async (post) => {
        if (!attachFile) return;
        const existing = (post.video || []).map((v) => v.id).filter(Boolean);
        if (existing.includes(attachFile.id)) {
            toast("That post already has this video attached.", "info");
            return;
        }
        setAttachingTo(post.documentId);
        try {
            await SocialPostsEndpoints.updateDraft(post.documentId, {
                data: { video: [...existing, attachFile.id] },
            });
            // A post that is already live needs re-publishing or the new video
            // stays invisible to the poster and the public API. A draft is left
            // a draft — attaching must never be what first publishes it.
            const republished = !!(republishLive && post._isPublished);
            if (republished) await SocialPostsEndpoints.publish(post.documentId);
            setPosts((list) => list.map((p) => (p.documentId === post.documentId
                ? { ...p, video: [...(p.video || []), attachFile] }
                : p)));
            setAttachFile(null);
            toast(`Attached to “${post.title || post.documentId}”${republished ? " and re-published" : " — the post stays a draft"}.`, "success");
        } catch (err) {
            console.error("Failed to attach the video", err);
            toast(err?.response?.data?.error?.message || "Failed to attach the video.", "danger");
        } finally {
            setAttachingTo(null);
        }
    };

    const attachCandidates = useMemo(() => {
        const q = attachSearch.trim().toLowerCase();
        const list = q
            ? posts.filter((p) => `${p.title || ""} ${p.body || ""}`.toLowerCase().includes(q))
            : posts;
        return list.slice(0, 30);
    }, [posts, attachSearch]);

    const filtersActive = search.trim() || dateFrom || dateTo || usageFilter !== "all";

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <ToastContainer />
                <div className="d-flex align-items-center flex-wrap gap-2 mb-3">
                    <h3 className="mb-0"><i className="fas fa-clapperboard me-2"></i>Video Library</h3>
                    <span className="badge bg-secondary align-self-center">
                        {filtersActive ? `${filtered.length} of ${rows.length}` : `${rows.length}`} videos
                    </span>
                    <div className="ms-auto d-flex gap-2">
                        <input ref={uploadInputRef} type="file" accept="video/*" multiple className="d-none" onChange={handleUpload} />
                        <button className="btn btn-sm btn-primary" onClick={() => uploadInputRef.current?.click()} disabled={uploading}>
                            <i className="fas fa-cloud-upload-alt me-1"></i>{uploading ? "Uploading…" : "Upload Videos"}
                        </button>
                        <Link className="btn btn-sm btn-outline-warning" href="/posts?video=without"
                            title="Posts that still need a video">
                            <i className="fas fa-film me-1"></i>Posts without a video
                        </Link>
                        <button className="btn btn-sm btn-outline-secondary" onClick={loadAll} disabled={loading} title="Refresh">
                            <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`}></i>
                        </button>
                    </div>
                </div>

                <div className="card mb-3">
                    <div className="card-body py-2 d-flex flex-wrap align-items-center gap-2">
                        <div className="input-group input-group-sm" style={{ maxWidth: 300 }}>
                            <span className="input-group-text"><i className="fas fa-search"></i></span>
                            <input className="form-control" placeholder="Search by file or post title…" value={search}
                                onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        <select className="form-select form-select-sm" style={{ width: "auto" }} value={usageFilter}
                            onChange={(e) => setUsageFilter(e.target.value)}>
                            <option value="all">Attached & unattached</option>
                            <option value="attached">Attached to a post</option>
                            <option value="unattached">Not attached yet</option>
                        </select>
                        <div className="input-group input-group-sm" style={{ width: "auto" }} title="Uploaded between">
                            <span className="input-group-text"><i className="fas fa-calendar"></i></span>
                            <input type="date" className="form-control" value={dateFrom} max={dateTo || undefined}
                                onChange={(e) => setDateFrom(e.target.value)} />
                            <span className="input-group-text">→</span>
                            <input type="date" className="form-control" value={dateTo} min={dateFrom || undefined}
                                onChange={(e) => setDateTo(e.target.value)} />
                        </div>
                        <select className="form-select form-select-sm" style={{ width: "auto" }} value={sort}
                            onChange={(e) => setSort(e.target.value)}>
                            <option value="createdAt:desc">Newest first</option>
                            <option value="createdAt:asc">Oldest first</option>
                            <option value="name:asc">Name A–Z</option>
                            <option value="size:desc">Largest first</option>
                        </select>
                        {filtersActive && (
                            <button className="btn btn-sm btn-link p-0"
                                onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setUsageFilter("all"); }}>
                                Clear filters
                            </button>
                        )}
                        {loading && <span className="spinner-border spinner-border-sm ms-auto"></span>}
                    </div>
                </div>

                {loading && rows.length === 0 ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : filtered.length === 0 ? (
                    <div className="text-center text-muted py-5">
                        <i className="fas fa-clapperboard fa-3x mb-3 d-block"></i>
                        {rows.length === 0
                            ? <>No videos yet. Render one in the <Link href="/posts/video-studio">Video Studio</Link>, or upload one here.</>
                            : "No videos match the current filters."}
                    </div>
                ) : (
                    <>
                        <div className="row g-3">
                            {pageItems.map((file) => {
                                const used = usage.get(file.id) || [];
                                return (
                                    <div key={file.id} className="col-sm-6 col-md-4 col-xl-3">
                                        <div className="card h-100 shadow-sm border-0">
                                            <div className="bg-dark d-flex align-items-center justify-content-center"
                                                style={{ borderRadius: "6px 6px 0 0", overflow: "hidden" }}>
                                                <video
                                                    src={MediaUtilsEndpoints.strapiImageUrl(file)}
                                                    controls
                                                    preload="metadata"
                                                    style={{ width: "100%", maxHeight: 260, display: "block" }}
                                                />
                                            </div>
                                            <div className="card-body p-2">
                                                <div className="fw-semibold text-truncate" style={{ fontSize: 13 }} title={file.name}>
                                                    {file.name}
                                                </div>
                                                <div className="text-muted d-flex align-items-center gap-2 flex-wrap" style={{ fontSize: 11 }}>
                                                    <span>{formatBytes(file.size)}</span>
                                                    {file.createdAt && <span>{new Date(file.createdAt).toLocaleDateString()}</span>}
                                                    {used.length === 0 && (
                                                        <span className="badge bg-light text-dark border">unattached</span>
                                                    )}
                                                </div>
                                                {used.slice(0, 2).map(({ post, source }) => (
                                                    <Link key={`${post.documentId}-${source}`} href={`/posts/${post.documentId}`}
                                                        className="text-decoration-none d-block text-truncate mt-1"
                                                        style={{ fontSize: 12 }}
                                                        title={`${post.title || "(untitled)"}${source === "gallery" ? " — in the media gallery, not the video slot" : ""}`}>
                                                        <i className="fas fa-paper-plane me-1"></i>{post.title || "(untitled)"}
                                                        {source === "gallery" && <span className="badge bg-light text-dark border ms-1">gallery</span>}
                                                    </Link>
                                                ))}
                                                {used.length > 2 && (
                                                    <span className="text-muted d-block mt-1" style={{ fontSize: 11 }}>
                                                        +{used.length - 2} more post{used.length - 2 === 1 ? "" : "s"}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="card-footer p-1 d-flex gap-1 justify-content-center">
                                                <button className="btn btn-sm btn-outline-success" onClick={() => openAttach(file)}
                                                    title="Attach this video to a post">
                                                    <i className="fas fa-paperclip"></i>
                                                </button>
                                                {used[0] && (
                                                    <Link className="btn btn-sm btn-outline-primary" href={`/posts/${used[0].post.documentId}`}
                                                        title="Open the post">
                                                        <i className="fas fa-pen"></i>
                                                    </Link>
                                                )}
                                                {used[0] && imageItems(used[0].post).length > 0 && (
                                                    <Link className="btn btn-sm btn-outline-warning" href={`/posts/video-studio?post=${used[0].post.documentId}`}
                                                        title="Re-edit / re-render in the Video Studio">
                                                        <i className="fas fa-film"></i>
                                                    </Link>
                                                )}
                                                <a className="btn btn-sm btn-outline-secondary" href={MediaUtilsEndpoints.strapiImageUrl(file)}
                                                    download={file.name} title="Download">
                                                    <i className="fas fa-download"></i>
                                                </a>
                                                <button className="btn btn-sm btn-outline-secondary" onClick={() => copyUrl(file)} title="Copy URL">
                                                    <i className="fas fa-link"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {pageCount > 1 && (
                            <nav className="mt-3">
                                <ul className="pagination pagination-sm justify-content-center">
                                    <li className={`page-item ${clampedPage <= 1 ? "disabled" : ""}`}>
                                        <button className="page-link" onClick={() => setPage(clampedPage - 1)}>Prev</button>
                                    </li>
                                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                                        <li key={p} className={`page-item ${p === clampedPage ? "active" : ""}`}>
                                            <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                                        </li>
                                    ))}
                                    <li className={`page-item ${clampedPage >= pageCount ? "disabled" : ""}`}>
                                        <button className="page-link" onClick={() => setPage(clampedPage + 1)}>Next</button>
                                    </li>
                                </ul>
                            </nav>
                        )}
                    </>
                )}

                {/* ── attach-to-post picker ── */}
                {attachFile && (
                    <div className="modal d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.5)", zIndex: 9999 }}>
                        <div className="modal-dialog modal-lg modal-dialog-scrollable">
                            <div className="modal-content">
                                <div className="modal-header py-2">
                                    <h5 className="modal-title text-truncate">
                                        <i className="fas fa-paperclip me-2"></i>Attach “{attachFile.name}” to a post
                                    </h5>
                                    <button type="button" className="btn-close" onClick={() => setAttachFile(null)}></button>
                                </div>
                                <div className="modal-body">
                                    <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
                                        <div className="input-group input-group-sm" style={{ maxWidth: 320 }}>
                                            <span className="input-group-text"><i className="fas fa-search"></i></span>
                                            <input className="form-control" placeholder="Search posts…" autoFocus
                                                value={attachSearch} onChange={(e) => setAttachSearch(e.target.value)} />
                                        </div>
                                        <div className="form-check form-switch mb-0">
                                            <input className="form-check-input" type="checkbox" id="attach-republish"
                                                checked={republishLive} onChange={(e) => setRepublishLive(e.target.checked)} />
                                            <label className="form-check-label small" htmlFor="attach-republish"
                                                title="Posts that are already live are re-published so the poster and the public API see the new video. Drafts are never published by this.">
                                                Re-publish already-live posts
                                            </label>
                                        </div>
                                    </div>
                                    {attachCandidates.length === 0 ? (
                                        <p className="text-muted small mb-0">No posts match.</p>
                                    ) : (
                                        <div className="list-group">
                                            {attachCandidates.map((post) => {
                                                const already = (post.video || []).some((v) => v.id === attachFile.id);
                                                const thumb = post.cover || imageItems(post)[0];
                                                const busy = attachingTo === post.documentId;
                                                return (
                                                    <div key={post.documentId} className="list-group-item d-flex align-items-center gap-2 py-1 px-2">
                                                        {thumb ? (
                                                            <img src={MediaUtilsEndpoints.strapiImageUrl(thumb.formats?.thumbnail || thumb)} alt=""
                                                                style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                                                        ) : (
                                                            <div className="bg-light rounded d-flex align-items-center justify-content-center"
                                                                style={{ width: 40, height: 40 }}>
                                                                <i className="fas fa-image text-muted"></i>
                                                            </div>
                                                        )}
                                                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                                            <div className="text-truncate fw-semibold" style={{ fontSize: 13 }}>
                                                                {post.title || "(untitled)"}
                                                            </div>
                                                            <div className="d-flex gap-1" style={{ fontSize: 10 }}>
                                                                <span className={`badge ${POST_STATUS_BADGES[post.post_status] || "bg-secondary"}`}>
                                                                    {(post.post_status || "draft").replace("_", " ")}
                                                                </span>
                                                                <span className={`badge ${post._isPublished ? "bg-success" : "bg-secondary"}`}>
                                                                    {post._isPublished ? "Live" : "Draft"}
                                                                </span>
                                                                {(post.video || []).length > 0 && (
                                                                    <span className="badge bg-dark" title="Already has a video">
                                                                        <i className="fas fa-film"></i> {(post.video || []).length}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button className={`btn btn-sm ${already ? "btn-outline-secondary" : "btn-success"}`}
                                                            disabled={already || !!attachingTo}
                                                            onClick={() => attachToPost(post)}>
                                                            {busy ? <span className="spinner-border spinner-border-sm"></span>
                                                                : already ? "Attached" : "Attach"}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div className="modal-footer py-2">
                                    <span className="me-auto text-muted small">
                                        The video is appended to the post's video slot — existing videos stay.
                                    </span>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setAttachFile(null)}>Close</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
