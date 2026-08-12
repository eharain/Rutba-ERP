/**
 * Video Library — the gallery of every video the business has, browsed by the
 * media server's own folders.
 *
 * WHERE THINGS LIVE. The Rutba Media FileServer owns video bytes, the drives
 * they sit on, the folder tree and the extracted metadata; it runs the drive
 * scanner too, because it is the only thing with the disks mounted. This page
 * never talks to it directly — the ERP backend proxies (/media-library/videos,
 * .../videos/folders, .../video-scan) so an ERP session is the only credential
 * anyone needs.
 *
 * Two things then meet on screen: the media server's file list, and the ERP's
 * knowledge of which posts use which video. A video is attachable to a post
 * once a library row points at it (posts carry Strapi media relations), so the
 * Attach flow links first — registering a row against bytes that never move —
 * and then writes the post. Nothing is ever copied.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    MediaUtilsEndpoints, MediaLibraryEndpoints, SocialPostsEndpoints, UploadEndpoints,
} from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";
import DropZone from "../components/DropZone";
import Link from "next/link";
import { imageItems, isVideoFile } from "../lib/video-maker";

const FETCH_PAGE = 100;
const MAX_PAGES = 20;
const PAGE_SIZE = 24;

const POST_STATUS_BADGES = {
    draft: "bg-secondary",
    scheduled: "bg-warning text-dark",
    publishing: "bg-info",
    published: "bg-success",
    partially_published: "bg-warning",
    failed: "bg-danger",
};

const fmtBytes = (bytes) => {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
};
const fmtDuration = (s) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    // Round to whole seconds BEFORE splitting, so a remainder that rounds up to
    // 60 carries into the minutes instead of rendering "1:60".
    const t = Math.round(n);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export default function VideosPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const uploadInputRef = useRef();

    // Media-server side
    const [videos, setVideos] = useState([]);
    const [total, setTotal] = useState(0);
    const [folders, setFolders] = useState([]);
    const [folder, setFolder] = useState("");
    const [recursive, setRecursive] = useState(true);
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState(null);

    // ERP side: which posts use which video (matched on url).
    const [posts, setPosts] = useState([]);

    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("newest");
    const [tag, setTag] = useState("");
    const [tags, setTags] = useState([]);          // [{ name, count }] for the folder in view
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState("");

    const [scanInfo, setScanInfo] = useState(null);
    const [scanning, setScanning] = useState(false);

    // Any filter change resets to page 1 IN THE SAME update as the filter, so a
    // request can never carry a new filter with the previous page's offset.
    const applyFilter = (setter) => (value) => { setter(value); setPage(1); };

    const [detail, setDetail] = useState(null); // video shown in the metadata panel
    const [attachFor, setAttachFor] = useState(null); // video being attached
    const [attachSearch, setAttachSearch] = useState("");
    const [attachingTo, setAttachingTo] = useState(null);
    const [republishLive, setRepublishLive] = useState(true);

    // ── media-server reads ──────────────────────────────────
    // Requests are unabortable and the listing is filtered SERVER-side, so a
    // slow earlier response could land after a newer one and repaint the grid
    // with results for a filter the user has already moved on from. Every
    // request takes a ticket; only the newest ticket may write state.
    const reqSeq = useRef(0);
    const loadVideos = useCallback(async () => {
        if (!jwt) return;
        const mine = ++reqSeq.current;
        setLoading(true);
        try {
            const res = await MediaLibraryEndpoints.mediaVideos({
                folder: folder || undefined,
                recursive: recursive ? 1 : 0,
                q: search.trim() || undefined,
                tag: tag || undefined,
                // Whole days, in the server's own DATETIME shape. `until` is the
                // end of the chosen day, or a video uploaded that afternoon
                // falls outside a range that names it.
                since: dateFrom ? `${dateFrom} 00:00:00` : undefined,
                until: dateTo ? `${dateTo} 23:59:59` : undefined,
                sort,
                limit: PAGE_SIZE,
                offset: (page - 1) * PAGE_SIZE,
            });
            const d = res.data || res;
            if (mine !== reqSeq.current) return; // a newer request owns the grid
            setVideos(d.videos || []);
            setTotal(d.total || 0);
            setServerError(null);
        } catch (err) {
            // warn, not error: an unreachable or not-yet-deployed media server
            // is a condition this page EXPECTS and explains in its own banner.
            // console.error puts it in Next's dev error overlay, where it reads
            // as a crash the page has already handled.
            console.warn("Failed to load videos from the media server", err);
            if (mine !== reqSeq.current) return;
            setVideos([]);
            setServerError(
                err?.response?.data?.error?.message
                || "Could not reach the media server. Check MEDIA_BASE_URL / MEDIA_UPLOAD_TOKEN, and that its video API is deployed.",
            );
        } finally {
            // Only the newest request may clear the spinner — otherwise a stale
            // response ends the loading state while the live one is still out.
            if (mine === reqSeq.current) setLoading(false);
        }
    }, [jwt, folder, recursive, search, tag, dateFrom, dateTo, sort, page]);

    useEffect(() => { loadVideos(); }, [loadVideos]);

    // Tags are a facet of what is on screen: scoped to the folder in view, so
    // the filter never offers a tag that would return nothing here.
    const loadTags = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await MediaLibraryEndpoints.mediaVideoTags({
                folder: folder || undefined,
                recursive: recursive ? 1 : 0,
            });
            setTags((res.data || res).tags || []);
        } catch (err) {
            // An older media server has no tag route; the rest of the gallery
            // works, so lose the filter rather than the page.
            console.warn("Failed to load video tags", err);
            setTags([]);
        }
    }, [jwt, folder, recursive]);

    useEffect(() => { loadTags(); }, [loadTags]);

    const loadFolders = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await MediaLibraryEndpoints.mediaVideoFolders();
            setFolders((res.data || res).folders || []);
        } catch {
            setFolders([]);
        }
    }, [jwt]);

    useEffect(() => { loadFolders(); }, [loadFolders]);

    const loadScanStatus = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await MediaLibraryEndpoints.videoScanStatus();
            setScanInfo(res.data || res);
        } catch {
            setScanInfo(null);
        }
    }, [jwt]);

    useEffect(() => { loadScanStatus(); }, [loadScanStatus]);

    // ── ERP side: usage ─────────────────────────────────────
    const loadPosts = useCallback(async () => {
        if (!jwt) return;
        try {
            const all = [];
            for (let p = 1; p <= MAX_PAGES; p++) {
                const res = await SocialPostsEndpoints.list({
                    status: "draft",
                    sort: ["createdAt:desc"],
                    populate: ["cover", "media", "video"],
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
            } catch { /* draft-only */ }
            setPosts(all.map((p) => ({ ...p, _isPublished: pubIds.has(p.documentId) })));
        } catch (err) {
            console.error("Failed to load posts", err);
        }
    }, [jwt]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    // A video's users, matched on the file url — the one identifier the media
    // server and the ERP's library rows share.
    const usageByUrl = useMemo(() => {
        const map = new Map();
        const add = (file, post, source) => {
            const key = String(file?.url || "").replace(/^https?:\/\/[^/]+/i, "");
            if (!key) return;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push({ post, source });
        };
        for (const post of posts) {
            (post.video || []).forEach((f) => add(f, post, "attached"));
            (post.media || []).filter(isVideoFile).forEach((f) => add(f, post, "gallery"));
        }
        return map;
    }, [posts]);

    const usersOf = useCallback((v) => {
        const key = String(v.url || "").replace(/^https?:\/\/[^/]+/i, "");
        return usageByUrl.get(key) || usageByUrl.get(`/${String(v.path || "").replace(/^\/+/, "")}`) || [];
    }, [usageByUrl]);

    // ── actions ─────────────────────────────────────────────
    // One at a time, so a single rejected file (too large, codec the provider
    // refuses) doesn't sink the rest of the drop — and so the drop zone can name
    // the file it is on.
    const handleUpload = async (picked) => {
        const all = Array.from(picked || []);
        // Same reason as the audio library: two entry paths (drop zone and the
        // upload button) and `accept` is only a dialog hint, so the mime gate
        // belongs on the upload itself rather than on each input.
        const files = all.filter((f) => f.type?.startsWith("video/"));
        const ignored = all.length - files.length;
        if (ignored) toast(`${ignored} file(s) ignored — this library takes video only.`, "warning");
        if (!files.length) return;
        setUploading(true);
        let ok = 0;
        const failed = [];
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setUploadProgress(`${i + 1} of ${files.length} — ${file.name}`);
                try {
                    // The upload provider stores masters on the media server, so an
                    // upload here IS a media-server file — it shows up in this gallery
                    // (after its index catches up) and on every post picker.
                    await UploadEndpoints.uploadFiles([file], null, null, null, { name: file.name, alt: null, caption: null });
                    ok++;
                } catch (err) {
                    console.error(`Upload failed for ${file.name}`, err);
                    failed.push(file.name);
                }
            }
            if (ok) {
                toast(
                    `Uploaded ${ok} video(s) to the media server${failed.length ? `, ${failed.length} failed` : ""}.`,
                    failed.length ? "warning" : "success",
                );
            } else {
                toast(`Upload failed: ${failed.join(", ")}`, "danger");
            }
            await Promise.all([loadVideos(), loadFolders(), loadPosts()]);
        } finally {
            setUploading(false);
            setUploadProgress("");
        }
    };

    const runScan = async () => {
        setScanning(true);
        try {
            const res = await MediaLibraryEndpoints.videoScan(folder ? { folder } : {});
            const r = res.data || res;
            toast(
                r.queued === false
                    ? "The media server is already scanning — check back shortly."
                    : "Drive scan queued on the media server. New videos appear as it indexes them.",
                "success",
            );
            await loadScanStatus();
        } catch (err) {
            console.warn("Scan request failed", err);
            toast(
                err?.response?.data?.error?.message
                || "Could not start the scan — the media server may not have its video API deployed yet.",
                "danger",
            );
        } finally {
            setScanning(false);
        }
    };

    const copyUrl = (v) => {
        navigator.clipboard.writeText(v.url)
            .then(() => toast("URL copied to clipboard.", "success"))
            .catch(() => toast("Failed to copy URL.", "danger"));
    };

    const attachToPost = async (post) => {
        if (!attachFor) return;
        setAttachingTo(post.documentId);
        try {
            // Link first: the post needs a library row id, and the row is only
            // a pointer — the bytes stay on the media server.
            const linkRes = await MediaLibraryEndpoints.linkMediaVideos({
                videos: [{
                    path: attachFor.path, url: attachFor.url, name: attachFor.name,
                    mime: attachFor.mime, size_bytes: attachFor.size_bytes,
                    width: attachFor.width, height: attachFor.height,
                }],
            });
            const linked = (linkRes.data || linkRes).linked || [];
            const fileId = linked[0]?.id;
            if (!fileId) throw new Error("The media server file could not be linked into the library.");

            const existing = (post.video || []).map((v) => v.id).filter(Boolean);
            if (existing.includes(fileId)) {
                toast("That post already has this video.", "info");
                return;
            }
            await SocialPostsEndpoints.updateDraft(post.documentId, {
                data: { video: [...existing, fileId] },
            });
            const republished = !!(republishLive && post._isPublished);
            if (republished) await SocialPostsEndpoints.publish(post.documentId);
            setAttachFor(null);
            toast(
                `Attached to “${post.title || post.documentId}”${republished ? " and re-published" : " — the post stays a draft"}.`,
                "success",
            );
            await loadPosts();
        } catch (err) {
            console.error("Failed to attach the video", err);
            toast(err?.response?.data?.error?.message || err.message || "Failed to attach the video.", "danger");
        } finally {
            setAttachingTo(null);
        }
    };

    const attachCandidates = useMemo(() => {
        const q = attachSearch.trim().toLowerCase();
        const list = q ? posts.filter((p) => `${p.title || ""} ${p.body || ""}`.toLowerCase().includes(q)) : posts;
        return list.slice(0, 30);
    }, [posts, attachSearch]);

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    // Folder rows come back flat with a full path; indent by depth so the list
    // still reads as a tree without a second data shape.
    const folderRows = useMemo(() => folders
        .slice()
        .sort((a, b) => String(a.path).localeCompare(String(b.path)))
        .map((f) => ({ ...f, depth: String(f.path || "").split("/").filter(Boolean).length - 1 })), [folders]);

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <ToastContainer />
                <div className="d-flex align-items-center flex-wrap gap-2 mb-3">
                    <h3 className="mb-0"><i className="fas fa-clapperboard me-2"></i>Video Library</h3>
                    <span className="badge bg-secondary align-self-center">{total} videos</span>
                    {folder && <span className="badge bg-info align-self-center">/{folder}</span>}
                    <div className="ms-auto d-flex gap-2">
                        <input ref={uploadInputRef} type="file" accept="video/*" multiple className="d-none"
                            onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ""; handleUpload(f); }} />
                        <button className="btn btn-sm btn-outline-primary" onClick={runScan} disabled={scanning}
                            title="Ask the media server to walk its drives and index new videos">
                            {scanning ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-hard-drive me-1"></i>}
                            Scan drives
                            {scanInfo?.job?.state === "running" || scanInfo?.job?.state === "queued" ? " (running)" : ""}
                        </button>
                        <button className="btn btn-sm btn-primary" onClick={() => uploadInputRef.current?.click()} disabled={uploading}>
                            <i className="fas fa-cloud-upload-alt me-1"></i>{uploading ? "Uploading…" : "Upload Videos"}
                        </button>
                        <Link className="btn btn-sm btn-outline-warning" href="/posts?video=without">
                            <i className="fas fa-film me-1"></i>Posts without a video
                        </Link>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => { loadVideos(); loadFolders(); loadScanStatus(); }}
                            disabled={loading} title="Refresh">
                            <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`}></i>
                        </button>
                    </div>
                </div>

                {serverError && (
                    <div className="alert alert-warning py-2">
                        <i className="fas fa-triangle-exclamation me-2"></i>{serverError}
                    </div>
                )}

                <DropZone
                    accept="video/"
                    label="Drop videos here to add them to the library"
                    hint={folder
                        ? `Drop anywhere on this page, or click to browse. Uploads go to the media server (not into /${folder} — the provider decides the path).`
                        : "Drop anywhere on this page, or click to browse. Uploads go straight to the media server."}
                    onFiles={handleUpload}
                    busy={uploading}
                    progress={uploadProgress}
                    onSkipped={(n) => toast(`${n} file(s) ignored — this library takes video only.`, "warning")}
                />

                <div className="d-flex gap-3 align-items-start">
                    {/* ── folder rail (media server's own tree) ── */}
                    <div className="flex-shrink-0" style={{ width: 230 }}>
                        <div className="card">
                            <div className="card-header py-2 d-flex align-items-center">
                                <i className="fas fa-folder-tree me-2"></i><strong className="small">Folders</strong>
                                <span className="badge bg-secondary ms-auto">{folderRows.length}</span>
                            </div>
                            <div className="list-group list-group-flush" style={{ maxHeight: "60vh", overflowY: "auto" }}>
                                <button type="button"
                                    className={`list-group-item list-group-item-action py-1 px-2 small ${folder === "" ? "active" : ""}`}
                                    onClick={() => applyFilter(setFolder)("")}>
                                    <i className="fas fa-globe me-1"></i>All videos
                                </button>
                                {folderRows.map((f) => (
                                    <button key={f.path} type="button"
                                        className={`list-group-item list-group-item-action py-1 px-2 small d-flex align-items-center ${folder === f.path ? "active" : ""}`}
                                        style={{ paddingLeft: 8 + f.depth * 12 }}
                                        onClick={() => applyFilter(setFolder)(f.path)} title={f.path}>
                                        <i className="fas fa-folder text-warning me-1"></i>
                                        <span className="text-truncate flex-grow-1">{f.name || f.path}</span>
                                        <span className="badge bg-light text-dark border ms-1">{f.videos}</span>
                                    </button>
                                ))}
                                {folderRows.length === 0 && (
                                    <div className="list-group-item small text-muted">
                                        No folders reported. Run a drive scan.
                                    </div>
                                )}
                            </div>
                            <div className="card-footer py-1">
                                <div className="form-check form-switch mb-0">
                                    <input className="form-check-input" type="checkbox" id="recursive"
                                        checked={recursive} onChange={(e) => applyFilter(setRecursive)(e.target.checked)} />
                                    <label className="form-check-label small" htmlFor="recursive">Include subfolders</label>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── grid ── */}
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="card mb-3">
                            <div className="card-body py-2 d-flex flex-wrap align-items-center gap-2">
                                <div className="input-group input-group-sm" style={{ maxWidth: 300 }}>
                                    <span className="input-group-text"><i className="fas fa-search"></i></span>
                                    <input className="form-control" placeholder="Search videos…" value={search}
                                        onChange={(e) => applyFilter(setSearch)(e.target.value)} />
                                </div>
                                <select className={`form-select form-select-sm ${tag ? "border-primary" : ""}`}
                                    style={{ width: "auto" }} value={tag}
                                    onChange={(e) => applyFilter(setTag)(e.target.value)}
                                    title={tags.length ? "Filter by tag" : "No tags on the videos in view"}>
                                    <option value="">
                                        {tags.length ? "All tags" : "No tags yet"}
                                    </option>
                                    {tags.map((t) => (
                                        <option key={t.name} value={t.name}>{t.name} ({t.count})</option>
                                    ))}
                                </select>
                                <div className="input-group input-group-sm" style={{ width: "auto" }} title="Uploaded between">
                                    <span className="input-group-text"><i className="fas fa-calendar"></i></span>
                                    <input type="date" className="form-control" value={dateFrom} max={dateTo || undefined}
                                        onChange={(e) => applyFilter(setDateFrom)(e.target.value)} />
                                    <span className="input-group-text">→</span>
                                    <input type="date" className="form-control" value={dateTo} min={dateFrom || undefined}
                                        onChange={(e) => applyFilter(setDateTo)(e.target.value)} />
                                </div>
                                <select className="form-select form-select-sm" style={{ width: "auto" }} value={sort}
                                    onChange={(e) => applyFilter(setSort)(e.target.value)}>
                                    <option value="newest">Newest first</option>
                                    <option value="oldest">Oldest first</option>
                                    <option value="name">Name A–Z</option>
                                    <option value="size">Largest first</option>
                                </select>
                                {(search || tag || dateFrom || dateTo || folder) && (
                                    <button className="btn btn-sm btn-link p-0"
                                        onClick={() => { setSearch(""); setTag(""); setDateFrom(""); setDateTo(""); setFolder(""); }}>
                                        Clear filters
                                    </button>
                                )}
                                {loading && <span className="spinner-border spinner-border-sm ms-auto"></span>}
                            </div>
                        </div>

                        {!loading && videos.length === 0 ? (
                            <div className="text-center text-muted py-5">
                                <i className="fas fa-clapperboard fa-3x mb-3 d-block"></i>
                                {serverError ? "The media server did not answer." : "No videos here. Upload one, or run a drive scan."}
                            </div>
                        ) : (
                            <div className="row g-3">
                                {videos.map((v) => {
                                    const used = usersOf(v);
                                    const dur = fmtDuration(v.duration);
                                    return (
                                        <div key={v.id || v.path} className="col-sm-6 col-xl-4">
                                            <div className="card h-100 shadow-sm border-0">
                                                <div className="bg-dark d-flex align-items-center justify-content-center"
                                                    style={{ borderRadius: "6px 6px 0 0", overflow: "hidden" }}>
                                                    <video src={v.url} controls preload="metadata"
                                                        style={{ width: "100%", maxHeight: 240, display: "block" }} />
                                                </div>
                                                <div className="card-body p-2">
                                                    <div className="fw-semibold text-truncate" style={{ fontSize: 13 }} title={v.path}>
                                                        {v.name}
                                                    </div>
                                                    <div className="text-muted d-flex flex-wrap gap-2" style={{ fontSize: 11 }}>
                                                        <span>{fmtBytes(v.size_bytes)}</span>
                                                        {dur && <span><i className="fas fa-stopwatch"></i> {dur}</span>}
                                                        {v.width && v.height && <span>{v.width}×{v.height}</span>}
                                                        {v.folder && <span title={v.folder}><i className="fas fa-folder"></i> {v.folder.split("/").pop()}</span>}
                                                        {used.length === 0 && <span className="badge bg-light text-dark border">unused</span>}
                                                    </div>
                                                    {(v.tags || []).length > 0 && (
                                                        <div className="d-flex flex-wrap gap-1 mt-1">
                                                            {v.tags.slice(0, 5).map((t) => (
                                                                <button key={t} type="button"
                                                                    className={`badge border-0 ${t === tag ? "bg-primary" : "bg-light text-dark border"}`}
                                                                    style={{ fontSize: 10, cursor: "pointer" }}
                                                                    title={t === tag ? "Clear this tag filter" : `Show only videos tagged “${t}”`}
                                                                    onClick={() => applyFilter(setTag)(t === tag ? "" : t)}>
                                                                    <i className="fas fa-tag me-1"></i>{t}
                                                                </button>
                                                            ))}
                                                            {v.tags.length > 5 && (
                                                                <span className="text-muted" style={{ fontSize: 10 }}>+{v.tags.length - 5}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {used.slice(0, 2).map(({ post, source }) => (
                                                        <Link key={`${post.documentId}-${source}`} href={`/posts/${post.documentId}`}
                                                            className="text-decoration-none d-block text-truncate mt-1" style={{ fontSize: 12 }}>
                                                            <i className="fas fa-paper-plane me-1"></i>{post.title || "(untitled)"}
                                                        </Link>
                                                    ))}
                                                    {used.length > 2 && (
                                                        <span className="text-muted d-block" style={{ fontSize: 11 }}>+{used.length - 2} more</span>
                                                    )}
                                                </div>
                                                <div className="card-footer p-1 d-flex gap-1 justify-content-center">
                                                    <button className="btn btn-sm btn-outline-success" onClick={() => { setAttachFor(v); setAttachSearch(""); }}
                                                        title="Attach to a post">
                                                        <i className="fas fa-paperclip"></i>
                                                    </button>
                                                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setDetail(v)} title="Details & metadata">
                                                        <i className="fas fa-circle-info"></i>
                                                    </button>
                                                    {used[0] && (
                                                        <Link className="btn btn-sm btn-outline-primary" href={`/posts/${used[0].post.documentId}`} title="Open the post">
                                                            <i className="fas fa-pen"></i>
                                                        </Link>
                                                    )}
                                                    {used[0] && imageItems(used[0].post).length > 0 && (
                                                        <Link className="btn btn-sm btn-outline-warning" href={`/posts/video-studio?post=${used[0].post.documentId}`}
                                                            title="Re-edit in the Video Studio">
                                                            <i className="fas fa-film"></i>
                                                        </Link>
                                                    )}
                                                    <a className="btn btn-sm btn-outline-secondary" href={v.url} download={v.name} title="Download">
                                                        <i className="fas fa-download"></i>
                                                    </a>
                                                    <button className="btn btn-sm btn-outline-secondary" onClick={() => copyUrl(v)} title="Copy URL">
                                                        <i className="fas fa-link"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {pageCount > 1 && (
                            <nav className="mt-3">
                                <ul className="pagination pagination-sm justify-content-center">
                                    <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                                        <button className="page-link" onClick={() => setPage(page - 1)}>Prev</button>
                                    </li>
                                    {Array.from({ length: Math.min(pageCount, 9) }, (_, i) => {
                                        let p;
                                        if (pageCount <= 9) p = i + 1;
                                        else if (page <= 5) p = i + 1;
                                        else if (page >= pageCount - 4) p = pageCount - 8 + i;
                                        else p = page - 4 + i;
                                        return (
                                            <li key={p} className={`page-item ${p === page ? "active" : ""}`}>
                                                <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                                            </li>
                                        );
                                    })}
                                    <li className={`page-item ${page >= pageCount ? "disabled" : ""}`}>
                                        <button className="page-link" onClick={() => setPage(page + 1)}>Next</button>
                                    </li>
                                </ul>
                            </nav>
                        )}
                    </div>
                </div>

                {/* ── metadata panel ── */}
                {detail && (
                    <div className="modal d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.5)", zIndex: 9999 }}>
                        <div className="modal-dialog modal-lg modal-dialog-scrollable">
                            <div className="modal-content">
                                <div className="modal-header py-2">
                                    <h5 className="modal-title text-truncate"><i className="fas fa-circle-info me-2"></i>{detail.name}</h5>
                                    <button type="button" className="btn-close" onClick={() => setDetail(null)}></button>
                                </div>
                                <div className="modal-body">
                                    <video src={detail.url} controls preload="metadata" className="w-100 mb-3 bg-dark rounded" style={{ maxHeight: 320 }} />
                                    <table className="table table-sm small mb-3">
                                        <tbody>
                                            <tr><td className="text-muted" style={{ width: 140 }}>Path</td><td className="text-break">{detail.path}</td></tr>
                                            <tr><td className="text-muted">Folder</td><td>{detail.folder || <span className="text-muted">root</span>}</td></tr>
                                            <tr><td className="text-muted">Type</td><td>{detail.mime}</td></tr>
                                            <tr><td className="text-muted">Size</td><td>{fmtBytes(detail.size_bytes)}</td></tr>
                                            {fmtDuration(detail.duration) && <tr><td className="text-muted">Duration</td><td>{fmtDuration(detail.duration)}</td></tr>}
                                            {detail.width && detail.height && <tr><td className="text-muted">Dimensions</td><td>{detail.width} × {detail.height}</td></tr>}
                                            {detail.visibility && <tr><td className="text-muted">Visibility</td><td>{detail.visibility}</td></tr>}
                                            {detail.created_at && <tr><td className="text-muted">Added</td><td>{new Date(detail.created_at).toLocaleString()}</td></tr>}
                                            <tr><td className="text-muted">URL</td><td className="text-break"><a href={detail.url} target="_blank" rel="noopener noreferrer">{detail.url}</a></td></tr>
                                        </tbody>
                                    </table>
                                    <div>
                                        <strong className="small">Used by</strong>
                                        {usersOf(detail).length === 0 ? (
                                            <p className="text-muted small mb-0">No post uses this video yet.</p>
                                        ) : (
                                            <ul className="list-unstyled mb-0 small">
                                                {usersOf(detail).map(({ post, source }) => (
                                                    <li key={`${post.documentId}-${source}`}>
                                                        <Link href={`/posts/${post.documentId}`}>{post.title || "(untitled)"}</Link>
                                                        {source === "gallery" && <span className="badge bg-light text-dark border ms-1">gallery</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                                <div className="modal-footer py-2">
                                    <button className="btn btn-sm btn-success" onClick={() => { setAttachFor(detail); setDetail(null); }}>
                                        <i className="fas fa-paperclip me-1"></i>Attach to a post
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setDetail(null)}>Close</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── attach-to-post picker ── */}
                {attachFor && (
                    <div className="modal d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.5)", zIndex: 9999 }}>
                        <div className="modal-dialog modal-lg modal-dialog-scrollable">
                            <div className="modal-content">
                                <div className="modal-header py-2">
                                    <h5 className="modal-title text-truncate">
                                        <i className="fas fa-paperclip me-2"></i>Attach “{attachFor.name}” to a post
                                    </h5>
                                    <button type="button" className="btn-close" onClick={() => setAttachFor(null)}></button>
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
                                            <label className="form-check-label small" htmlFor="attach-republish">
                                                Re-publish already-live posts
                                            </label>
                                        </div>
                                    </div>
                                    <div className="list-group">
                                        {attachCandidates.map((post) => {
                                            const thumb = post.cover || imageItems(post)[0];
                                            const busy = attachingTo === post.documentId;
                                            return (
                                                <div key={post.documentId} className="list-group-item d-flex align-items-center gap-2 py-1 px-2">
                                                    {thumb ? (
                                                        <img src={MediaUtilsEndpoints.strapiImageUrl(thumb.formats?.thumbnail || thumb)} alt=""
                                                            style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                                                    ) : (
                                                        <div className="bg-light rounded d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
                                                            <i className="fas fa-image text-muted"></i>
                                                        </div>
                                                    )}
                                                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                                        <div className="text-truncate fw-semibold" style={{ fontSize: 13 }}>{post.title || "(untitled)"}</div>
                                                        <div className="d-flex gap-1" style={{ fontSize: 10 }}>
                                                            <span className={`badge ${POST_STATUS_BADGES[post.post_status] || "bg-secondary"}`}>
                                                                {(post.post_status || "draft").replace("_", " ")}
                                                            </span>
                                                            <span className={`badge ${post._isPublished ? "bg-success" : "bg-secondary"}`}>
                                                                {post._isPublished ? "Live" : "Draft"}
                                                            </span>
                                                            {(post.video || []).length > 0 && (
                                                                <span className="badge bg-dark"><i className="fas fa-film"></i> {(post.video || []).length}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button className="btn btn-sm btn-success" disabled={!!attachingTo}
                                                        onClick={() => attachToPost(post)}>
                                                        {busy ? <span className="spinner-border spinner-border-sm"></span> : "Attach"}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {attachCandidates.length === 0 && <p className="text-muted small mb-0">No posts match.</p>}
                                    </div>
                                </div>
                                <div className="modal-footer py-2">
                                    <span className="me-auto text-muted small">
                                        The video stays on the media server — the post just points at it.
                                    </span>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setAttachFor(null)}>Close</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
