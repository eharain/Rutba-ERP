/**
 * Video Studio — turn an image-only post into a video.
 *
 * Posts that carry nothing but stills are dead weight on the video-first
 * platforms: TikTok's web uploader accepts video only, and Reels/Shorts want
 * one too. This stitches the post's images into a slideshow and types the post
 * body over the top, then attaches the result to the post's `video` field — so
 * every publishing path picks it up, the API adapters and the desktop Social
 * Poster alike, with nothing else to wire up.
 *
 * The encoding happens in this tab (see lib/video-maker.js) and runs in real
 * time, so a 30-second video takes 30 seconds and the tab has to stay in front.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    MediaUtilsEndpoints, SocialPostsEndpoints, UploadEndpoints,
    SiteSettingEndpoints, SocialAudioTracksEndpoints,
} from "@rutba/api-provider/endpoints";
import { useToast } from "../../components/Toast";
import PLATFORMS from "../../components/PlatformBadge";
import {
    ASPECTS, THEMES, DEFAULTS,
    buildPlan, paintFrame, renderVideo, loadImage, loadImages, releaseImages,
    loadAudioTrack, setMediaAuth,
    imageItems, isImageOnly, unsupportedReason, videoFileName,
} from "../../lib/video-maker";

const SETTINGS_KEY = "rutba-social-video-studio";
const FETCH_PAGE = 50;
const MAX_PAGES = 20;

// Which platforms care that a post has no video — a capability fact, not a
// second copy of the platform registry (labels and colours still come from
// components/PlatformBadge). TikTok's web uploader is video-only, so an
// image-only post targeting it can never go out at all.
const VIDEO_ONLY = ["tiktok"];
const VIDEO_PREFERRED = ["instagram", "youtube"];

const fmtSeconds = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const fmtBytes = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export default function VideoStudioPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const router = useRouter();

    const canvasRef = useRef(null);
    const previewRaf = useRef(0);
    const previewStart = useRef(0);
    const abortRef = useRef(null);
    const batchCancelRef = useRef(false);
    const loadedRef = useRef([]); // blob-backed images awaiting revoke

    const [blocked, setBlocked] = useState(null); // browser can't encode
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [onlyCandidates, setOnlyCandidates] = useState(true);
    const [search, setSearch] = useState("");

    const [selected, setSelected] = useState(null);
    const [images, setImages] = useState([]);
    const [imageErrors, setImageErrors] = useState([]);
    const [loadingImages, setLoadingImages] = useState(false);

    const [options, setOptions] = useState(DEFAULTS);
    const [bodyOverride, setBodyOverride] = useState(null); // edited caption, not saved to the post
    const [plan, setPlan] = useState(null);

    const [previewTime, setPreviewTime] = useState(0);
    const [playing, setPlaying] = useState(false);

    const [rendering, setRendering] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState(null); // { blob, url, mimeType, extension, duration }
    const [attaching, setAttaching] = useState(false);
    const [alsoPublish, setAlsoPublish] = useState(true);

    const [batch, setBatch] = useState(null); // { total, done, current }

    // Brand mark from this app's site-settings row.
    const [logo, setLogo] = useState(null); // { img, objectUrl, url }
    const [logoError, setLogoError] = useState(null);

    // Music: the shared audio library (foreign URLs and uploads alike), managed
    // on /audio and read here. Only tracks in rotation are offered.
    const [tracks, setTracks] = useState([]);
    const [tracksLoading, setTracksLoading] = useState(false);
    const [previewingId, setPreviewingId] = useState(null);
    const trackAudioRef = useRef(null);
    const bufferCache = useRef(new Map()); // track id → decoded AudioBuffer

    // The media proxy needs our identity to admit a foreign track URL — it
    // checks the URL against the audio library rather than trusting the host.
    useEffect(() => {
        let role = null;
        try { role = localStorage.getItem("activeRole:social"); } catch { /* private mode */ }
        setMediaAuth({ jwt, appRole: role });
    }, [jwt]);

    // ── settings persistence ────────────────────────────────
    useEffect(() => {
        setBlocked(unsupportedReason());
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) setOptions((o) => ({ ...o, ...JSON.parse(raw) }));
        } catch { /* defaults are fine */ }
    }, []);
    useEffect(() => {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(options)); } catch { /* private mode */ }
    }, [options]);

    const setOpt = (patch) => setOptions((o) => ({ ...o, ...patch }));

    // ── post list ───────────────────────────────────────────
    const loadPosts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const all = [];
            for (let page = 1; page <= MAX_PAGES; page++) {
                const res = await SocialPostsEndpoints.list({
                    status: "draft",
                    sort: ["createdAt:desc"],
                    populate: ["cover", "media", "video"],
                    pagination: { page, pageSize: FETCH_PAGE },
                });
                const rows = res.data || [];
                all.push(...rows);
                const pc = res.meta?.pagination?.pageCount || 1;
                if (page >= pc || rows.length < FETCH_PAGE) break;
            }
            // Which posts already have a published copy. Attaching a video must
            // never be what first publishes a draft — that would drop a post the
            // author hasn't finished into the Social Poster's queue.
            let publishedIds = new Set();
            try {
                const pub = await SocialPostsEndpoints.publishedMarker();
                publishedIds = new Set((pub.data || []).map((p) => p.documentId));
            } catch { /* fall back to treating everything as draft-only */ }
            setPosts(all.map((p) => ({ ...p, _isPublished: publishedIds.has(p.documentId) })));
        } catch (err) {
            console.error("Failed to load posts", err);
            toast("Failed to load posts.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    // ── brand mark ──────────────────────────────────────────
    // The resolver hands back this app's row (X-Rutba-App: social) or the
    // default row, so the logo is whatever the CMS says it is — not a copy
    // pasted in here that then drifts from the site.
    useEffect(() => {
        if (!jwt) return;
        let cancelled = false;
        let loaded = null;
        (async () => {
            try {
                const res = await SiteSettingEndpoints.getDraft({ populate: ["site_logo"] });
                const row = res?.data || res;
                const file = row?.site_logo;
                if (!file?.url) { setLogoError("No site logo is set in site settings."); return; }
                loaded = await loadImage(MediaUtilsEndpoints.strapiImageUrl(file));
                if (cancelled) { releaseImages([loaded]); return; }
                setLogo(loaded);
                setLogoError(null);
            } catch (err) {
                console.error("Failed to load the site logo", err);
                setLogoError(
                    /40[13]/.test(String(err?.message || err?.response?.status))
                        ? "Not allowed to read site settings — reseed api-provider so 'social' can."
                        : "Could not load the site logo.",
                );
            }
        })();
        return () => { cancelled = true; if (loaded) releaseImages([loaded]); };
    }, [jwt]);

    // ── music library ───────────────────────────────────────
    // Tracks come from the shared audio library, which holds foreign URLs and
    // uploaded files side by side; both expose a playable `url`, so nothing
    // here branches on which kind a track is.
    const loadTracks = useCallback(async () => {
        if (!jwt) return;
        setTracksLoading(true);
        try {
            const res = await SocialAudioTracksEndpoints.active();
            setTracks(res.data || []);
        } catch (err) {
            console.error("Failed to load audio tracks", err);
            toast(
                /40[13]/.test(String(err?.response?.status || err?.message))
                    ? "Not allowed to read the audio library — reseed api-provider."
                    : "Failed to load the audio library.",
                "danger",
            );
        } finally {
            setTracksLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadTracks(); }, [loadTracks]);

    const trackUrl = (t) => MediaUtilsEndpoints.strapiImageUrl(t.audio_file || t.url);

    // Plain <audio> for auditioning — no need to decode a whole buffer to hear it.
    const previewTrack = (track) => {
        const el = trackAudioRef.current;
        if (!el) return;
        if (previewingId === track.documentId) { el.pause(); setPreviewingId(null); return; }
        el.src = trackUrl(track);
        el.play().then(() => setPreviewingId(track.documentId)).catch(() => toast("Could not play that track.", "warning"));
    };

    /**
     * The decoded track for a render, honouring the mode. 'random' picks a fresh
     * one per call, which is what makes an unattended batch varied rather than
     * twenty copies of the same clip. Decoded buffers are cached — a batch would
     * otherwise re-download and re-decode the same file for every post.
     */
    const audioForRender = useCallback(async () => {
        const mode = options.audioMode;
        if (mode === "none" || !tracks.length) return null;
        const track = mode === "random"
            ? tracks[Math.floor(Math.random() * tracks.length)]
            : tracks.find((t) => String(t.documentId) === String(options.audioTrackId));
        // Say so rather than quietly rendering in silence — and say WHICH of the
        // two it is, because "pick a track" and "the track you picked is gone"
        // need different actions from the user.
        if (!track) {
            toast(
                options.audioTrackId
                    ? "The chosen track is no longer in rotation — rendering without music."
                    : "No track chosen yet — pick one below, or switch to Random.",
                "warning",
            );
            return null;
        }
        try {
            let buffer = bufferCache.current.get(track.documentId);
            if (!buffer) {
                buffer = await loadAudioTrack(trackUrl(track));
                bufferCache.current.set(track.documentId, buffer);
            }
            const offset = options.audioRandomStart && buffer.duration > 12
                ? Math.random() * Math.max(0, buffer.duration - 8)
                : 0;
            return {
                buffer, offset, track,
                // A per-track trim wins over the studio slider: it exists
                // precisely because one track is mastered louder than the rest.
                // Coerced because `volume` is a DECIMAL column and the driver
                // returns those as strings.
                volume: Number.isFinite(Number(track.volume)) && track.volume !== null
                    ? Number(track.volume)
                    : options.audioVolume,
                fadeIn: options.audioFadeIn,
                fadeOut: options.audioFadeOut,
            };
        } catch (err) {
            console.error("Failed to decode the track", err);
            toast(`Could not use “${track.name}” — rendering without music.`, "warning");
            return null;
        }
    }, [options, tracks, toast]);

    const candidates = useMemo(() => {
        const q = search.trim().toLowerCase();
        return posts.filter((p) => {
            if (onlyCandidates && !isImageOnly(p)) return false;
            if (!onlyCandidates && imageItems(p).length === 0) return false;
            if (!q) return true;
            return `${p.title || ""} ${p.body || ""}`.toLowerCase().includes(q);
        });
    }, [posts, onlyCandidates, search]);

    // ── image loading for the selected post ─────────────────
    const releaseLoaded = useCallback(() => {
        releaseImages(loadedRef.current);
        loadedRef.current = [];
    }, []);

    useEffect(() => () => { releaseLoaded(); cancelAnimationFrame(previewRaf.current); }, [releaseLoaded]);

    const selectPost = useCallback(async (post) => {
        cancelAnimationFrame(previewRaf.current);
        setPlaying(false);
        setPreviewTime(0);
        setResult((r) => { if (r?.url) URL.revokeObjectURL(r.url); return null; });
        releaseLoaded();
        setImages([]);
        setImageErrors([]);
        setPlan(null);
        setBodyOverride(null);
        setSelected(post);
        if (!post) return;

        const urls = imageItems(post).map((m) => MediaUtilsEndpoints.strapiImageUrl(m));
        if (!urls.length) { toast("That post has no images to work with.", "warning"); return; }

        setLoadingImages(true);
        try {
            const { images: loaded, failures } = await loadImages(urls);
            loadedRef.current = loaded;
            setImages(loaded);
            setImageErrors(failures);
            if (!loaded.length) toast("None of this post's images could be loaded.", "danger");
            else if (failures.length) toast(`${failures.length} image(s) could not be loaded — carrying on with ${loaded.length}.`, "warning");
        } catch (err) {
            if (err?.name !== "AbortError") {
                console.error("Failed to load images", err);
                toast("Failed to load the post images.", "danger");
            }
        } finally {
            setLoadingImages(false);
        }
    }, [releaseLoaded, toast]);

    // Deep link from the post editor: /posts/video-studio?post=<documentId>
    const autoSelected = useRef(false);
    useEffect(() => {
        if (autoSelected.current || !router.isReady || !posts.length) return;
        const want = router.query.post;
        if (!want) return;
        const match = posts.find((p) => p.documentId === want);
        if (match) { autoSelected.current = true; selectPost(match); }
    }, [router.isReady, router.query.post, posts, selectPost]);

    // ── plan + repaint on any change ────────────────────────
    const captionText = bodyOverride ?? (selected?.body || "");

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !selected || !images.length) { setPlan(null); return; }
        const p = buildPlan({
            canvas,
            images,
            title: selected.title,
            body: captionText,
            logo,
            options,
        });
        setPlan(p);
        paintFrame(canvas.getContext("2d"), p, Math.min(previewTime, p.duration));
        // previewTime is deliberately not a dependency: repainting on every
        // scrub tick would rebuild the whole plan (and re-wrap the text) 60
        // times a second. The scrub effect below repaints on its own.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, images, captionText, options, logo]);

    useEffect(() => {
        if (!plan || playing || rendering) return;
        paintFrame(canvasRef.current.getContext("2d"), plan, previewTime);
    }, [previewTime, plan, playing, rendering]);

    // ── preview playback ────────────────────────────────────
    const stopPreview = useCallback(() => {
        cancelAnimationFrame(previewRaf.current);
        setPlaying(false);
    }, []);

    const togglePreview = () => {
        if (playing) { stopPreview(); return; }
        if (!plan) return;
        const from = previewTime >= plan.duration - 0.05 ? 0 : previewTime;
        previewStart.current = performance.now() - from * 1000;
        setPlaying(true);
        const step = () => {
            const t = (performance.now() - previewStart.current) / 1000;
            if (t >= plan.duration) {
                paintFrame(canvasRef.current.getContext("2d"), plan, plan.duration);
                setPreviewTime(plan.duration);
                setPlaying(false);
                return;
            }
            paintFrame(canvasRef.current.getContext("2d"), plan, t);
            setPreviewTime(t);
            previewRaf.current = requestAnimationFrame(step);
        };
        previewRaf.current = requestAnimationFrame(step);
    };

    // ── render ──────────────────────────────────────────────
    const doRender = async (thePlan) => {
        stopPreview();
        // Auditioning a track leaves it playing straight into the speakers; it is
        // not part of the recorded stream, but it is distracting and the user
        // will assume it ended up in the file.
        trackAudioRef.current?.pause();
        setPreviewingId(null);
        setRendering(true);
        setProgress(0);
        abortRef.current = new AbortController();
        try {
            const audio = await audioForRender();
            const out = await renderVideo({
                canvas: canvasRef.current,
                plan: thePlan,
                audio,
                onProgress: setProgress,
                signal: abortRef.current.signal,
            });
            return { ...out, url: URL.createObjectURL(out.blob), trackName: audio?.track?.name || null };
        } finally {
            setRendering(false);
            abortRef.current = null;
        }
    };

    const handleRender = async () => {
        if (!plan) return;
        try {
            setResult((r) => { if (r?.url) URL.revokeObjectURL(r.url); return null; });
            const out = await doRender(plan);
            setResult(out);
            setPreviewTime(0);
            // A big frame shortfall means the browser throttled the render loop
            // — almost always because the tab went to the background. The file
            // is the right length and the audio is in sync; it just judders. Say
            // so, because it is invisible until someone watches the result.
            const short = out.expectedFrames && out.frames < out.expectedFrames * 0.8;
            toast(
                `Video ready — ${fmtSeconds(out.duration)}, ${fmtBytes(out.blob.size)}`
                + (out.trackName ? `, music: ${out.trackName}` : "")
                + (short
                    ? `. Only ${out.frames} of ${out.expectedFrames} frames were captured — keep this tab in front and re-render for a smooth result.`
                    : "."),
                short ? "warning" : "success",
            );
        } catch (err) {
            if (err?.name === "AbortError") { toast("Render cancelled.", "warning"); return; }
            console.error("Render failed", err);
            toast(err?.message || "Render failed.", "danger");
        }
    };

    const cancelRender = () => { abortRef.current?.abort(); };

    // ── attach to the post ──────────────────────────────────
    const attachToPost = async (post, out, publishToo) => {
        const name = videoFileName(post, out.extension);
        const file = new File([out.blob], name, { type: out.mimeType });
        const uploaded = await UploadEndpoints.uploadFiles([file], null, null, null, {
            name, alt: post.title || null, caption: null,
        });
        const ids = (Array.isArray(uploaded) ? uploaded : [uploaded]).map((f) => f?.id).filter(Boolean);
        if (!ids.length) throw new Error("Upload returned no file id.");

        const existing = (post.video || []).map((v) => v.id).filter(Boolean);
        await SocialPostsEndpoints.updateDraft(post.documentId, { data: { video: [...existing, ...ids] } });
        // The draft is what we just wrote; the poster and the public API read the
        // PUBLISHED copy, so a post that is already live needs re-publishing or
        // the video it now owns is invisible to everything downstream. A post
        // with no published copy is left alone — publishing it here would put an
        // unfinished draft in front of the poster.
        const republished = !!(publishToo && post._isPublished);
        if (republished) await SocialPostsEndpoints.publish(post.documentId);
        return { ids, republished };
    };

    // Reflect the new video locally so the row flips to "has video" and the
    // Attach button can't fire twice against the same render.
    const markAttached = (documentId, ids) => {
        const add = (p) => (p.documentId === documentId
            ? { ...p, video: [...(p.video || []), ...ids.map((id) => ({ id }))] }
            : p);
        setPosts((list) => list.map(add));
        setSelected((s) => (s ? add(s) : s));
    };

    const handleAttach = async () => {
        if (!result || !selected) return;
        setAttaching(true);
        try {
            const { ids, republished } = await attachToPost(selected, result, alsoPublish);
            markAttached(selected.documentId, ids);
            setResult((r) => { if (r?.url) URL.revokeObjectURL(r.url); return null; });
            toast(
                `Attached to “${selected.title}”${republished ? " and re-published" : " — the post stays a draft"}.`,
                "success",
            );
        } catch (err) {
            console.error("Failed to attach video", err);
            toast(err?.response?.data?.error?.message || err?.message || "Failed to attach the video.", "danger");
        } finally {
            setAttaching(false);
        }
    };

    // ── batch ───────────────────────────────────────────────
    const runBatch = async () => {
        const queue = candidates.filter(isImageOnly);
        if (!queue.length) { toast("Nothing pending — every listed post already has a video.", "info"); return; }
        const estimate = queue.length * (plan?.duration || options.secondsPerImage * 3);
        if (!confirm(
            `Render and attach a video for ${queue.length} post(s)?\n\n`
            + `Encoding runs in real time, so this will take roughly ${fmtSeconds(estimate)} `
            + `and this tab has to stay in the foreground the whole time.`
        )) return;

        batchCancelRef.current = false;
        const state = { total: queue.length, done: 0, current: "" };
        setBatch({ ...state });
        let ok = 0, failed = 0;

        for (const post of queue) {
            if (batchCancelRef.current) break;
            state.current = post.title || post.documentId;
            setBatch({ ...state });
            let loaded = [];
            try {
                const urls = imageItems(post).map((m) => MediaUtilsEndpoints.strapiImageUrl(m));
                const { images: imgs } = await loadImages(urls);
                loaded = imgs;
                if (!imgs.length) throw new Error("no images could be loaded");
                const p = buildPlan({ canvas: canvasRef.current, images: imgs, title: post.title, body: post.body, logo, options });
                const out = await doRender(p);
                const { ids } = await attachToPost(post, out, alsoPublish);
                URL.revokeObjectURL(out.url);
                markAttached(post.documentId, ids);
                ok++;
            } catch (err) {
                if (err?.name === "AbortError") { batchCancelRef.current = true; }
                else { console.error(`Batch failed for ${post.documentId}`, err); failed++; }
            } finally {
                releaseImages(loaded);
            }
            state.done++;
            setBatch({ ...state });
        }

        const stoppedEarly = batchCancelRef.current;
        batchCancelRef.current = false;
        setBatch(null);
        toast(
            `Batch finished — ${ok} video(s) attached${failed ? `, ${failed} failed` : ""}${stoppedEarly ? " (stopped early)" : ""}.`,
            failed ? "warning" : "success",
        );
    };

    // Stops the loop after the current item, and aborts the render in flight.
    const cancelBatch = () => {
        batchCancelRef.current = true;
        abortRef.current?.abort();
    };

    // ── render helpers ──────────────────────────────────────
    const aspect = ASPECTS[options.aspect] || ASPECTS.vertical;
    const busy = rendering || !!batch;
    const pendingCount = candidates.filter(isImageOnly).length;

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <ToastContainer />

                <div className="d-flex align-items-center flex-wrap gap-2 mb-3">
                    <Link className="btn btn-sm btn-outline-secondary" href="/posts"><i className="fas fa-arrow-left" /> Posts</Link>
                    <h2 className="mb-0"><i className="fas fa-film me-2" />Video Studio</h2>
                    <span className="badge bg-secondary align-self-center">{candidates.length} listed</span>
                    {pendingCount > 0 && <span className="badge bg-warning text-dark align-self-center">{pendingCount} without a video</span>}
                    <div className="ms-auto d-flex gap-2">
                        {batch ? (
                            <button className="btn btn-sm btn-danger" onClick={cancelBatch}>
                                <i className="fas fa-stop me-1" />Stop batch ({batch.done}/{batch.total})
                            </button>
                        ) : (
                            <button className="btn btn-sm btn-outline-primary" onClick={runBatch} disabled={busy || !!blocked || !pendingCount}>
                                <i className="fas fa-layer-group me-1" />Render all pending
                            </button>
                        )}
                        <button className="btn btn-sm btn-outline-secondary" onClick={loadPosts} disabled={loading || busy}>
                            <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                {blocked && (
                    <div className="alert alert-danger py-2">
                        <i className="fas fa-triangle-exclamation me-2" />{blocked}
                    </div>
                )}

                {batch && (
                    <div className="alert alert-info py-2">
                        <div className="d-flex align-items-center gap-2">
                            <span className="spinner-border spinner-border-sm" />
                            <strong>Batch {batch.done}/{batch.total}</strong>
                            <span className="text-truncate">— {batch.current}</span>
                        </div>
                        <div className="progress mt-2" style={{ height: 6 }}>
                            <div className="progress-bar bg-info" style={{ width: `${(batch.done / batch.total) * 100}%` }} />
                        </div>
                        <small className="text-muted">Keep this tab in the foreground — encoding stalls in a background tab.</small>
                    </div>
                )}

                <div className="row g-3">
                    {/* ── post picker ── */}
                    <div className="col-lg-4">
                        <div className="card">
                            <div className="card-header py-2">
                                <div className="input-group input-group-sm mb-2">
                                    <span className="input-group-text"><i className="fas fa-search" /></span>
                                    <input className="form-control" placeholder="Search posts…" value={search} onChange={(e) => setSearch(e.target.value)} />
                                </div>
                                <div className="form-check form-switch mb-0">
                                    <input className="form-check-input" type="checkbox" id="only-candidates"
                                        checked={onlyCandidates} onChange={(e) => setOnlyCandidates(e.target.checked)} />
                                    <label className="form-check-label small" htmlFor="only-candidates">
                                        Only posts with images and no video
                                    </label>
                                </div>
                            </div>
                            <div className="list-group list-group-flush" style={{ maxHeight: "72vh", overflowY: "auto" }}>
                                {loading && <div className="p-3 text-center"><div className="spinner-border spinner-border-sm" /></div>}
                                {!loading && candidates.length === 0 && (
                                    <div className="p-3 text-muted small">
                                        {onlyCandidates
                                            ? "No image-only posts. Every post with images already has a video attached."
                                            : "No posts with images."}
                                    </div>
                                )}
                                {candidates.map((p) => {
                                    const imgs = imageItems(p);
                                    const done = !isImageOnly(p);
                                    const active = selected?.documentId === p.documentId;
                                    const thumb = imgs[0];
                                    const needsVideo = (p.platforms || []).filter((x) => VIDEO_ONLY.includes(x));
                                    const likesVideo = (p.platforms || []).filter((x) => VIDEO_PREFERRED.includes(x));
                                    return (
                                        <button key={p.documentId} type="button" disabled={busy}
                                            className={`list-group-item list-group-item-action d-flex gap-2 ${active ? "active" : ""}`}
                                            onClick={() => selectPost(p)}>
                                            {thumb ? (
                                                <img src={MediaUtilsEndpoints.strapiImageUrl(thumb.formats?.thumbnail || thumb)} alt=""
                                                    style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 6, flex: "0 0 auto" }} />
                                            ) : (
                                                <span className="d-inline-flex align-items-center justify-content-center bg-light text-muted"
                                                    style={{ width: 46, height: 46, borderRadius: 6, flex: "0 0 auto" }}><i className="fas fa-image" /></span>
                                            )}
                                            <span className="flex-grow-1 text-truncate">
                                                <span className="d-block text-truncate fw-semibold">{p.title || "(untitled)"}</span>
                                                <span className={`d-block small text-truncate ${active ? "text-white-50" : "text-muted"}`}>
                                                    {imgs.length} image{imgs.length === 1 ? "" : "s"}
                                                    {done && <> · <i className="fas fa-check" /> has video</>}
                                                </span>
                                                <span className="d-block mt-1">
                                                    {needsVideo.map((x) => (
                                                        <span key={x} className="badge bg-danger me-1" style={{ fontSize: 9 }}>
                                                            {PLATFORMS[x]?.label || x} needs video
                                                        </span>
                                                    ))}
                                                    {likesVideo.map((x) => (
                                                        <span key={x} className="badge bg-secondary me-1" style={{ fontSize: 9 }}>
                                                            {PLATFORMS[x]?.label || x}
                                                        </span>
                                                    ))}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ── preview + controls ── */}
                    <div className="col-lg-8">
                        <div className="row g-3">
                            <div className="col-xl-6">
                                <div className="card h-100">
                                    <div className="card-header py-2 d-flex align-items-center">
                                        <i className="fas fa-eye me-2" />Preview
                                        {plan && <span className="badge bg-secondary ms-2">{aspect.width}×{aspect.height}</span>}
                                        {plan && <span className="badge bg-info ms-1">{fmtSeconds(plan.duration)}</span>}
                                        {plan?.spedUp && (
                                            <span className="badge bg-warning text-dark ms-1"
                                                title={`The caption needs more than ${options.maxSeconds}s at ${options.charsPerSecond} chars/sec, so it types faster to fit.`}>
                                                typing sped up
                                            </span>
                                        )}
                                    </div>
                                    <div className="card-body d-flex flex-column align-items-center">
                                        <div className="bg-dark rounded w-100 d-flex justify-content-center" style={{ minHeight: 220 }}>
                                            <canvas ref={canvasRef}
                                                style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "58vh", display: "block" }} />
                                        </div>

                                        {loadingImages && <div className="mt-3"><span className="spinner-border spinner-border-sm me-2" />Loading images…</div>}
                                        {!selected && !loadingImages && <p className="text-muted mt-3 mb-0">Pick a post on the left.</p>}

                                        {plan && (
                                            <div className="w-100 mt-3">
                                                <div className="d-flex align-items-center gap-2">
                                                    <button className="btn btn-sm btn-outline-primary" onClick={togglePreview} disabled={busy}>
                                                        <i className={`fas ${playing ? "fa-pause" : "fa-play"}`} />
                                                    </button>
                                                    <input type="range" className="form-range flex-grow-1"
                                                        min={0} max={plan.duration} step={0.05}
                                                        value={Math.min(previewTime, plan.duration)}
                                                        onChange={(e) => { stopPreview(); setPreviewTime(Number(e.target.value)); }}
                                                        disabled={busy} />
                                                    <small className="text-muted" style={{ minWidth: 74, textAlign: "right" }}>
                                                        {fmtSeconds(previewTime)} / {fmtSeconds(plan.duration)}
                                                    </small>
                                                </div>
                                            </div>
                                        )}

                                        {rendering && (
                                            <div className="w-100 mt-3">
                                                <div className="progress" style={{ height: 8 }}>
                                                    <div className="progress-bar progress-bar-striped progress-bar-animated"
                                                        style={{ width: `${Math.round(progress * 100)}%` }} />
                                                </div>
                                                <div className="d-flex justify-content-between mt-1">
                                                    <small className="text-muted">Encoding in real time — leave this tab in front.</small>
                                                    <button className="btn btn-sm btn-link text-danger p-0" onClick={cancelRender}>Cancel</button>
                                                </div>
                                            </div>
                                        )}

                                        {imageErrors.length > 0 && (
                                            <div className="alert alert-warning w-100 mt-3 py-2 mb-0 small">
                                                <strong>{imageErrors.length} image(s) skipped:</strong>
                                                <ul className="mb-0 ps-3">
                                                    {imageErrors.slice(0, 3).map((e) => <li key={e.url} className="text-break">{e.url.split("/").pop()} — {e.error}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </div>

                                    <div className="card-footer d-flex flex-wrap gap-2 align-items-center">
                                        <button className="btn btn-sm btn-primary" onClick={handleRender} disabled={!plan || busy || !!blocked}>
                                            <i className="fas fa-clapperboard me-1" />
                                            {rendering ? "Rendering…" : `Render ${plan ? fmtSeconds(plan.duration) : ""}`}
                                        </button>
                                        {result && (
                                            <>
                                                <a className="btn btn-sm btn-outline-secondary" href={result.url}
                                                    download={videoFileName(selected, result.extension)}>
                                                    <i className="fas fa-download me-1" />Download
                                                </a>
                                                <button className="btn btn-sm btn-success" onClick={handleAttach} disabled={attaching || busy}>
                                                    {attaching ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="fas fa-paperclip me-1" />}
                                                    Attach to post
                                                </button>
                                                <span className="badge bg-light text-dark">{fmtBytes(result.blob.size)} · {result.extension.toUpperCase()}</span>
                                                {result.hasAudio && (
                                                    <span className="badge bg-info text-dark text-truncate" style={{ maxWidth: 180 }}
                                                        title={result.trackName || "music"}>
                                                        <i className="fas fa-music me-1" />{result.trackName || "music"}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                        <div className="form-check form-switch ms-auto mb-0">
                                            <input className="form-check-input" type="checkbox" id="also-publish"
                                                checked={alsoPublish} onChange={(e) => setAlsoPublish(e.target.checked)} />
                                            <label className="form-check-label small" htmlFor="also-publish"
                                                title="Posts that are already live are re-published so the poster and the public API see the new video. Drafts are never published by this.">
                                                Re-publish already-live posts
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── settings ── */}
                            <div className="col-xl-6">
                                <div className="card mb-3">
                                    <div className="card-header py-2"><i className="fas fa-sliders me-2" />Look</div>
                                    <div className="card-body">
                                        <label className="form-label small mb-1">Shape</label>
                                        <div className="btn-group btn-group-sm w-100 mb-3">
                                            {Object.values(ASPECTS).map((a) => (
                                                <button key={a.key} type="button" title={a.hint} disabled={busy}
                                                    className={`btn ${options.aspect === a.key ? "btn-primary" : "btn-outline-secondary"}`}
                                                    onClick={() => setOpt({ aspect: a.key })}>{a.label}</button>
                                            ))}
                                        </div>

                                        <div className="row g-2">
                                            <div className="col-6">
                                                <label className="form-label small mb-1">Theme</label>
                                                <select className="form-select form-select-sm" value={options.theme} disabled={busy}
                                                    onChange={(e) => setOpt({ theme: e.target.value })}>
                                                    {Object.values(THEMES).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-6">
                                                <label className="form-label small mb-1">Image fit</label>
                                                <select className="form-select form-select-sm" value={options.fit} disabled={busy}
                                                    onChange={(e) => setOpt({ fit: e.target.value })}>
                                                    <option value="blur">Whole image, blurred fill</option>
                                                    <option value="cover">Fill the frame (crops)</option>
                                                </select>
                                            </div>
                                            <div className="col-6">
                                                <label className="form-label small mb-1">Caption position</label>
                                                <select className="form-select form-select-sm" value={options.textPosition} disabled={busy}
                                                    onChange={(e) => setOpt({ textPosition: e.target.value })}>
                                                    <option value="bottom">Bottom</option>
                                                    <option value="middle">Middle</option>
                                                </select>
                                            </div>
                                            <div className="col-6">
                                                <label className="form-label small mb-1">Quality</label>
                                                <select className="form-select form-select-sm" value={options.quality} disabled={busy}
                                                    onChange={(e) => setOpt({ quality: e.target.value })}>
                                                    <option value="high">High</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="low">Low (smaller file)</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="d-flex flex-wrap gap-3 mt-3">
                                            <div className="form-check form-switch">
                                                <input className="form-check-input" type="checkbox" id="opt-kb" checked={options.kenBurns} disabled={busy}
                                                    onChange={(e) => setOpt({ kenBurns: e.target.checked })} />
                                                <label className="form-check-label small" htmlFor="opt-kb">Slow zoom</label>
                                            </div>
                                            <div className="form-check form-switch">
                                                <input className="form-check-input" type="checkbox" id="opt-title" checked={options.showTitle} disabled={busy}
                                                    onChange={(e) => setOpt({ showTitle: e.target.checked })} />
                                                <label className="form-check-label small" htmlFor="opt-title">Title card</label>
                                            </div>
                                            <div className="form-check form-switch">
                                                <input className="form-check-input" type="checkbox" id="opt-prog" checked={options.showProgress} disabled={busy}
                                                    onChange={(e) => setOpt({ showProgress: e.target.checked })} />
                                                <label className="form-check-label small" htmlFor="opt-prog">Progress bar</label>
                                            </div>
                                        </div>

                                        <label className="form-label small mb-1 mt-3">Footer line (optional)</label>
                                        <input className="form-control form-control-sm" value={options.footer} disabled={busy}
                                            placeholder="rutba.pk" onChange={(e) => setOpt({ footer: e.target.value })} />
                                    </div>
                                </div>

                                {/* ── brand mark ── */}
                                <div className="card mb-3">
                                    <div className="card-header py-2 d-flex align-items-center">
                                        <i className="fas fa-copyright me-2" />Logo
                                        {logo && <span className="badge bg-success ms-2">from site settings</span>}
                                        {!logo && logoError && <span className="badge bg-warning text-dark ms-2">unavailable</span>}
                                    </div>
                                    <div className="card-body">
                                        {logoError && <div className="alert alert-warning py-2 small">{logoError}</div>}
                                        <div className="d-flex align-items-center gap-3 mb-2">
                                            {logo && (
                                                <img src={logo.objectUrl} alt="Site logo"
                                                    style={{ width: 64, height: 40, objectFit: "contain", background: "#222", borderRadius: 4, padding: 4 }} />
                                            )}
                                            <div className="form-check form-switch mb-0">
                                                <input className="form-check-input" type="checkbox" id="opt-logo" disabled={busy || !logo}
                                                    checked={options.showLogo && !!logo}
                                                    onChange={(e) => setOpt({ showLogo: e.target.checked })} />
                                                <label className="form-check-label small" htmlFor="opt-logo">Show on the video</label>
                                            </div>
                                        </div>
                                        {options.showLogo && logo && (
                                            <>
                                                <label className="form-label small mb-1">Corner</label>
                                                <select className="form-select form-select-sm mb-2" value={options.logoPosition} disabled={busy}
                                                    onChange={(e) => setOpt({ logoPosition: e.target.value })}>
                                                    <option value="top-left">Top left</option>
                                                    <option value="top-right">Top right</option>
                                                    <option value="bottom-left">Bottom left</option>
                                                    <option value="bottom-right">Bottom right</option>
                                                </select>
                                                <RangeRow label="Size" value={options.logoScale} min={0.06} max={0.32} step={0.01}
                                                    suffix="× width" disabled={busy} onChange={(v) => setOpt({ logoScale: v })} />
                                                <RangeRow label="Opacity" value={options.logoOpacity} min={0.2} max={1} step={0.02}
                                                    suffix="" disabled={busy} onChange={(v) => setOpt({ logoOpacity: v })} />
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* ── music ── */}
                                <div className="card mb-3">
                                    <div className="card-header py-2 d-flex align-items-center">
                                        <i className="fas fa-music me-2" />Music
                                        {tracks.length > 0 && <span className="badge bg-secondary ms-2">{tracks.length} in rotation</span>}
                                        <Link className="btn btn-sm btn-link ms-auto p-0" href="/audio">Manage library →</Link>
                                    </div>
                                    <div className="card-body">
                                        <div className="btn-group btn-group-sm w-100 mb-2">
                                            {[
                                                { k: "none", label: "None" },
                                                { k: "pick", label: "Chosen track" },
                                                { k: "random", label: "Random" },
                                            ].map((m) => (
                                                <button key={m.k} type="button" disabled={busy}
                                                    className={`btn ${options.audioMode === m.k ? "btn-primary" : "btn-outline-secondary"}`}
                                                    onClick={() => setOpt({ audioMode: m.k })}>{m.label}</button>
                                            ))}
                                        </div>
                                        {options.audioMode === "random" && (
                                            <p className="text-muted small mb-2">
                                                A different track is drawn for every video, including each one in a batch run.
                                            </p>
                                        )}

                                        {options.audioMode !== "none" && (
                                            <>
                                                {tracksLoading && <div className="text-center py-2"><span className="spinner-border spinner-border-sm" /></div>}
                                                {!tracksLoading && tracks.length === 0 && (
                                                    <div className="alert alert-secondary py-2 small mb-2">
                                                        No tracks in rotation.{" "}
                                                        <Link href="/audio">Add some to the audio library</Link> — a URL or an upload, either works.
                                                    </div>
                                                )}
                                                {tracks.length > 0 && (
                                                    <div className="list-group list-group-flush mb-2" style={{ maxHeight: 190, overflowY: "auto" }}>
                                                        {tracks.map((t) => {
                                                            const chosen = options.audioMode === "pick" && String(options.audioTrackId) === String(t.documentId);
                                                            return (
                                                                <div key={t.documentId} className={`list-group-item d-flex align-items-center gap-2 py-1 px-2 ${chosen ? "list-group-item-primary" : ""}`}>
                                                                    <button className="btn btn-sm btn-link p-0" title="Listen" disabled={busy}
                                                                        onClick={() => previewTrack(t)}>
                                                                        <i className={`fas ${previewingId === t.documentId ? "fa-pause" : "fa-play"}`} />
                                                                    </button>
                                                                    <span className="flex-grow-1 text-truncate small" title={t.credit || t.name}>
                                                                        {t.name}
                                                                        {!t.audio_file?.id && <i className="fas fa-link ms-1 text-muted" title="foreign URL" style={{ fontSize: 10 }} />}
                                                                    </span>
                                                                    {options.audioMode === "pick" && (
                                                                        <button className={`btn btn-sm ${chosen ? "btn-primary" : "btn-outline-secondary"}`}
                                                                            disabled={busy} onClick={() => setOpt({ audioTrackId: t.documentId })}>
                                                                            {chosen ? <i className="fas fa-check" /> : "Use"}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                <RangeRow label="Volume" value={options.audioVolume} min={0} max={1} step={0.05}
                                                    suffix="" disabled={busy} onChange={(v) => setOpt({ audioVolume: v })} />
                                                <RangeRow label="Fade in" value={options.audioFadeIn} min={0} max={4} step={0.1}
                                                    suffix="s" disabled={busy} onChange={(v) => setOpt({ audioFadeIn: v })} />
                                                <RangeRow label="Fade out" value={options.audioFadeOut} min={0} max={4} step={0.1}
                                                    suffix="s" disabled={busy} onChange={(v) => setOpt({ audioFadeOut: v })} />
                                                <div className="form-check form-switch">
                                                    <input className="form-check-input" type="checkbox" id="opt-randstart" disabled={busy}
                                                        checked={options.audioRandomStart}
                                                        onChange={(e) => setOpt({ audioRandomStart: e.target.checked })} />
                                                    <label className="form-check-label small" htmlFor="opt-randstart">
                                                        Start at a random point in the track
                                                    </label>
                                                </div>
                                                <p className="text-muted small mb-0 mt-2">
                                                    Music is heard in the finished file, not in the preview above — the preview draws
                                                    frames only.
                                                </p>
                                            </>
                                        )}
                                        <audio ref={trackAudioRef} className="d-none" onEnded={() => setPreviewingId(null)} />
                                    </div>
                                </div>

                                <div className="card mb-3">
                                    <div className="card-header py-2"><i className="fas fa-stopwatch me-2" />Timing</div>
                                    <div className="card-body">
                                        <RangeRow label="Seconds per image" value={options.secondsPerImage} min={1.5} max={8} step={0.5}
                                            suffix="s" disabled={busy} onChange={(v) => setOpt({ secondsPerImage: v })} />
                                        <RangeRow label="Crossfade" value={options.fadeSeconds} min={0} max={2} step={0.1}
                                            suffix="s" disabled={busy} onChange={(v) => setOpt({ fadeSeconds: v })} />
                                        <RangeRow label="Typing speed" value={options.charsPerSecond} min={4} max={45} step={1}
                                            suffix=" chars/s" disabled={busy} onChange={(v) => setOpt({ charsPerSecond: v })} />
                                        <RangeRow label="Text size" value={options.fontScale} min={0.7} max={1.5} step={0.05}
                                            suffix="×" disabled={busy} onChange={(v) => setOpt({ fontScale: v })} />
                                        <RangeRow label="Maximum length" value={options.maxSeconds} min={10} max={180} step={5}
                                            suffix="s" disabled={busy} onChange={(v) => setOpt({ maxSeconds: v })} />
                                        <RangeRow label="Frame rate" value={options.fps} min={15} max={60} step={5}
                                            suffix=" fps" disabled={busy} onChange={(v) => setOpt({ fps: v })} />
                                        <p className="text-muted small mb-0">
                                            The video runs for whichever is longer — the images, or the time the caption needs to type out in full.
                                        </p>
                                    </div>
                                </div>

                                {selected && (
                                    <div className="card">
                                        <div className="card-header py-2 d-flex align-items-center">
                                            <i className="fas fa-keyboard me-2" />Caption
                                            <Link className="btn btn-sm btn-link ms-auto p-0" href={`/posts/${selected.documentId}`}>Edit the post →</Link>
                                        </div>
                                        <div className="card-body">
                                            <textarea className="form-control form-control-sm" rows={5} disabled={busy}
                                                value={captionText} onChange={(e) => setBodyOverride(e.target.value)} />
                                            <div className="d-flex justify-content-between mt-1">
                                                <small className="text-muted">{captionText.length} characters — changes here affect the video only, not the post.</small>
                                                {bodyOverride !== null && (
                                                    <button className="btn btn-sm btn-link p-0" onClick={() => setBodyOverride(null)} disabled={busy}>Reset</button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

function RangeRow({ label, value, min, max, step, suffix, disabled, onChange }) {
    return (
        <div className="mb-2">
            <div className="d-flex justify-content-between">
                <label className="form-label small mb-0">{label}</label>
                <small className="text-muted">{value}{suffix}</small>
            </div>
            <input type="range" className="form-range" min={min} max={max} step={step} value={value} disabled={disabled}
                onChange={(e) => onChange(Number(e.target.value))} />
        </div>
    );
}
