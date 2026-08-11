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
 *
 * Browsing posts happens on /posts (each card deep-links here with ?post=…);
 * this page is the editor plus the batch runner, nothing more.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    MediaUtilsEndpoints, SocialPostsEndpoints, UploadEndpoints,
    SiteSettingEndpoints, SocialAudioTracksEndpoints, SocialVideoTemplatesEndpoints,
} from "@rutba/api-provider/endpoints";
import { useToast } from "../../components/Toast";
import {
    ASPECTS, THEMES, DEFAULTS,
    buildPlan, paintFrame, renderVideo, loadImage, loadImages, releaseImages,
    loadAudioTrack, setMediaAuth, layerBounds, hitTestLayers,
    imageItems, isImageOnly, unsupportedReason, videoFileName,
} from "../../lib/video-maker";

// Friendly names for the compiled layers in the panel.
const LAYER_LABELS = {
    slideshow: "Photos", gradient: "Caption shade", caption: "Caption",
    title: "Title card", logo: "Logo", footer: "Footer",
    outro: "Outro card", progress: "Progress bar", edges: "Fade in/out",
};

// The nine focal-point presets: where a cover crop keeps the subject.
const FOCAL_PRESETS = [
    { k: "tl", fx: 0, fy: 0 }, { k: "t", fx: 0.5, fy: 0 }, { k: "tr", fx: 1, fy: 0 },
    { k: "l", fx: 0, fy: 0.5 }, { k: "c", fx: 0.5, fy: 0.5 }, { k: "r", fx: 1, fy: 0.5 },
    { k: "bl", fx: 0, fy: 1 }, { k: "b", fx: 0.5, fy: 1 }, { k: "br", fx: 1, fy: 1 },
];

const urlPath = (u) => { try { return new URL(u, "http://x").pathname; } catch { return u; } };

const SETTINGS_KEY = "rutba-social-video-studio";
const FETCH_PAGE = 50;
const MAX_PAGES = 20;

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

    const [selected, setSelected] = useState(null);
    const [images, setImages] = useState([]);
    const [imageErrors, setImageErrors] = useState([]);
    const [loadingImages, setLoadingImages] = useState(false);

    const [options, setOptions] = useState(DEFAULTS);
    const [bodyOverride, setBodyOverride] = useState(null); // edited caption, not saved to the post
    const [plan, setPlan] = useState(null);

    // Templates: named looks stored server-side, shared with the Social Poster.
    // templateId is provenance; the options snapshot is what actually renders,
    // so editing a template later never silently changes an old post's recipe.
    const [templates, setTemplates] = useState([]);
    const [templateId, setTemplateId] = useState(null);
    const [layerPatches, setLayerPatches] = useState(null);
    const [savingTemplate, setSavingTemplate] = useState(false);

    // The editor: which layer is selected (panel + canvas outline + drag), and
    // the per-image arrangement (order, exclusion, seconds, focal point).
    const [selectedLayerId, setSelectedLayerId] = useState(null);
    const [arrangement, setArrangement] = useState(null); // [{path, seconds, excluded, focal}]
    const dragRef = useRef(null);

    // Layer patches are the single write path for everything the editor does —
    // they persist to video_settings and templates as-is.
    const upsertPatch = useCallback((patch) => setLayerPatches((list) => {
        const arr = [...(list || [])];
        const i = arr.findIndex((p) => p.id === patch.id);
        if (i >= 0) arr[i] = { ...arr[i], ...patch }; else arr.push(patch);
        return arr;
    }), []);
    const removePatchLayer = useCallback((id) => setLayerPatches((list) => {
        const arr = (list || []).filter((p) => p.id !== id);
        return arr.length ? arr : null;
    }), []);

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

    // ── video templates ─────────────────────────────────────
    const loadTemplates = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await SocialVideoTemplatesEndpoints.list();
            setTemplates(res.data || []);
        } catch (err) {
            // A 404 just means the schema is newer than the running server —
            // the studio works fine without templates.
            console.error("Failed to load video templates", err);
        }
    }, [jwt]);

    useEffect(() => { loadTemplates(); }, [loadTemplates]);

    const applyTemplate = (t) => {
        if (!t) { setTemplateId(null); return; }
        setTemplateId(t.documentId);
        setOptions((o) => ({ ...o, ...(t.options || {}), ...(t.aspect ? { aspect: t.aspect } : {}) }));
        setLayerPatches(Array.isArray(t.layers) && t.layers.length ? t.layers : null);
    };

    // The three built-in looks. Created from here rather than seeded so the
    // layer format they carry is always the one THIS renderer understands.
    const BUILTINS = [
        { name: "Classic", description: "Bottom caption panel over the whole photo, blurred fill, branded outro.", is_default: true, aspect: "vertical", options: { textPosition: "bottom", captionStyle: "box", fit: "blur", theme: "dark", showTitle: true, showProgress: true, transition: "fade", outroSeconds: 1.6 } },
        { name: "Card", description: "Centered caption card over full-frame photos, push transitions.", is_default: false, aspect: "vertical", options: { textPosition: "middle", captionStyle: "box", fit: "cover", theme: "dark", showTitle: false, showProgress: true, transition: "push", outroSeconds: 1.6 } },
        { name: "Minimal", description: "Bare shadowed text, hard cuts, no chrome.", is_default: false, aspect: "vertical", options: { textPosition: "bottom", captionStyle: "bare", fit: "cover", theme: "dark", showTitle: false, showProgress: false, transition: "cut", outroSeconds: 0 } },
    ];

    const createBuiltins = async () => {
        setSavingTemplate(true);
        try {
            for (const b of BUILTINS) await SocialVideoTemplatesEndpoints.create({ ...b, layers: [], tags: [] });
            toast("Created the three built-in templates.", "success");
            await loadTemplates();
        } catch (err) {
            console.error("Failed to create built-ins", err);
            toast(err?.response?.data?.error?.message || "Failed to create the templates (server may need a restart for the new route).", "danger");
        } finally {
            setSavingTemplate(false);
        }
    };

    const saveAsTemplate = async () => {
        const name = prompt("Template name:");
        if (!name?.trim()) return;
        setSavingTemplate(true);
        try {
            await SocialVideoTemplatesEndpoints.create({
                name: name.trim(),
                options: { ...options },
                layers: layerPatches || [],
                aspect: options.aspect,
                is_default: false,
                tags: [],
            });
            toast(`Template “${name.trim()}” saved.`, "success");
            await loadTemplates();
        } catch (err) {
            console.error("Failed to save template", err);
            toast("Failed to save the template.", "danger");
        } finally {
            setSavingTemplate(false);
        }
    };

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

    // Browsing posts moved to /posts (every card there deep-links back here).
    // What the studio still needs from the full post set is just the batch
    // queue — image-only posts awaiting a video.
    const pending = useMemo(() => posts.filter(isImageOnly), [posts]);

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
        setSelectedLayerId(null);
        setArrangement(null);
        setSelected(post);
        if (!post) return;

        // A post that has been rendered before carries its full recipe —
        // restore it, so a re-render reproduces the video it already has.
        const vs = post.video_settings;
        if (vs && typeof vs === "object" && vs.options) {
            setOptions((o) => ({ ...o, ...vs.options }));
            setTemplateId(vs.template || null);
            setLayerPatches(Array.isArray(vs.layers) && vs.layers.length ? vs.layers : null);
        }

        const urls = imageItems(post).map((m) => MediaUtilsEndpoints.strapiImageUrl(m));
        if (!urls.length) { toast("That post has no images to work with.", "warning"); return; }

        setLoadingImages(true);
        try {
            const { images: loaded, failures } = await loadImages(urls);
            loaded.forEach((e) => { e.path = urlPath(e.url); });
            // Reconcile any stored arrangement with what actually loaded:
            // stored rows keep their order and settings, images the post gained
            // since are appended, images it lost just drop out.
            const stored = Array.isArray(vs?.options?.imageArrangement) ? vs.options.imageArrangement : [];
            const have = new Set(loaded.map((e) => e.path));
            const kept = stored.filter((a) => a && have.has(a.path));
            const known = new Set(kept.map((a) => a.path));
            for (const e of loaded) if (!known.has(e.path)) kept.push({ path: e.path, seconds: null, excluded: false, focal: null });
            setArrangement(kept);
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

    // The image strip's output: entries in display order minus exclusions,
    // focal points attached, and per-image seconds when any image has its own.
    const arranged = useMemo(() => {
        if (!images.length) return { images: [], perImageSeconds: null };
        if (!arrangement) return { images, perImageSeconds: null };
        const byPath = new Map(images.map((e) => [e.path, e]));
        const ordered = [];
        const secs = [];
        let anySecs = false;
        for (const a of arrangement) {
            const e = byPath.get(a.path);
            if (!e) continue;
            byPath.delete(a.path);
            e.focal = a.focal || null;
            if (a.excluded) continue;
            ordered.push(e);
            secs.push(a.seconds || null);
            if (a.seconds) anySecs = true;
        }
        for (const e of byPath.values()) { ordered.push(e); secs.push(null); }
        return {
            images: ordered,
            perImageSeconds: anySecs ? secs.map((s) => s || options.secondsPerImage) : null,
        };
    }, [images, arrangement, options.secondsPerImage]);

    // Everything the render needs beyond the base options — also exactly what
    // gets persisted to video_settings, so the poster reproduces this render.
    const effectiveOptions = useMemo(() => ({
        ...options,
        ...(arranged.perImageSeconds ? { perImageSeconds: arranged.perImageSeconds } : {}),
        ...(arrangement ? { imageArrangement: arrangement } : {}),
    }), [options, arranged.perImageSeconds, arrangement]);

    // The selection outline is editor chrome — painted OVER the frame, never
    // part of it, and never while playing or recording.
    const drawSelection = useCallback((ctx, p) => {
        if (!selectedLayerId) return;
        const layer = p.layers.find((l) => l.id === selectedLayerId);
        if (!layer || layer.visible === false) return;
        const b = layerBounds(ctx, p, layer);
        if (!b) return;
        ctx.save();
        ctx.strokeStyle = "#4dabf7";
        ctx.lineWidth = Math.max(2, Math.round(p.W * 0.003));
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.restore();
    }, [selectedLayerId]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !selected || !arranged.images.length) { setPlan(null); return; }
        const p = buildPlan({
            canvas,
            images: arranged.images,
            title: selected.title,
            body: captionText,
            logo,
            options: effectiveOptions,
            layerPatches,
        });
        setPlan(p);
        paintFrame(canvas.getContext("2d"), p, Math.min(previewTime, p.duration));
        // previewTime is deliberately not a dependency: repainting on every
        // scrub tick would rebuild the whole plan (and re-wrap the text) 60
        // times a second. The scrub effect below repaints on its own.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, arranged, captionText, effectiveOptions, logo, layerPatches]);

    useEffect(() => {
        if (!plan || playing || rendering) return;
        const ctx = canvasRef.current.getContext("2d");
        paintFrame(ctx, plan, previewTime);
        drawSelection(ctx, plan);
    }, [previewTime, plan, playing, rendering, drawSelection]);

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

    // ── canvas editing (select + drag) ──────────────────────
    const canvasPoint = (e) => {
        const c = canvasRef.current;
        const r = c.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
    };

    const onCanvasDown = (e) => {
        if (!plan || busy || playing) return;
        const pt = canvasPoint(e);
        const hit = hitTestLayers(canvasRef.current.getContext("2d"), plan, pt.x, pt.y);
        setSelectedLayerId(hit ? hit.layer.id : null);
        if (!hit) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragRef.current = {
            id: hit.layer.id,
            startX: pt.x, startY: pt.y,
            baseFx: hit.layer.x / plan.W,
            baseFy: hit.layer.y / plan.H,
        };
    };
    const onCanvasMove = (e) => {
        const d = dragRef.current;
        if (!d || !plan) return;
        const pt = canvasPoint(e);
        // The drag writes FRACTIONS, so the position survives an aspect switch.
        const fx = Math.min(1, Math.max(0, d.baseFx + (pt.x - d.startX) / plan.W));
        const fy = Math.min(1, Math.max(0, d.baseFy + (pt.y - d.startY) / plan.H));
        upsertPatch({ id: d.id, fx: +fx.toFixed(4), fy: +fy.toFixed(4) });
    };
    const onCanvasUp = () => { dragRef.current = null; };

    const addTextLayer = () => {
        const id = "txt-" + Date.now().toString(36);
        upsertPatch({
            id, type: "text", text: "New text",
            fx: 0.5, fy: 0.15, sizeFrac: 0.05,
            color: "accent", weight: 700, bg: true, anim: "none", align: "center",
        });
        setSelectedLayerId(id);
    };

    // The patch entry behind a selected custom text layer (compiled layers have
    // no editable patch of their own unless one exists for visibility/position).
    const selectedTextPatch = (layerPatches || []).find((p) => p.id === selectedLayerId && p.type === "text") || null;

    const updateArrangement = (idx, patch) => setArrangement((arr) => {
        const next = [...(arr || [])];
        next[idx] = { ...next[idx], ...patch };
        return next;
    });
    const moveImage = (idx, dir) => setArrangement((arr) => {
        const next = [...(arr || [])];
        const j = idx + dir;
        if (j < 0 || j >= next.length) return arr;
        [next[idx], next[j]] = [next[j], next[idx]];
        return next;
    });

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
        // The recipe rides along with the video: a FULL options snapshot (so a
        // later template edit never changes what this post renders), the
        // template id for provenance, and any layer patches. The poster reads
        // this back to render exactly what the studio previewed.
        const video_settings = {
            template: templateId || null,
            // effectiveOptions, not the bare options state: it carries the
            // image arrangement and per-image seconds the render actually used.
            options: { ...effectiveOptions },
            layers: layerPatches || [],
            renderedAt: new Date().toISOString(),
        };
        await SocialPostsEndpoints.updateDraft(post.documentId, { data: { video: [...existing, ...ids], video_settings } });
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
        const queue = pending;
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
                const p = buildPlan({ canvas: canvasRef.current, images: imgs, title: post.title, body: post.body, logo, options, layerPatches });
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
    const pendingCount = pending.length;

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <ToastContainer />

                <div className="d-flex align-items-center flex-wrap gap-2 mb-3">
                    <Link className="btn btn-sm btn-outline-secondary" href="/posts"><i className="fas fa-arrow-left" /> Posts</Link>
                    <h2 className="mb-0"><i className="fas fa-film me-2" />Video Studio</h2>
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

                {/* ── no post chosen: browsing lives on /posts now ── */}
                {!selected && (
                    <>
                        {/* a batch run still needs a canvas to render on */}
                        <canvas ref={canvasRef} style={{ display: "none" }} />
                        <div className="card">
                            <div className="card-body text-center py-5">
                                {loading ? (
                                    <span className="spinner-border" />
                                ) : (
                                    <>
                                        <i className="fas fa-film fa-3x text-muted mb-3 d-block" />
                                        <p className="mb-1">Pick a post to edit its video.</p>
                                        <p className="text-muted small mb-3" style={{ maxWidth: 520, margin: "0 auto" }}>
                                            Posts are browsed and filtered on the Posts page — every card there has an
                                            {" "}<i className="fas fa-film" /> Edit video action, and the
                                            {" "}“without video” filter singles out the ones still missing one.
                                        </p>
                                        <div className="d-flex justify-content-center gap-2">
                                            <Link className="btn btn-sm btn-primary" href="/posts?video=without">
                                                <i className="fas fa-list me-1" />Posts without a video
                                            </Link>
                                            <Link className="btn btn-sm btn-outline-secondary" href="/posts">
                                                All posts
                                            </Link>
                                        </div>
                                        {pendingCount > 0 && (
                                            <p className="text-muted small mt-3 mb-0">
                                                Or use <strong>Render all pending</strong> above to batch-render the
                                                {" "}{pendingCount} image-only post{pendingCount === 1 ? "" : "s"} with the current look.
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* ── the editor: one big canvas, one settings rail ── */}
                {selected && (
                    <div className="d-flex gap-3 align-items-start">
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                <div className="card">
                                    <div className="card-header py-2 d-flex align-items-center gap-2">
                                        <button className="btn btn-sm btn-outline-secondary" onClick={() => router.push("/posts")} disabled={busy}
                                            title="Back to the post list">
                                            <i className="fas fa-arrow-left me-1" />Posts
                                        </button>
                                        <strong className="text-truncate">{selected.title || "(untitled)"}</strong>
                                        {plan && <span className="badge bg-secondary ms-1">{aspect.width}×{aspect.height}</span>}
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
                                                onPointerDown={onCanvasDown} onPointerMove={onCanvasMove}
                                                onPointerUp={onCanvasUp} onPointerCancel={onCanvasUp}
                                                style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "74vh", display: "block", touchAction: "none", cursor: "crosshair" }} />
                                        </div>

                                        {loadingImages && <div className="mt-3"><span className="spinner-border spinner-border-sm me-2" />Loading images…</div>}

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

                                        {/* ── image strip: order · exclude · seconds · focal ── */}
                                        {plan && arrangement && arrangement.length > 1 && (
                                            <div className="w-100 mt-2 d-flex gap-2 overflow-auto pb-1">
                                                {arrangement.map((a, idx) => {
                                                    const e = images.find((i) => i.path === a.path);
                                                    if (!e) return null;
                                                    return (
                                                        <div key={a.path} className="text-center flex-shrink-0" style={{ width: 86, opacity: a.excluded ? 0.4 : 1 }}>
                                                            <img src={e.objectUrl} alt="" style={{ width: 84, height: 60, objectFit: "cover", borderRadius: 4 }} />
                                                            <div className="d-flex justify-content-center gap-1 mt-1">
                                                                <button className="btn btn-sm btn-outline-secondary p-0 px-1" style={{ fontSize: 10 }} disabled={busy || idx === 0}
                                                                    onClick={() => moveImage(idx, -1)} title="Earlier"><i className="fas fa-chevron-left" /></button>
                                                                <button className="btn btn-sm btn-outline-secondary p-0 px-1" style={{ fontSize: 10 }} disabled={busy}
                                                                    onClick={() => updateArrangement(idx, { excluded: !a.excluded })} title={a.excluded ? "Include" : "Exclude"}>
                                                                    <i className={`fas ${a.excluded ? "fa-eye-slash" : "fa-eye"}`} /></button>
                                                                <select className="form-select form-select-sm p-0 px-1" style={{ fontSize: 10, width: 34, height: 22 }} disabled={busy}
                                                                    title="Focal point — what a cropped fit keeps in frame"
                                                                    value={a.focal ? FOCAL_PRESETS.find((f) => f.fx === a.focal.fx && f.fy === a.focal.fy)?.k || "c" : "c"}
                                                                    onChange={(ev) => {
                                                                        const f = FOCAL_PRESETS.find((x) => x.k === ev.target.value);
                                                                        updateArrangement(idx, { focal: f && f.k !== "c" ? { fx: f.fx, fy: f.fy } : null });
                                                                    }}>
                                                                    {FOCAL_PRESETS.map((f) => <option key={f.k} value={f.k}>{f.k}</option>)}
                                                                </select>
                                                                <button className="btn btn-sm btn-outline-secondary p-0 px-1" style={{ fontSize: 10 }} disabled={busy || idx === arrangement.length - 1}
                                                                    onClick={() => moveImage(idx, 1)} title="Later"><i className="fas fa-chevron-right" /></button>
                                                            </div>
                                                            <input type="number" className="form-control form-control-sm mt-1 p-0 text-center" style={{ fontSize: 10, height: 20 }}
                                                                min={0.5} max={20} step={0.5} placeholder={`${options.secondsPerImage}s`} disabled={busy || a.excluded}
                                                                value={a.seconds ?? ""} title="Seconds for this image (blank = default)"
                                                                onChange={(ev) => updateArrangement(idx, { seconds: ev.target.value === "" ? null : Math.max(0.5, Number(ev.target.value)) })} />
                                                        </div>
                                                    );
                                                })}
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

                        {/* ── settings rail ── */}
                        <div className="flex-shrink-0" style={{ width: 400 }}>
                            <div style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto", paddingRight: 4 }}>
                                {/* ── layers ── */}
                                <div className="card mb-3">
                                    <div className="card-header py-2 d-flex align-items-center">
                                        <i className="fas fa-layer-group me-2" />Layers
                                        <button className="btn btn-sm btn-link ms-auto p-0" onClick={addTextLayer} disabled={busy || !plan}>
                                            <i className="fas fa-plus me-1" />Add text
                                        </button>
                                    </div>
                                    <div className="card-body py-2">
                                        {!plan && <p className="text-muted small mb-0">Pick a post to see its layers.</p>}
                                        {plan && (
                                            <div className="list-group list-group-flush">
                                                {[...plan.layers].reverse().map((l) => {
                                                    const isCustom = (layerPatches || []).some((p) => p.id === l.id && p.type === "text");
                                                    const movable = l.type === "text" || l.type === "image";
                                                    const sel = selectedLayerId === l.id;
                                                    return (
                                                        <div key={l.id}
                                                            className={`list-group-item d-flex align-items-center gap-2 py-1 px-2 ${sel ? "list-group-item-primary" : ""}`}
                                                            style={{ cursor: movable ? "pointer" : "default" }}
                                                            onClick={() => movable && setSelectedLayerId(sel ? null : l.id)}>
                                                            <button className="btn btn-sm btn-link p-0" title={l.visible === false ? "Show" : "Hide"} disabled={busy}
                                                                onClick={(ev) => { ev.stopPropagation(); upsertPatch({ id: l.id, visible: l.visible === false }); }}>
                                                                <i className={`fas ${l.visible === false ? "fa-eye-slash text-muted" : "fa-eye"}`} />
                                                            </button>
                                                            <span className={`flex-grow-1 small text-truncate ${l.visible === false ? "text-muted" : ""}`}>
                                                                {isCustom ? (l.text || "Text") : (LAYER_LABELS[l.id] || LAYER_LABELS[l.type] || l.id)}
                                                            </span>
                                                            {movable && <i className="fas fa-up-down-left-right text-muted" style={{ fontSize: 10 }} title="Drag on the preview to move" />}
                                                            {isCustom && (
                                                                <button className="btn btn-sm btn-link p-0 text-danger" title="Delete layer" disabled={busy}
                                                                    onClick={(ev) => { ev.stopPropagation(); removePatchLayer(l.id); if (sel) setSelectedLayerId(null); }}>
                                                                    <i className="fas fa-trash" style={{ fontSize: 11 }} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* ── selected text layer editor ── */}
                                        {selectedTextPatch && (
                                            <div className="border rounded p-2 mt-2">
                                                <input className="form-control form-control-sm mb-2" value={selectedTextPatch.text || ""} disabled={busy}
                                                    onChange={(e) => upsertPatch({ id: selectedTextPatch.id, text: e.target.value })} />
                                                <div className="row g-1">
                                                    <div className="col-4">
                                                        <select className="form-select form-select-sm" value={selectedTextPatch.color || "text"} disabled={busy}
                                                            title="Color" onChange={(e) => upsertPatch({ id: selectedTextPatch.id, color: e.target.value })}>
                                                            <option value="text">Theme text</option>
                                                            <option value="dim">Dimmed</option>
                                                            <option value="accent">Accent</option>
                                                            <option value="#ffffff">White</option>
                                                            <option value="#e03131">Red</option>
                                                            <option value="#2f9e44">Green</option>
                                                        </select>
                                                    </div>
                                                    <div className="col-4">
                                                        <select className="form-select form-select-sm" value={selectedTextPatch.weight || 700} disabled={busy}
                                                            title="Weight" onChange={(e) => upsertPatch({ id: selectedTextPatch.id, weight: Number(e.target.value) })}>
                                                            <option value={400}>Regular</option>
                                                            <option value={600}>Semibold</option>
                                                            <option value={700}>Bold</option>
                                                            <option value={800}>Heavy</option>
                                                        </select>
                                                    </div>
                                                    <div className="col-4">
                                                        <select className="form-select form-select-sm" value={selectedTextPatch.anim || "none"} disabled={busy}
                                                            title="Animation" onChange={(e) => upsertPatch({ id: selectedTextPatch.id, anim: e.target.value })}>
                                                            <option value="none">Static</option>
                                                            <option value="fade">Fade</option>
                                                            <option value="slide-up">Slide up</option>
                                                            <option value="type">Type on</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <RangeRow label="Size" value={selectedTextPatch.sizeFrac || 0.05} min={0.02} max={0.14} step={0.005}
                                                    suffix="× width" disabled={busy} onChange={(v) => upsertPatch({ id: selectedTextPatch.id, sizeFrac: v })} />
                                                <div className="d-flex flex-wrap align-items-center gap-3">
                                                    <div className="form-check form-switch mb-0">
                                                        <input className="form-check-input" type="checkbox" id="tl-bg" checked={selectedTextPatch.bg !== false && !!selectedTextPatch.bg} disabled={busy}
                                                            onChange={(e) => upsertPatch({ id: selectedTextPatch.id, bg: e.target.checked })} />
                                                        <label className="form-check-label small" htmlFor="tl-bg">Pill background</label>
                                                    </div>
                                                    <div className="d-flex align-items-center gap-1">
                                                        <span className="small text-muted">Show</span>
                                                        <input type="number" className="form-control form-control-sm" style={{ width: 64 }} min={0} step={0.5} disabled={busy}
                                                            placeholder="start" value={selectedTextPatch.timing?.start ?? ""}
                                                            onChange={(e) => {
                                                                const start = e.target.value === "" ? null : Number(e.target.value);
                                                                const end = selectedTextPatch.timing?.end;
                                                                upsertPatch({ id: selectedTextPatch.id, timing: start === null || end === undefined ? (start === null ? null : { start, end: start + 3 }) : { start, end } });
                                                            }} />
                                                        <span className="small text-muted">to</span>
                                                        <input type="number" className="form-control form-control-sm" style={{ width: 64 }} min={0} step={0.5} disabled={busy}
                                                            placeholder="end" value={selectedTextPatch.timing?.end ?? ""}
                                                            onChange={(e) => {
                                                                const end = e.target.value === "" ? null : Number(e.target.value);
                                                                const start = selectedTextPatch.timing?.start ?? 0;
                                                                upsertPatch({ id: selectedTextPatch.id, timing: end === null ? null : { start, end } });
                                                            }} />
                                                        <span className="small text-muted">s (blank = whole video)</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {plan && !selectedTextPatch && (
                                            <p className="text-muted mb-0 mt-2" style={{ fontSize: 11 }}>
                                                Click a layer above (or on the preview) to select it; drag text and the logo directly on the preview.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="card mb-3">
                                    <div className="card-header py-2 d-flex align-items-center">
                                        <i className="fas fa-sliders me-2" />Look
                                        <button className="btn btn-sm btn-link ms-auto p-0" onClick={saveAsTemplate}
                                            disabled={busy || savingTemplate} title="Save the current look as a reusable template">
                                            Save as template
                                        </button>
                                    </div>
                                    <div className="card-body">
                                        <label className="form-label small mb-1">Template</label>
                                        {templates.length === 0 ? (
                                            <div className="d-grid mb-3">
                                                <button className="btn btn-sm btn-outline-primary" onClick={createBuiltins} disabled={busy || savingTemplate}>
                                                    <i className="fas fa-wand-magic-sparkles me-1" />
                                                    {savingTemplate ? "Creating…" : "Create the built-in templates (Classic · Card · Minimal)"}
                                                </button>
                                            </div>
                                        ) : (
                                            <select className="form-select form-select-sm mb-3" disabled={busy}
                                                value={templateId || ""}
                                                onChange={(e) => applyTemplate(templates.find((t) => t.documentId === e.target.value) || null)}>
                                                <option value="">Custom (no template)</option>
                                                {templates.map((t) => (
                                                    <option key={t.documentId} value={t.documentId}>
                                                        {t.name}{t.is_default ? " (default)" : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
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
                                                <label className="form-label small mb-1">Caption style</label>
                                                <select className="form-select form-select-sm" value={options.captionStyle || "box"} disabled={busy}
                                                    onChange={(e) => setOpt({ captionStyle: e.target.value })}>
                                                    <option value="box">Panel behind text</option>
                                                    <option value="bare">Bare shadowed text</option>
                                                </select>
                                            </div>
                                            <div className="col-6">
                                                <label className="form-label small mb-1">Transition</label>
                                                <select className="form-select form-select-sm" value={options.transition || "fade"} disabled={busy}
                                                    onChange={(e) => setOpt({ transition: e.target.value })}>
                                                    <option value="fade">Crossfade</option>
                                                    <option value="cut">Hard cut</option>
                                                    <option value="slide">Slide over</option>
                                                    <option value="push">Push</option>
                                                    <option value="zoom">Zoom through</option>
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

                                        <hr className="my-3" />
                                        <RangeRow label="Outro card" value={options.outroSeconds || 0} min={0} max={4} step={0.2}
                                            suffix="s (0 = off)" disabled={busy} onChange={(v) => setOpt({ outroSeconds: v })} />
                                        {(options.outroSeconds || 0) > 0 && (
                                            <>
                                                <input className="form-control form-control-sm" value={options.outroText || ""} disabled={busy}
                                                    placeholder={options.footer || "End-card line (defaults to the footer)"}
                                                    onChange={(e) => setOpt({ outroText: e.target.value })} />
                                                <div className="form-text">Theme background + logo + this line, appended to the end of the video.</div>
                                            </>
                                        )}
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
                                        <RangeRow label="Open/close fade" value={options.edgeFadeSeconds ?? 0.45} min={0} max={1.5} step={0.05}
                                            suffix="s" disabled={busy} onChange={(v) => setOpt({ edgeFadeSeconds: v })} />
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
                )}
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
