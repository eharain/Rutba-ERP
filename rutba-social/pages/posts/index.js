import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, SocialPostsEndpoints, SocialAccountsEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../../components/Toast";
import PLATFORMS, { PlatformBadge } from "../../components/PlatformBadge";
import ExcelIO from "../../components/ExcelIO";
import Link from "next/link";
import { imageItems, hasVideo } from "../../lib/video-maker";

// Everything is fetched up front (like the studio always did) because half the
// filters — has-video, published-on-platform — live in JSON columns the API
// cannot filter on. Filtering and paging then happen client-side.
const FETCH_PAGE = 50;
const MAX_PAGES = 20;
const CARDS_PER_PAGE = 24;

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
        // Normalize whatever Excel hands back: an ISO string round-trips as-is,
        // but a cell the user reformatted comes back as a Date or an Excel
        // serial number — convert both to ISO so Strapi accepts it.
        parse: (cell) => {
            if (cell === "" || cell === null || cell === undefined) return undefined;
            if (cell instanceof Date) return cell.toISOString();
            if (typeof cell === "number") {
                const d = new Date(Math.round((cell - 25569) * 86400 * 1000)); // Excel serial → epoch
                return isNaN(d.getTime()) ? undefined : d.toISOString();
            }
            const d = new Date(String(cell).trim());
            return isNaN(d.getTime()) ? String(cell).trim() : d.toISOString();
        },
    },
    {
        // Only draft | scheduled are meaningful to set in bulk; publishing/failed
        // states are owned by the Publish flow. Anything else is dropped (left
        // unchanged) so a stray value can't corrupt a post's status.
        key: "post_status", width: 18,
        format: (r) => r.post_status || "draft",
        parse: (cell) => {
            const v = String(cell).trim().toLowerCase();
            return (v === "draft" || v === "scheduled") ? v : undefined;
        },
    },
    {
        key: "published_at_social", width: 22, readOnly: true,
        format: (r) => (r.published_at_social ? new Date(r.published_at_social).toISOString() : ""),
    },
];

// Per-destination outcome, as recorded in platform_results under
// `<platform>#<accountDocumentId>`. `pending` = handed to the Rutba Social
// Poster desktop app and not yet confirmed, which is progress, not failure.
const RESULT_STATE = {
    success: { cls: "bg-success", icon: "fa-check", label: "posted" },
    pending: { cls: "bg-info", icon: "fa-hourglass-half", label: "queued for the Social Poster app" },
    unverified: { cls: "bg-warning text-dark", icon: "fa-question", label: "clicked but not confirmed — check the platform" },
    error: { cls: "bg-danger", icon: "fa-xmark", label: "failed" },
    failed: { cls: "bg-danger", icon: "fa-xmark", label: "failed" },
    removed: { cls: "bg-secondary", icon: "fa-eraser", label: "removed from the platform" },
};

// One chip per social account this post is meant to reach, flagged with whether
// it actually went out there. The link is platform_results' per-account key, so
// two accounts on the same platform are tracked separately.
function AccountFlags({ post, accounts }) {
    const results = post.platform_results || {};
    const targeted = Array.isArray(post.platforms) && post.platforms.length ? post.platforms : null;
    const rows = accounts.filter((a) => !targeted || targeted.includes(a.platform));

    // No account exists for these platforms yet — show what it targets instead.
    if (!rows.length) {
        return (post.platforms || []).map((p) => <PlatformBadge key={p} platform={p} />);
    }
    const done = rows.filter((a) => results[`${a.platform}#${a.documentId}`]?.status === "success").length;
    return (
        <div className="d-flex flex-wrap gap-1 align-items-center">
            <span className="badge bg-light text-dark border" title="Accounts posted / accounts targeted">
                {done}/{rows.length}
            </span>
            {rows.map((a) => {
                const r = results[`${a.platform}#${a.documentId}`];
                const st = r && RESULT_STATE[r.status];
                const p = PLATFORMS[a.platform] || {};
                const detail = r?.error || r?.note || "";
                return (
                    <span
                        key={a.documentId}
                        className={`badge ${st ? st.cls : "bg-light text-muted border"} d-inline-flex align-items-center`}
                        style={{ maxWidth: 190 }}
                        title={`${a.account_name} (${a.platform}) — ${st ? st.label : "not posted yet"}${detail ? ": " + detail : ""}`}
                    >
                        <i className={`${p.icon || "fas fa-share-nodes"} me-1`}></i>
                        <i className={`fas ${st ? st.icon : "fa-minus"} me-1`}></i>
                        <span className="text-truncate">{a.account_name}</span>
                    </span>
                );
            })}
        </div>
    );
}

const POST_STATUS_BADGES = {
    draft: "bg-secondary",
    scheduled: "bg-warning text-dark",
    publishing: "bg-info",
    published: "bg-success",
    partially_published: "bg-warning",
    failed: "bg-danger",
};

// Did any destination on this platform confirm the post? Keys are
// `<platform>#<accountDocId>` (bare `<platform>` on old rows).
const publishedOn = (post, platform) => Object.entries(post.platform_results || {})
    .some(([k, v]) => (k === platform || k.startsWith(`${platform}#`)) && v?.status === "success");
const publishedAnywhere = (post) =>
    Object.values(post.platform_results || {}).some((v) => v?.status === "success");
// An empty platforms list targets every connected account (see AccountFlags).
const targetsPlatform = (post, platform) =>
    !(post.platforms || []).length || post.platforms.includes(platform);

export default function PostsPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const router = useRouter();

    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [publishing, setPublishing] = useState({});
    // Active accounts drive the per-account "posted / not posted" flags.
    const [accounts, setAccounts] = useState([]);

    // ── filters ─────────────────────────────────────────────
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [videoFilter, setVideoFilter] = useState("all"); // all | with | without
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    // Two independent conditions so they can combine — e.g. posts already on
    // YouTube that still owe TikTok. "" = off, "any" = any platform.
    const [publishedOnFilter, setPublishedOnFilter] = useState("");
    const [notPublishedOnFilter, setNotPublishedOnFilter] = useState("");

    // Deep links (e.g. the studio's "posts without a video") preset filters:
    // ?video=with|without, ?published_on=tiktok|any, ?not_published_on=youtube|any
    useEffect(() => {
        if (!router.isReady) return;
        const v = router.query.video;
        if (v === "with" || v === "without") setVideoFilter(v);
        const okPlatform = (x) => x === "any" || !!PLATFORMS[x];
        if (okPlatform(router.query.published_on)) setPublishedOnFilter(router.query.published_on);
        if (okPlatform(router.query.not_published_on)) setNotPublishedOnFilter(router.query.not_published_on);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady]);

    const filtersActive = search.trim() || statusFilter !== "all" || videoFilter !== "all"
        || dateFrom || dateTo || publishedOnFilter || notPublishedOnFilter;
    const clearFilters = () => {
        setSearch(""); setStatusFilter("all"); setVideoFilter("all");
        setDateFrom(""); setDateTo(""); setPublishedOnFilter(""); setNotPublishedOnFilter("");
    };

    useEffect(() => {
        if (!jwt) return;
        SocialAccountsEndpoints.list({ filters: { is_active: { $eq: true } }, sort: ['platform:asc'] })
            .then((res) => setAccounts(res.data || []))
            .catch((err) => console.error("Failed to load accounts", err));
    }, [jwt]);

    const loadPosts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const all = [];
            for (let p = 1; p <= MAX_PAGES; p++) {
                const res = await SocialPostsEndpoints.list({
                    status: 'draft',
                    sort: ['createdAt:desc'],
                    populate: ['cover', 'media', 'video', 'products'],
                    pagination: { page: p, pageSize: FETCH_PAGE },
                });
                const rows = res.data || [];
                all.push(...rows);
                const pc = res.meta?.pagination?.pageCount || 1;
                if (p >= pc || rows.length < FETCH_PAGE) break;
            }
            let pubIds = new Set();
            try {
                const pub = await SocialPostsEndpoints.publishedMarker();
                pubIds = new Set((pub.data || []).map((x) => x.documentId));
            } catch { /* CMS column falls back to draft */ }
            setPosts(all.map((p) => ({ ...p, _isPublished: pubIds.has(p.documentId) })));
        } catch (err) {
            console.error("Failed to load posts", err);
            toast("Failed to load posts.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    // ── client-side filtering ───────────────────────────────
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const from = dateFrom ? new Date(dateFrom) : null;
        const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
        return posts.filter((p) => {
            if (q && !`${p.title || ""} ${p.body || ""}`.toLowerCase().includes(q)) return false;
            if (statusFilter !== "all" && (p.post_status || "draft") !== statusFilter) return false;
            if (videoFilter === "with" && !hasVideo(p)) return false;
            if (videoFilter === "without" && hasVideo(p)) return false;
            const created = p.createdAt ? new Date(p.createdAt) : null;
            if (from && (!created || created < from)) return false;
            if (to && (!created || created > to)) return false;
            if (publishedOnFilter) {
                if (publishedOnFilter === "any" ? !publishedAnywhere(p) : !publishedOn(p, publishedOnFilter)) return false;
            }
            if (notPublishedOnFilter) {
                if (notPublishedOnFilter === "any") {
                    if (publishedAnywhere(p)) return false;
                } else {
                    // "Not published on X" means posts that still OWE X a post —
                    // ones that target the platform but have no success there.
                    if (publishedOn(p, notPublishedOnFilter) || !targetsPlatform(p, notPublishedOnFilter)) return false;
                }
            }
            return true;
        });
    }, [posts, search, statusFilter, videoFilter, dateFrom, dateTo, publishedOnFilter, notPublishedOnFilter]);

    useEffect(() => { setPage(1); }, [search, statusFilter, videoFilter, dateFrom, dateTo, publishedOnFilter, notPublishedOnFilter]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / CARDS_PER_PAGE));
    const clampedPage = Math.min(page, pageCount);
    const pageItems = filtered.slice((clampedPage - 1) * CARDS_PER_PAGE, clampedPage * CARDS_PER_PAGE);
    const withoutVideoCount = useMemo(() => filtered.filter((p) => !hasVideo(p)).length, [filtered]);

    // ── selection ───────────────────────────────────────────
    const toggleSelected = (docId) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    };

    const filteredPostIds = filtered.map(p => p.documentId);
    const allSelected = filteredPostIds.length > 0 && filteredPostIds.every(id => selectedIds.has(id));
    const toggleSelectAll = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) { filteredPostIds.forEach(id => next.delete(id)); } else { filteredPostIds.forEach(id => next.add(id)); }
            return next;
        });
    };
    const selectedCount = [...selectedIds].filter(id => filteredPostIds.includes(id)).length;

    // ── publish / unpublish / duplicate / delete ────────────
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
        const ids = [...selectedIds].filter(id => filteredPostIds.includes(id));
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
        const ids = [...selectedIds].filter(id => filteredPostIds.includes(id));
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

    const handleDelete = async (post) => {
        if (!confirm(`Delete post "${post.title}"?`)) return;
        try {
            await SocialPostsEndpoints.del(post.documentId);
            setPosts(prev => prev.filter(p => p.documentId !== post.documentId));
            toast("Post deleted.", "success");
        } catch (err) {
            console.error("Failed to delete post", err);
            toast("Failed to delete post.", "danger");
        }
    };

    const duplicateOne = async (post) => {
        try {
            const res = await SocialPostsEndpoints.duplicate(post.documentId);
            const newId = (res?.data || res)?.documentId;
            toast("Copied to a new draft — review & publish to repost.", "success");
            if (newId) router.push(`/posts/${newId}`);
            else await loadPosts();
        } catch (err) {
            console.error("Failed to duplicate post", err);
            toast("Failed to duplicate.", "danger");
        }
    };

    // Everything is already in memory, so "Export All" is just the filtered list.
    const fetchAllPosts = useCallback(async () => filtered, [filtered]);

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <ToastContainer />
                <div className="d-flex align-items-center flex-wrap gap-2 mb-3">
                    <h3 className="mb-0"><i className="fas fa-paper-plane me-2"></i>Posts</h3>
                    <span className="badge bg-secondary align-self-center">
                        {filtersActive ? `${filtered.length} of ${posts.length}` : `${posts.length}`} posts
                    </span>
                    {withoutVideoCount > 0 && (
                        <span className="badge bg-warning text-dark align-self-center">{withoutVideoCount} without a video</span>
                    )}
                    <div className="ms-auto d-flex gap-2 align-items-center flex-wrap">
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
                            rows={filtered}
                            selectedIds={selectedIds}
                            total={filtered.length}
                            fetchAll={fetchAllPosts}
                            onAfterImport={loadPosts}
                        />
                        <Link className="btn btn-success btn-sm" href="/posts/from-product" title="Turn a product into a shoppable post">
                            <i className="fas fa-tags me-1"></i>Sell a Product
                        </Link>
                        <Link className="btn btn-primary btn-sm" href="/posts/create">
                            <i className="fas fa-plus me-1"></i>New Post
                        </Link>
                        <button className="btn btn-sm btn-outline-secondary" onClick={loadPosts} disabled={loading} title="Refresh">
                            <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`}></i>
                        </button>
                    </div>
                </div>

                {/* ── filters ── */}
                <div className="card mb-3">
                    <div className="card-body py-2 d-flex flex-wrap align-items-center gap-2">
                        <div className="input-group input-group-sm" style={{ maxWidth: 280 }}>
                            <span className="input-group-text"><i className="fas fa-search"></i></span>
                            <input className="form-control" placeholder="Search posts…" value={search}
                                onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        <select className="form-select form-select-sm" style={{ width: "auto" }} value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)} title="Post status">
                            <option value="all">All statuses</option>
                            <option value="draft">Draft</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="publishing">Publishing</option>
                            <option value="published">Published</option>
                            <option value="partially_published">Partially published</option>
                            <option value="failed">Failed</option>
                        </select>
                        <select className="form-select form-select-sm" style={{ width: "auto" }} value={videoFilter}
                            onChange={(e) => setVideoFilter(e.target.value)} title="Video">
                            <option value="all">With & without video</option>
                            <option value="with">With video</option>
                            <option value="without">Without video</option>
                        </select>
                        <select className={`form-select form-select-sm ${publishedOnFilter ? "border-success" : ""}`}
                            style={{ width: "auto" }} value={publishedOnFilter}
                            onChange={(e) => setPublishedOnFilter(e.target.value)}
                            title="Only posts already published on…">
                            <option value="">Published on…</option>
                            <option value="any">Published anywhere</option>
                            {Object.entries(PLATFORMS).map(([key, p]) => (
                                <option key={key} value={key}>Published on {p.label}</option>
                            ))}
                        </select>
                        <select className={`form-select form-select-sm ${notPublishedOnFilter ? "border-danger" : ""}`}
                            style={{ width: "auto" }} value={notPublishedOnFilter}
                            onChange={(e) => setNotPublishedOnFilter(e.target.value)}
                            title="Only posts that still owe a platform a post">
                            <option value="">Not published on…</option>
                            <option value="any">Not published anywhere</option>
                            {Object.entries(PLATFORMS).map(([key, p]) => (
                                <option key={key} value={key}>Not on {p.label}</option>
                            ))}
                        </select>
                        <div className="input-group input-group-sm" style={{ width: "auto" }} title="Created between">
                            <span className="input-group-text"><i className="fas fa-calendar"></i></span>
                            <input type="date" className="form-control" value={dateFrom} max={dateTo || undefined}
                                onChange={(e) => setDateFrom(e.target.value)} />
                            <span className="input-group-text">→</span>
                            <input type="date" className="form-control" value={dateTo} min={dateFrom || undefined}
                                onChange={(e) => setDateTo(e.target.value)} />
                        </div>
                        <div className="form-check mb-0 ms-1">
                            <input className="form-check-input" type="checkbox" id="select-all"
                                checked={allSelected} onChange={toggleSelectAll} disabled={!filtered.length} />
                            <label className="form-check-label small" htmlFor="select-all">Select all</label>
                        </div>
                        {filtersActive && (
                            <button className="btn btn-sm btn-link p-0" onClick={clearFilters}>Clear filters</button>
                        )}
                        {loading && <span className="spinner-border spinner-border-sm ms-auto"></span>}
                    </div>
                </div>

                {loading && posts.length === 0 ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : filtered.length === 0 ? (
                    <div className="alert alert-info">
                        {posts.length === 0 ? "No posts yet. Create your first post!" : "No posts match the current filters."}
                    </div>
                ) : (
                    <>
                        <div className="row g-3">
                            {pageItems.map((post) => {
                                const imgs = imageItems(post);
                                const thumb = post.cover || imgs[0];
                                const withVideo = hasVideo(post);
                                const busy = publishing[post.documentId];
                                const checked = selectedIds.has(post.documentId);
                                return (
                                    <div key={post.documentId} className="col-sm-6 col-md-4 col-xl-3 col-xxl-2">
                                        <div className={`card h-100 shadow-sm ${checked ? "border-primary" : "border-0"}`}>
                                            <div className="position-relative">
                                                <Link href={`/posts/${post.documentId}`} className="d-block bg-light d-flex align-items-center justify-content-center"
                                                    style={{ height: 140, overflow: "hidden", borderRadius: "6px 6px 0 0" }}>
                                                    {thumb ? (
                                                        <img src={MediaUtilsEndpoints.strapiImageUrl(thumb.formats?.small || thumb.formats?.thumbnail || thumb)} alt=""
                                                            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                    ) : (
                                                        <i className="fas fa-image fa-2x text-muted"></i>
                                                    )}
                                                </Link>
                                                <input type="checkbox" className="form-check-input position-absolute"
                                                    style={{ top: 8, left: 8, zIndex: 2 }}
                                                    checked={checked} onChange={() => toggleSelected(post.documentId)} />
                                                <div className="position-absolute d-flex gap-1" style={{ top: 8, right: 8, zIndex: 2 }}>
                                                    {withVideo && (
                                                        <span className="badge bg-dark" title="Has a video"><i className="fas fa-film"></i></span>
                                                    )}
                                                    <span className={`badge ${post._isPublished ? "bg-success" : "bg-secondary"}`}
                                                        title={`CMS: ${post._isPublished ? "published" : "draft"}`}>
                                                        {post._isPublished ? "Live" : "Draft"}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="card-body p-2">
                                                <Link href={`/posts/${post.documentId}`} className="text-decoration-none fw-semibold d-block text-truncate"
                                                    style={{ fontSize: 13 }} title={post.title}>
                                                    {post.title || "(untitled)"}
                                                </Link>
                                                <div className="text-muted d-flex align-items-center gap-2 flex-wrap" style={{ fontSize: 11 }}>
                                                    <span className={`badge ${POST_STATUS_BADGES[post.post_status] || "bg-secondary"}`}>
                                                        {(post.post_status || "draft").replace("_", " ")}
                                                    </span>
                                                    <span>{post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ""}</span>
                                                    {imgs.length > 0 && <span><i className="fas fa-image"></i> {imgs.length}</span>}
                                                    {(post.products || []).length > 0 && (
                                                        <span title="Linked products"><i className="fas fa-box"></i> {post.products.length}</span>
                                                    )}
                                                </div>
                                                <div className="mt-1">
                                                    <AccountFlags post={post} accounts={accounts} />
                                                </div>
                                            </div>
                                            <div className="card-footer p-1 d-flex gap-1 justify-content-center flex-wrap">
                                                <Link className="btn btn-sm btn-outline-primary" href={`/posts/${post.documentId}`} title="Edit the post">
                                                    <i className="fas fa-pen"></i>
                                                </Link>
                                                {imgs.length > 0 && (
                                                    <Link className={`btn btn-sm ${withVideo ? "btn-outline-secondary" : "btn-outline-warning"}`}
                                                        href={`/posts/video-studio?post=${post.documentId}`}
                                                        title={withVideo ? "Edit / re-render this post's video" : "Make a video from this post's images"}>
                                                        <i className="fas fa-film"></i>
                                                    </Link>
                                                )}
                                                {post._isPublished ? (
                                                    <button className="btn btn-sm btn-outline-secondary" onClick={() => unpublishOne(post.documentId)}
                                                        disabled={busy} title="Unpublish from the platforms">
                                                        {busy ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-eye-slash"></i>}
                                                    </button>
                                                ) : (
                                                    <button className="btn btn-sm btn-outline-success" onClick={() => publishOne(post.documentId)}
                                                        disabled={busy} title="Publish to the connected platforms">
                                                        {busy ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-upload"></i>}
                                                    </button>
                                                )}
                                                <button className="btn btn-sm btn-outline-primary" onClick={() => duplicateOne(post)} title="Repost — copy to a new draft">
                                                    <i className="fas fa-copy"></i>
                                                </button>
                                                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(post)} title="Delete">
                                                    <i className="fas fa-trash"></i>
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
                                    {Array.from({ length: Math.min(pageCount, 9) }, (_, i) => {
                                        let p;
                                        if (pageCount <= 9) p = i + 1;
                                        else if (clampedPage <= 5) p = i + 1;
                                        else if (clampedPage >= pageCount - 4) p = pageCount - 8 + i;
                                        else p = clampedPage - 4 + i;
                                        return (
                                            <li key={p} className={`page-item ${p === clampedPage ? "active" : ""}`}>
                                                <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                                            </li>
                                        );
                                    })}
                                    <li className={`page-item ${clampedPage >= pageCount ? "disabled" : ""}`}>
                                        <button className="page-link" onClick={() => setPage(clampedPage + 1)}>Next</button>
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
