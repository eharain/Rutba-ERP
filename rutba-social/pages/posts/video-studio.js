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
import useUnsavedGuard from "@rutba/pos-shared/hooks/useUnsavedGuard";
import StrapiMediaLibrary from "@rutba/pos-shared/components/StrapiMediaLibrary";
import VideoTimeline from "../../components/VideoTimeline";
import VideoComposer from "../../components/VideoComposer";
import { resolveStorefrontBaseUrl, productShortUrl } from "../../lib/storefront-url";
import {
    ASPECTS, THEMES, DEFAULTS,
    buildPlan, paintFrame, renderVideo, loadImage, loadImages, releaseImages,
    loadAudioTrack, setMediaAuth, hitTestLayers, loadVideo, releaseVideos,
    layerHandles, hitTestHandles, scaleFromDrag, resizePatch, withLayerStateAt,
    soundLayers, clipFromSoundLayer, startAudioPreview,
    imageItems, isImageOnly, unsupportedReason, videoFileName,
} from "../../lib/video-maker";

// "Rs 3,999" — whole rupees stay whole; anything else keeps two decimals.
const fmtRs = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return "";
    return "Rs " + (v % 1 === 0
        ? v.toLocaleString("en-US")
        : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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

// The music bed's lane id. Not a layer id — nothing with this id is ever
// compiled or persisted; it names the lane the bed's options are edited from.
const BED_ID = "music-bed";

const fmtSeconds = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const fmtBytes = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export default function VideoStudioPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const router = useRouter();

    const canvasRef = useRef(null);
    const previewRaf = useRef(0);
    const previewStart = useRef(0);
    const previewAudio = useRef(null); // startAudioPreview handle while playing
    const previewArming = useRef(false); // decode in flight — one press at a time
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
    // The rail shows the selected layer OR the video — but the video's
    // properties (aspect, music, timing) must never be more than one click
    // away, so with a layer selected the rail is two tabs, not a takeover.
    const [railTab, setRailTab] = useState("layer"); // 'layer' | 'video'
    const [arrangement, setArrangement] = useState(null); // [{path, seconds, excluded, focal}]
    const [productContext, setProductContext] = useState(null); // {price, was, discount, product, url}
    const dragRef = useRef(null);

    // Anything that changes what would be SAVED flips this; save/attach/load
    // clear it. useUnsavedGuard turns it into the app-wide leave prompt.
    const [dirty, setDirty] = useState(false);

    // Loaded <video> entries for video layers, url → loadVideo entry. Declared
    // early because the plan-build effect depends on it; the loading effect
    // and the picker live further down with the other video-layer machinery.
    const [videoLib, setVideoLib] = useState({});
    const videoLibRef = useRef({});
    const [showVideoPicker, setShowVideoPicker] = useState(false);

    // Loaded bitmaps for appended image layers, url → loadImage entry — the
    // buildPlan `assets` map. Declared early for the same reason videoLib is.
    const [imageAssets, setImageAssets] = useState({});
    const imageAssetsRef = useRef({});
    // The image picker serves two errands: 'new' adds a layer, a layer id
    // repoints that layer's picture. null = closed.
    const [imagePickerFor, setImagePickerFor] = useState(null);

    // The Sound buttons open this: the audio library as a picker, so the track
    // is chosen BEFORE the layer exists — not defaulted and fixed up after.
    const [showSoundPicker, setShowSoundPicker] = useState(false);

    // Layer patches are the single write path for everything the editor does —
    // they persist to video_settings and templates as-is.
    const upsertPatch = useCallback((patch) => {
        setDirty(true);
        setLayerPatches((list) => {
            const arr = [...(list || [])];
            const i = arr.findIndex((p) => p.id === patch.id);
            if (i >= 0) arr[i] = { ...arr[i], ...patch }; else arr.push(patch);
            return arr;
        });
    }, []);
    const removePatchLayer = useCallback((id) => {
        setDirty(true);
        setLayerPatches((list) => {
            const arr = (list || []).filter((p) => p.id !== id);
            return arr.length ? arr : null;
        });
    }, []);

    const [previewTime, setPreviewTime] = useState(0);
    const [playing, setPlaying] = useState(false);

    const [savingRecipe, setSavingRecipe] = useState(false);
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

    const setOpt = (patch) => { setDirty(true); setOptions((o) => ({ ...o, ...patch })); };

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
        setDirty(true);
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
                    ? "The chosen track is no longer in rotation — there will be no music."
                    : "No track chosen yet — pick one in Music, or switch to Random.",
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
            // A start point picked in the Audio Library beats the random one —
            // it exists precisely because someone chose the best bit of the
            // track. DECIMAL column, so coerce.
            const savedStart = Number(track.start_offset);
            const offset = Number.isFinite(savedStart) && savedStart > 0
                ? savedStart % buffer.duration
                : (options.audioRandomStart && buffer.duration > 12
                    ? Math.random() * Math.max(0, buffer.duration - 8)
                    : 0);
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

    // Appended `sound` layers, resolved to renderVideo clips. Each references
    // a library track (trackId = documentId) or a raw url; a track that has
    // left the library is skipped with a warning rather than sinking the
    // render — the same degradation the music bed has always had.
    const clipsFromSoundLayers = useCallback(async (thePlan) => {
        const clips = [];
        for (const layer of soundLayers(thePlan)) {
            const track = layer.trackId ? tracks.find((t) => String(t.documentId) === String(layer.trackId)) : null;
            const url = track ? trackUrl(track) : layer.url;
            if (!url) { toast(`“${layer.name || layer.id}” has no track — skipped.`, "warning"); continue; }
            try {
                const cacheKey = track?.documentId || url;
                let buffer = bufferCache.current.get(cacheKey);
                if (!buffer) {
                    buffer = await loadAudioTrack(url);
                    bufferCache.current.set(cacheKey, buffer);
                }
                clips.push(clipFromSoundLayer(layer, buffer, thePlan, {
                    volume: Number.isFinite(Number(track?.volume)) && track?.volume !== null
                        ? Number(track.volume) : options.audioVolume,
                    fadeIn: options.audioFadeIn,
                    fadeOut: options.audioFadeOut,
                }));
            } catch (err) {
                console.error("Failed to decode a sound layer", err);
                toast(`Could not use the sound “${layer.name || layer.id}” — skipped.`, "warning");
            }
        }
        return clips;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tracks, options.audioVolume, options.audioFadeIn, options.audioFadeOut, toast]);

    // Browsing posts moved to /posts (every card there deep-links back here).
    // What the studio still needs from the full post set is just the batch
    // queue — image-only posts awaiting a video.
    const pending = useMemo(() => posts.filter(isImageOnly), [posts]);

    // ── image loading for the selected post ─────────────────
    const releaseLoaded = useCallback(() => {
        releaseImages(loadedRef.current);
        loadedRef.current = [];
    }, []);

    useEffect(() => () => {
        releaseLoaded();
        cancelAnimationFrame(previewRaf.current);
        previewAudio.current?.stop();
        previewAudio.current = null;
    }, [releaseLoaded]);

    // Render-time data for {token} layers, from the FIRST product linked to
    // the post: {price} {was} {discount} {product} {url}. Derived, never
    // stored — the poster resolves the same tokens with fresh data at its own
    // render time, which is what keeps a price chip honest.
    const fetchProductContext = useCallback(async (post) => {
        try {
            const res = await SocialPostsEndpoints.byId(post.documentId, { status: "draft", populate: ["products"] });
            const p = ((res?.data || res)?.products || [])[0];
            if (!p) return null;
            const selling = Number(p.selling_price) || 0;
            const offer = Number(p.offer_price) || 0;
            const onSale = offer > 0 && selling > offer;
            const eff = onSale ? offer : (offer > 0 ? offer : selling);
            const base = await resolveStorefrontBaseUrl();
            return {
                product: p.name || "",
                price: fmtRs(eff),
                was: onSale ? fmtRs(selling) : "",
                discount: onSale ? `-${Math.round((1 - offer / selling) * 100)}%` : "",
                // Short form: {url} is burned into the frame as text, so nobody
                // clicks it — they read it off a phone and type it. A slug that
                // wraps to two lines at overlay sizes is a URL that does not
                // get typed.
                url: productShortUrl(base, p),
            };
        } catch (err) {
            console.error("Failed to load the linked product", err);
            return null;
        }
    }, []);

    const selectPost = useCallback(async (post) => {
        cancelAnimationFrame(previewRaf.current);
        previewAudio.current?.stop();
        previewAudio.current = null;
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
        setProductContext(null);
        setDirty(false); // a fresh load IS the saved state
        setSelected(post);
        if (!post) return;

        // Arrives when it arrives — the plan rebuilds and any {token} layers
        // light up once the product data is in.
        fetchProductContext(post).then(setProductContext);

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

    // ── composer → editor ───────────────────────────────────
    // The composer gathers ingredients while nothing is selected; opening them
    // means giving them a post to live on, because a post is the only subject
    // the editor, the recipe, Attach and the poster all understand. A new one
    // is created as a DRAFT: it exists so the work has somewhere to be saved,
    // and publishing stays an explicit act elsewhere.
    const [composing, setComposing] = useState(false);

    const openComposed = useCallback(async ({ photoIds, title, body, destination, postDocumentId }) => {
        setComposing(true);
        try {
            let documentId = postDocumentId;
            if (destination === "new") {
                const res = await SocialPostsEndpoints.create({
                    data: {
                        title, body,
                        media: photoIds,
                        platforms: [],
                        post_status: "draft",
                        tags: [],
                    },
                });
                documentId = (res?.data || res)?.documentId;
                if (!documentId) throw new Error("The draft post was not created.");
            } else {
                const target = posts.find((p) => p.documentId === documentId);
                // Gallery only — `cover` is its own single-file relation. Seeding
                // from cover+media would write the cover INTO the gallery, so it
                // would show up twice in the post editor forever after.
                const existing = (target?.media || []).map((m) => m.id).filter(Boolean);
                await SocialPostsEndpoints.updateDraft(documentId, {
                    data: { media: [...new Set([...existing, ...photoIds])] },
                });
            }

            // Re-read what was actually written — the editor needs full media
            // rows (urls, formats), not the ids the composer held.
            const fresh = await SocialPostsEndpoints.byId(documentId, {
                status: "draft",
                populate: ["cover", "media", "video", "products"],
            });
            const post = fresh?.data || fresh;
            if (!post) throw new Error("The post could not be read back.");

            setPosts((list) => (list.some((p) => p.documentId === documentId)
                ? list.map((p) => (p.documentId === documentId ? { ...p, ...post } : p))
                : [{ ...post, _isPublished: false }, ...list]));
            await selectPost(post);
            toast(
                destination === "new"
                    ? `Draft “${title}” created — arrange and render it here.`
                    : "Photos added — arrange and render the video here.",
                "success",
            );
        } catch (err) {
            console.error("Failed to open the composed video", err);
            toast(err?.response?.data?.error?.message || err.message || "Could not start the video.", "danger");
        } finally {
            setComposing(false);
        }
    }, [posts, selectPost, toast]);

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

    // Run `fn` with every KEYED layer resolved at the playhead, so selection
    // outlines and hit-tests track a layer mid-motion instead of its static
    // base. Static layers cost nothing.
    const atPreviewState = useCallback((p, t, fn) => {
        const keyed = p.layers.filter((l) => l.keys);
        return keyed.reduceRight((inner, l) => () => withLayerStateAt(p, l, t, inner), fn)();
    }, []);

    // The selection outline is editor chrome — painted OVER the frame, never
    // part of it, and never while playing or recording. It is an instrument:
    // corner squares resize about the opposite corner, the stalk dot rotates.
    const drawSelection = useCallback((ctx, p) => {
        if (!selectedLayerId) return;
        const layer = p.layers.find((l) => l.id === selectedLayerId);
        if (!layer || layer.visible === false) return;
        const h = atPreviewState(p, Math.min(previewTime, p.duration), () => layerHandles(ctx, p, layer));
        if (!h) return;
        const { bounds: b, center, handles } = h;
        ctx.save();
        ctx.strokeStyle = "#4dabf7";
        ctx.lineWidth = Math.max(2, Math.round(p.W * 0.003));
        ctx.setLineDash([12, 8]);
        if (layer.rot) {
            ctx.translate(center.x, center.y);
            ctx.rotate((layer.rot * Math.PI) / 180);
            ctx.translate(-center.x, -center.y);
        }
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.restore();
        ctx.save();
        const r = Math.max(7, Math.round(p.W * 0.009));
        for (const pt of handles) {
            ctx.beginPath();
            if (pt.kind === "rotate") {
                ctx.fillStyle = "#4dabf7";
                ctx.arc(pt.x, pt.y, r * 0.9, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = "#fff";
                ctx.strokeStyle = "#4dabf7";
                ctx.lineWidth = Math.max(2, Math.round(p.W * 0.0025));
                ctx.rect(pt.x - r, pt.y - r, r * 2, r * 2);
                ctx.fill();
                ctx.stroke();
            }
        }
        ctx.restore();
    }, [selectedLayerId, previewTime, atPreviewState]);

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
            context: productContext || {},
            videos: videoLib,
            assets: imageAssets,
        });
        setPlan(p);
        paintFrame(canvas.getContext("2d"), p, Math.min(previewTime, p.duration));
        // previewTime is deliberately not a dependency: repainting on every
        // scrub tick would rebuild the whole plan (and re-wrap the text) 60
        // times a second. The scrub effect below repaints on its own.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, arranged, captionText, effectiveOptions, logo, layerPatches, productContext, videoLib, imageAssets]);

    useEffect(() => {
        if (!plan || playing || rendering) return;
        const ctx = canvasRef.current.getContext("2d");
        paintFrame(ctx, plan, previewTime);
        drawSelection(ctx, plan);
        // A video layer seeks asynchronously — paint once more when the frame
        // has had a beat to land, so scrubbing settles on the right picture.
        if (plan.layers.some((l) => l.type === "video" && l.visible !== false)) {
            const timer = setTimeout(() => {
                if (!canvasRef.current) return;
                paintFrame(ctx, plan, previewTime);
                drawSelection(ctx, plan);
            }, 160);
            return () => clearTimeout(timer);
        }
    }, [previewTime, plan, playing, rendering, drawSelection]);

    // ── preview playback ────────────────────────────────────
    const stopPreview = useCallback(() => {
        cancelAnimationFrame(previewRaf.current);
        previewAudio.current?.stop();
        previewAudio.current = null;
        setPlaying(false);
    }, []);

    const togglePreview = async () => {
        if (playing) { stopPreview(); return; }
        if (!plan || previewArming.current) return;
        const from = previewTime >= plan.duration - 0.05 ? 0 : previewTime;

        // The preview plays what a render would record: the bed (per the
        // audio mode) plus every sound layer. Decoded buffers cache, so only
        // the first press of a given track waits; a failure means a silent
        // preview, never a stuck button.
        previewArming.current = true;
        let audioArg = null;
        try {
            const bed = await audioForRender();
            const soundClips = await clipsFromSoundLayers(plan);
            audioArg = soundClips.length
                ? { clips: [...(bed ? [{ ...bed, loop: true }] : []), ...soundClips] }
                : bed;
        } catch (err) {
            console.error("Preview audio failed to arm", err);
        } finally {
            previewArming.current = false;
        }
        // The library audition must not double up under the timed preview.
        trackAudioRef.current?.pause();
        setPreviewingId(null);
        previewAudio.current?.stop();
        previewAudio.current = audioArg ? startAudioPreview(audioArg, plan, from) : null;

        previewStart.current = performance.now() - from * 1000;
        setPlaying(true);
        const step = () => {
            const t = (performance.now() - previewStart.current) / 1000;
            if (t >= plan.duration) {
                paintFrame(canvasRef.current.getContext("2d"), plan, plan.duration);
                setPreviewTime(plan.duration);
                previewAudio.current?.stop();
                previewAudio.current = null;
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
        const ctx2 = canvasRef.current.getContext("2d");

        // Handles on the CURRENT selection win over layer bodies — grabbing a
        // corner of the selected layer must never re-select what sits under it.
        const sel = selectedLayerId ? plan.layers.find((l) => l.id === selectedLayerId) : null;
        if (sel && sel.visible !== false) {
            const handle = atPreviewState(plan, previewTime, () => hitTestHandles(ctx2, plan, sel, pt.x, pt.y, Math.max(14, plan.W * 0.016)));
            if (handle) {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                dragRef.current = handle.kind === "rotate"
                    ? {
                        id: sel.id, mode: "rotate", center: handle.center, baseRot: sel.rot || 0,
                        startAngle: Math.atan2(pt.y - handle.center.y, pt.x - handle.center.x),
                    }
                    : {
                        id: sel.id, mode: "resize", handle, start: pt,
                        // A stable base: resize computes from the state at grab
                        // time, or each move would compound on the last one.
                        snap: { ...sel },
                    };
                return;
            }
        }

        const hit = atPreviewState(plan, previewTime, () => hitTestLayers(ctx2, plan, pt.x, pt.y));
        setSelectedLayerId(hit ? hit.layer.id : null);
        if (!hit) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragRef.current = {
            id: hit.layer.id, mode: "move",
            startX: pt.x, startY: pt.y,
            baseFx: hit.layer.type === "photo" ? (hit.layer.fx ?? 0.3) : hit.layer.x / plan.W,
            baseFy: hit.layer.type === "photo" ? (hit.layer.fy ?? 0.3) : hit.layer.y / plan.H,
        };
    };
    const onCanvasMove = (e) => {
        const d = dragRef.current;
        if (!d || !plan) return;
        const pt = canvasPoint(e);

        if (d.mode === "resize") {
            const k = scaleFromDrag(d.handle, d.start, pt);
            const patch = resizePatch(canvasRef.current.getContext("2d"), plan, d.snap, d.handle.kind, k);
            if (patch) upsertPatch(patch);
            return;
        }
        if (d.mode === "rotate") {
            const a = Math.atan2(pt.y - d.center.y, pt.x - d.center.x);
            let rot = d.baseRot + ((a - d.startAngle) * 180) / Math.PI;
            rot = ((((rot + 180) % 360) + 360) % 360) - 180;
            for (const snap of [0, 90, -90, 180]) if (Math.abs(rot - snap) < 3) rot = snap;
            upsertPatch({ id: d.id, rot: +rot.toFixed(1) });
            return;
        }
        // move — the drag writes FRACTIONS, so it survives an aspect switch.
        const fx = Math.min(1, Math.max(0, d.baseFx + (pt.x - d.startX) / plan.W));
        const fy = Math.min(1, Math.max(0, d.baseFy + (pt.y - d.startY) / plan.H));

        // Record-by-doing: a layer that already HAS keys records the drag as a
        // key at the playhead instead of moving its base — park the playhead,
        // drag, and the motion writes itself. No keys = the ordinary move.
        const layer = plan.layers.find((l) => l.id === d.id);
        if (layer?.keys) {
            const start = layer.timing?.start ?? 0;
            const len = (layer.timing?.end ?? plan.duration) - start;
            const kt = +Math.max(0, Math.min(len, previewTime - start)).toFixed(3);
            const put = (list = [], v) => {
                const arr = list.filter((k) => Math.abs(k.t - kt) > 0.02);
                arr.push({ t: kt, v });
                return arr.sort((a, b) => a.t - b.t);
            };
            upsertPatch({
                id: d.id,
                keys: { ...layer.keys, fx: put(layer.keys.fx, +fx.toFixed(4)), fy: put(layer.keys.fy, +fy.toFixed(4)) },
            });
            return;
        }
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

    const updateArrangement = (idx, patch) => setDirty(true) || setArrangement((arr) => {
        const next = [...(arr || [])];
        next[idx] = { ...next[idx], ...patch };
        return next;
    });
    const moveImage = (idx, dir) => setDirty(true) || setArrangement((arr) => {
        const next = [...(arr || [])];
        const j = idx + dir;
        if (j < 0 || j >= next.length) return arr;
        [next[idx], next[j]] = [next[j], next[idx]];
        return next;
    });

    // Commerce quick-adds. These are ordinary layers whose text/data are
    // {tokens}: the studio previews them with this post's product, the poster
    // re-resolves them with fresh data at its own render time.
    const addCommerceLayer = (kind) => {
        const id = kind + "-" + Date.now().toString(36);
        const prefabs = {
            price: { id, type: "text", text: "{price}", pill: "accent", color: "#141118", weight: 800, sizeFrac: 0.055, fx: 0.5, fy: 0.08, align: "center" },
            discount: { id, type: "text", text: "{discount} OFF", pill: "accent", color: "#141118", weight: 800, sizeFrac: 0.05, fx: 0.82, fy: 0.16, align: "center" },
            qr: { id, type: "qr", fx: 0.68, fy: 0.045, fw: 0.24 },
            newSticker: { id, type: "text", text: "NEW", pill: "accent", color: "#141118", weight: 800, sizeFrac: 0.045, fx: 0.14, fy: 0.06, align: "center" },
            saleSticker: { id, type: "text", text: "SALE", pill: "accent", color: "#141118", weight: 800, sizeFrac: 0.045, fx: 0.14, fy: 0.06, align: "center" },
        };
        const p = prefabs[kind];
        if (!p) return;
        upsertPatch(p);
        setSelectedLayerId(id);
    };

    /**
     * The music bed as a LANE. It is not a plan layer — it lives in
     * `options.audioMode/audioTrackId/...` because that is the shape the
     * poster's recipe precedence reads — but it is audio the video really
     * carries, so it belongs on the timeline where the other sounds are.
     * Display only: `extraLanes` never reaches renderVideo.
     */
    const bedTrack = tracks.find((t) => String(t.documentId) === String(options.audioTrackId)) || null;
    const bedLanes = useMemo(() => {
        if (!plan || options.audioMode === "none") return [];
        return [{
            id: BED_ID, type: "sound", readOnly: true, visible: true, z: -1,
            name: options.audioMode === "random"
                ? "Music bed · random"
                : `Music bed · ${bedTrack?.name || "no track chosen"}`,
            timing: null, // the whole video, by construction
            enter: { kind: "fade", seconds: options.audioFadeIn || 0 },
            exit: { kind: "fade", seconds: options.audioFadeOut || 0 },
        }];
    }, [plan, options.audioMode, options.audioFadeIn, options.audioFadeOut, bedTrack]);
    const bedSelected = selectedLayerId === BED_ID && bedLanes.length > 0;

    const selectedQrPatch = (layerPatches || []).find((p) => p.id === selectedLayerId && p.type === "qr") || null;
    const selectedSoundPatch = (layerPatches || []).find((p) => p.id === selectedLayerId && p.type === "sound") || null;
    const selectedLayer = plan && selectedLayerId ? plan.layers.find((l) => l.id === selectedLayerId) || null : null;

    // plan.images holds the INCLUDED photos in arrangement order, so photo
    // layer N is the N-th non-excluded arrangement entry.
    const arrangementIndexForPhoto = (photoIndex) => {
        let n = -1;
        for (let i = 0; i < (arrangement || []).length; i++) {
            if (!arrangement[i].excluded) { n++; if (n === photoIndex) return i; }
        }
        return -1;
    };

    // A sound layer, placed on the timeline like everything else. The track is
    // chosen up front — from the picker the Sound buttons open, or a row's +
    // in the Music card's list; the inspector can still change it later.
    const addSoundLayer = (track) => {
        const t = track && track.documentId ? track : tracks[0];
        if (!plan || !t) return;
        const id = "sound-" + Date.now().toString(36);
        upsertPatch({
            id, type: "sound", trackId: t.documentId, name: t.name || "Sound",
            timing: { start: 0, end: +Math.min(plan.duration, 8).toFixed(3) },
            enter: { kind: "fade", seconds: 0.4 },
            exit: { kind: "fade", seconds: 0.6 },
        });
        setSelectedLayerId(id);
    };

    // ── video clips as layers ───────────────────────────────
    // A clip is TWO lanes: its picture (`video` layer) and its sound (a
    // `sound` layer on the same url) — placed and trimmed separately. The
    // elements load through the media proxy like everything else; a url that
    // fails just leaves its layer not drawing.
    useEffect(() => {
        const urls = [...new Set((layerPatches || []).filter((p) => p.type === "video" && p.url).map((p) => p.url))];
        const missing = urls.filter((u) => !videoLibRef.current[u]);
        if (!missing.length) return;
        let dead = false;
        (async () => {
            for (const url of missing) {
                try {
                    const entry = await loadVideo(url);
                    if (dead) { releaseVideos([entry]); return; }
                    videoLibRef.current = { ...videoLibRef.current, [url]: entry };
                    setVideoLib(videoLibRef.current);
                } catch (err) {
                    console.error("Failed to load a video clip", err);
                    toast(`Could not load a video clip — its layer will not draw. (${String(err?.message || err)})`, "warning");
                }
            }
        })();
        return () => { dead = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layerPatches]);
    useEffect(() => () => releaseVideos(videoLibRef.current), []);

    // Appended image layers (a sticker, a badge, a second mark) resolve their
    // bitmaps the same way: collected off the patches, loaded through the
    // proxy, kept url-keyed for buildPlan's `assets`. This also makes image
    // layers arriving FROM a template or saved recipe actually draw here —
    // before this map existed the studio never resolved their urls.
    useEffect(() => {
        const urls = [...new Set((layerPatches || []).filter((p) => p.type === "image" && p.url).map((p) => p.url))];
        const missing = urls.filter((u) => !imageAssetsRef.current[u]);
        if (!missing.length) return;
        let dead = false;
        (async () => {
            for (const url of missing) {
                try {
                    const entry = await loadImage(url);
                    if (dead) { releaseImages([entry]); return; }
                    imageAssetsRef.current = { ...imageAssetsRef.current, [url]: entry };
                    setImageAssets(imageAssetsRef.current);
                } catch (err) {
                    console.error("Failed to load an image layer", err);
                    toast(`Could not load an image — its layer will not draw. (${String(err?.message || err)})`, "warning");
                }
            }
        })();
        return () => { dead = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layerPatches]);
    useEffect(() => () => releaseImages(Object.values(imageAssetsRef.current)), []);

    // From the library picker (which also takes uploads — a new file lands in
    // the media library first, then here): one video lane + one audio lane.
    const addVideoLayers = (files) => {
        const file = Array.isArray(files) ? files[0] : files;
        if (!file) return;
        const url = MediaUtilsEndpoints.strapiImageUrl(file);
        if (!url) { toast("That file has no usable url.", "warning"); return; }
        const stamp = Date.now().toString(36);
        const clipName = String(file.name || "Clip").replace(/\.[a-z0-9]+$/i, "");
        upsertPatch({
            id: `video-${stamp}`, type: "video", url, fileId: file.id ?? null,
            name: clipName, offset: 0, timing: null,
        });
        upsertPatch({
            id: `video-${stamp}-audio`, type: "sound", url,
            name: `${clipName} · audio`, timing: null,
            enter: { kind: "fade", seconds: 0 }, exit: { kind: "fade", seconds: 0 },
        });
        setSelectedLayerId(`video-${stamp}`);
        setShowVideoPicker(false);
        toast("Two lanes added — the clip's picture and its audio, trimmed separately.", "success");
    };

    // From the same picker, one image layer — a sticker, a badge, a second
    // mark. Lands small and off-centre so it shows over the photos without
    // sitting on the caption; drag, resize and retime it like anything else.
    const addImageLayer = (files) => {
        const file = Array.isArray(files) ? files[0] : files;
        if (!file) return;
        const url = MediaUtilsEndpoints.strapiImageUrl(file);
        if (!url) { toast("That file has no usable url.", "warning"); return; }
        const id = "img-" + Date.now().toString(36);
        upsertPatch({
            id, type: "image", url,
            name: String(file.name || "Image").replace(/\.[a-z0-9]+$/i, ""),
            fx: 0.38, fy: 0.3, fw: 0.24,
        });
        setSelectedLayerId(id);
        setImagePickerFor(null);
    };

    /**
     * Point an EXISTING image layer at a different picture — including the
     * compiled logo, whose bitmap otherwise comes from site settings. The
     * patch carries `type: 'image'` so both hosts' asset collectors fetch the
     * bytes (the renderer's merge branch drops the key); a null url puts the
     * brand mark back.
     */
    const setLayerImage = (layerId, files) => {
        const file = Array.isArray(files) ? files[0] : files;
        if (!file) return;
        const url = MediaUtilsEndpoints.strapiImageUrl(file);
        if (!url) { toast("That file has no usable url.", "warning"); return; }
        upsertPatch({ id: layerId, type: "image", url });
        setImagePickerFor(null);
    };

    const selectedVideoPatch = (layerPatches || []).find((p) => p.id === selectedLayerId && p.type === "video") || null;

    // Logo and footer are LAYERS — these are their quick-adds. If the layer
    // already exists the button just selects its lane.
    const addLogoLayer = () => {
        if (!logo) return;
        if (!options.showLogo) setOpt({ showLogo: true });
        setSelectedLayerId("logo");
    };
    const addFooterLayer = () => {
        if (!options.footer) setOpt({ footer: "rutba.pk" });
        setSelectedLayerId("footer");
    };

    // ── caption → lines ─────────────────────────────────────
    // Author line breaks first; failing those, sentences (incl. Urdu ۔).
    // NEVER the wrapped visual lines — those depend on font and aspect, and a
    // recipe must survive an aspect switch.
    const splitCaptionSegments = (text) => {
        const t = String(text || "").trim();
        if (!t) return [];
        let parts = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
        if (parts.length < 2) {
            parts = (t.match(/[^.!?۔…]+[.!?۔…]+["')\]]*\s*|[^.!?۔…]+$/g) || [t]).map((s) => s.trim()).filter(Boolean);
        }
        return parts;
    };

    const hasCaptionLines = (layerPatches || []).some((p) => /^caption-line-/.test(p.id));

    // One caption layer per segment: sequential windows sharing the typing
    // budget in proportion to their length, each with a short lead-in (the
    // global 0.8s lead is a video opener, not a per-line delay). The compiled
    // caption hides; its text still drives the video's duration.
    const splitCaption = () => {
        if (!plan) return;
        const segs = splitCaptionSegments(captionText);
        if (segs.length < 2) { toast("The caption is a single line — nothing to split.", "warning"); return; }
        const lead = 0.2;
        const t0 = options.leadInSeconds ?? 0.8;
        const t1 = Math.max(t0 + 1, plan.contentDuration - 0.4);
        let durs = segs.map((s) => lead + s.length / plan.cps + 0.5);
        const k = (t1 - t0) / durs.reduce((a, b) => a + b, 0);
        durs = durs.map((d) => d * k);
        let cur = t0;
        const linePatches = segs.map((s, i) => {
            const timing = { start: +cur.toFixed(3), end: +(cur + durs[i]).toFixed(3) };
            cur += durs[i];
            return { id: `caption-line-${i + 1}`, type: "caption", name: `Line ${i + 1}`, text: s, leadIn: lead, timing };
        });
        setDirty(true);
        setLayerPatches((list) => [
            ...(list || []).filter((p) => !/^caption-line-/.test(p.id) && p.id !== "caption"),
            { id: "caption", visible: false },
            ...linePatches,
        ]);
        setSelectedLayerId(null);
        toast(`Split into ${segs.length} timed lines — each has its own lane.`, "success");
    };

    const restoreSingleCaption = () => {
        setDirty(true);
        setLayerPatches((list) => {
            const arr = (list || []).filter((p) => !/^caption-line-/.test(p.id) && p.id !== "caption");
            return arr.length ? arr : null;
        });
        setSelectedLayerId(null);
    };

    // ── motion (keyframe) helpers ───────────────────────────
    const keyCount = (l) => Object.values(l.keys || {}).reduce((n, list) => n + list.length, 0);
    const firstEase = (l) => {
        for (const list of Object.values(l.keys || {})) for (const k of list) if (k.ease) return k.ease;
        return "";
    };
    const withEase = (keys, ease) => {
        const out = {};
        for (const [prop, list] of Object.entries(keys || {})) {
            out[prop] = list.map((k) => {
                const { ease: _e, ...rest } = k;
                return ease ? { ...rest, ease } : rest;
            });
        }
        return out;
    };
    // Key the layer's CURRENT position (and size) at the playhead. The first
    // key is what arms record-by-doing on the canvas.
    const addKeyAtPlayhead = (l) => {
        if (!plan) return;
        const start = l.timing?.start ?? 0;
        const len = (l.timing?.end ?? plan.duration) - start;
        const t = +Math.max(0, Math.min(len, previewTime - start)).toFixed(3);
        const put = (list = [], v) => {
            if (v === undefined || v === null || Number.isNaN(Number(v))) return list;
            const arr = list.filter((k) => Math.abs(k.t - t) > 0.02);
            arr.push({ t, v: +Number(v).toFixed(4) });
            return arr.sort((a, b) => a.t - b.t);
        };
        const keys = { ...(l.keys || {}) };
        keys.fx = put(keys.fx, l.type === "photo" ? (l.fx ?? 0.3) : l.x / plan.W);
        keys.fy = put(keys.fy, l.type === "photo" ? (l.fy ?? 0.3) : l.y / plan.H);
        if (l.type === "text") keys.sizeFrac = put(keys.sizeFrac, l.sizeFrac || 0.035);
        else if (l.type !== "qr") keys.fw = put(keys.fw, l.fw ?? (l.w ? l.w / plan.W : undefined));
        upsertPatch({ id: l.id, keys });
        toast(`Key at ${t.toFixed(1)}s — scrub the playhead and drag the layer to record the next one.`, "info");
    };

    // Selecting a layer is a statement of intent — front its tab. The user
    // can still flip to Video without losing the selection.
    useEffect(() => { if (selectedLayerId) setRailTab("layer"); }, [selectedLayerId]);

    // The app-wide leave prompt: browser close AND in-app navigation both ask
    // while the recipe has edits that Save/Attach haven't written.
    useUnsavedGuard(dirty && !!selected, "The video recipe has unsaved edits — leave anyway? Save (top right) keeps them on the post.");

    // Layers that exist because a patch appended them — the ones delete can
    // actually remove (compiled layers are hidden with the eye instead).
    const appendedIds = useMemo(
        () => new Set((layerPatches || []).filter((p) => p.type).map((p) => p.id)),
        [layerPatches],
    );

    // Duplicate a lane: the layer's full record under a new id, nudged later
    // on the clock, selected so the copy is what the next edit touches.
    const duplicateLayer = (l) => {
        if (!plan) return;
        const newId = `${l.type}-${Date.now().toString(36)}`;
        const dur = plan.duration;
        const w = l.timing || { start: 0, end: dur };
        const len = Math.min(w.end - w.start, dur);
        const start = Math.min(Math.max(0, w.start + Math.max(1, Math.min(len, 2))), Math.max(0, dur - Math.max(0.5, len)));
        const timing = { start: +start.toFixed(3), end: +Math.min(dur, start + len).toFixed(3) };

        const srcPatch = (layerPatches || []).find((p) => p.id === l.id && p.type);
        let patch = null;
        if (srcPatch) patch = { ...srcPatch, id: newId, timing };
        else if (l.type === "photo") patch = {
            id: newId, type: "photo", index: l.index, kbIndex: l.kbIndex ?? l.index, timing,
            ...(l.fw ? { fx: l.fx, fy: l.fy, fw: l.fw, fh: l.fh, rot: l.rot } : {}),
        };
        else if (l.type === "image") patch = {
            id: newId, type: "image", src: "logo",
            fx: +Math.min(0.9, (l.x / plan.W) + 0.04).toFixed(4), fy: +Math.min(0.9, (l.y / plan.H) + 0.04).toFixed(4),
            fw: +(l.w / plan.W).toFixed(4), opacity: l.opacity, timing,
        };
        else if (l.type === "caption") patch = { id: newId, type: "caption", timing };
        else if (l.type === "text") patch = {
            id: newId, type: "text", text: l.text,
            fx: 0.5, fy: +Math.max(0.04, (l.y / plan.H) - 0.06).toFixed(4),
            sizeFrac: +((l.sizePx || 24) / plan.W).toFixed(4),
            align: l.align || "center", baseline: l.baseline || "top",
            color: l.colorToken || "text", weight: l.weight || 600, timing,
        };
        else if (l.type === "sound") patch = {
            id: newId, type: "sound", trackId: l.trackId, url: l.url,
            offset: l.offset, volume: l.volume, loop: l.loop, timing,
        };
        if (!patch) return;
        upsertPatch(patch);
        setSelectedLayerId(newId);
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
            // The music bed plus any appended sound layers, as one clip list.
            // With no sound layers the bed goes through in its legacy form.
            const soundClips = await clipsFromSoundLayers(thePlan);
            const out = await renderVideo({
                canvas: canvasRef.current,
                plan: thePlan,
                audio: soundClips.length
                    ? { clips: [...(audio ? [{ ...audio, loop: true }] : []), ...soundClips] }
                    : audio,
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

    // ── save the recipe without rendering ───────────────────
    // Everything the editor does lives in React state until something writes
    // video_settings — and until now only attach did, AFTER a render. This
    // writes the same snapshot on its own, so leaving the studio never loses
    // an edit: re-opening the post restores exactly this state.
    const saveRecipe = async () => {
        if (!selected) return;
        setSavingRecipe(true);
        try {
            const video_settings = {
                template: templateId || null,
                options: { ...effectiveOptions },
                layers: layerPatches || [],
                savedAt: new Date().toISOString(),
                ...(selected.video_settings?.renderedAt ? { renderedAt: selected.video_settings.renderedAt } : {}),
            };
            await SocialPostsEndpoints.updateDraft(selected.documentId, { data: { video_settings } });
            // Keep the local copies in sync so re-selecting restores this state
            // without a refetch.
            setSelected((p) => (p ? { ...p, video_settings } : p));
            setPosts((list) => list.map((p) => (p.documentId === selected.documentId ? { ...p, video_settings } : p)));
            setDirty(false);
            toast("Recipe saved — this look re-opens with the post.", "success");
        } catch (err) {
            console.error("Failed to save the recipe", err);
            toast("Failed to save the recipe.", "danger");
        } finally {
            setSavingRecipe(false);
        }
    };

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
            setDirty(false); // attach wrote the full recipe
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
                const ctxData = layerPatches && JSON.stringify(layerPatches).includes("{")
                    ? await fetchProductContext(post) : null;
                const p = buildPlan({ canvas: canvasRef.current, images: imgs, title: post.title, body: post.body, logo, options, layerPatches, context: ctxData || {}, videos: videoLibRef.current });
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

                {/* ── no post chosen: compose a new video from ingredients ── */}
                {!selected && (
                    <>
                        {/* a batch run still needs a canvas to render on */}
                        <canvas ref={canvasRef} style={{ display: "none" }} />
                        {loading ? (
                            <div className="card"><div className="card-body text-center py-5"><span className="spinner-border" /></div></div>
                        ) : (
                            <>
                                <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                                    <h5 className="mb-0"><i className="fas fa-wand-magic-sparkles me-2" />New video</h5>
                                    <span className="text-muted small">
                                        Gather the ingredients, then open the editor to arrange, time and render them.
                                    </span>
                                    <div className="ms-auto d-flex gap-2">
                                        <Link className="btn btn-sm btn-outline-primary" href="/posts?video=without">
                                            <i className="fas fa-list me-1" />Edit an existing post&apos;s video
                                        </Link>
                                        <Link className="btn btn-sm btn-outline-secondary" href="/videos">
                                            <i className="fas fa-clapperboard me-1" />Video library
                                        </Link>
                                    </div>
                                </div>
                                <VideoComposer
                                    posts={posts}
                                    templates={templates}
                                    tracks={tracks}
                                    busy={busy}
                                    opening={composing}
                                    options={options}
                                    onOptionChange={setOpt}
                                    onApplyTemplate={applyTemplate}
                                    onOpen={openComposed}
                                />
                                {pendingCount > 0 && (
                                    <p className="text-muted small mt-3 mb-0">
                                        Or use <strong>Render all pending</strong> above to batch-render the
                                        {" "}{pendingCount} image-only post{pendingCount === 1 ? "" : "s"} with the current look.
                                    </p>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* ── the editor: one big canvas, one settings rail ── */}
                {selected && (
                    <div className="d-flex gap-3 align-items-start">
                        <StrapiMediaLibrary
                            show={showVideoPicker}
                            accept="video"
                            multiple={false}
                            onClose={() => setShowVideoPicker(false)}
                            onSelect={addVideoLayers}
                        />
                        <StrapiMediaLibrary
                            show={!!imagePickerFor}
                            accept="image"
                            multiple={false}
                            onClose={() => setImagePickerFor(null)}
                            onSelect={(files) => (imagePickerFor === "new"
                                ? addImageLayer(files)
                                : setLayerImage(imagePickerFor, files))}
                        />
                        {showSoundPicker && (
                            <div className="modal d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.5)", zIndex: 9999 }}
                                onClick={() => setShowSoundPicker(false)}>
                                <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
                                    <div className="modal-content">
                                        <div className="modal-header py-2">
                                            <h6 className="modal-title mb-0"><i className="fas fa-music me-2" />Add a sound layer</h6>
                                            <Link className="btn btn-sm btn-link p-0 ms-auto me-3" href="/audio">Library →</Link>
                                            <button type="button" className="btn-close" onClick={() => setShowSoundPicker(false)} />
                                        </div>
                                        <div className="modal-body py-2">
                                            {tracks.length === 0 ? (
                                                <div className="alert alert-secondary small mb-0">
                                                    No tracks in rotation.{" "}
                                                    <Link href="/audio">Add some to the audio library</Link> — a URL or an upload, either works.
                                                </div>
                                            ) : (
                                                <>
                                                    <TrackBrowser tracks={tracks} busy={busy} maxHeight={280}
                                                        onAdd={(t) => { addSoundLayer(t); setShowSoundPicker(false); }}
                                                        pickLabel="Bed"
                                                        onPick={options.audioMode === "none" ? (t) => {
                                                            setOpt({ audioMode: "pick", audioTrackId: t.documentId });
                                                            setSelectedLayerId(BED_ID);
                                                            setShowSoundPicker(false);
                                                        } : null}
                                                        previewingId={previewingId} onAudition={previewTrack} />
                                                    <p className="text-muted small mb-0">
                                                        Play auditions a track; <i className="fas fa-plus mx-1" />places it on the
                                                        timeline as its own lane
                                                        {options.audioMode === "none"
                                                            ? <>, and <strong>Bed</strong> makes it the music that loops under the whole video.</>
                                                            : <>, over the music bed.</>}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
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
                                        {/* Save + Render live top-right — always in reach, never below the fold */}
                                        <button className={`btn btn-sm ms-auto ${dirty ? "btn-success" : "btn-outline-success"}`} onClick={saveRecipe}
                                            disabled={!plan || busy || savingRecipe}
                                            title={dirty
                                                ? "Unsaved edits — persist this recipe to the post (layers, timings, motion, everything)"
                                                : "The recipe on the post matches what you see"}>
                                            {savingRecipe ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="fas fa-save me-1" />}
                                            Save{dirty ? " •" : ""}
                                        </button>
                                        <button className="btn btn-sm btn-primary" onClick={handleRender} disabled={!plan || busy || !!blocked}>
                                            <i className="fas fa-clapperboard me-1" />
                                            {rendering ? "Rendering…" : `Render ${plan ? fmtSeconds(plan.duration) : ""}`}
                                        </button>
                                    </div>
                                    <div className="card-body d-flex flex-column align-items-center">
                                        <div className="bg-dark rounded w-100 d-flex justify-content-center" style={{ minHeight: 220 }}>
                                            <canvas ref={canvasRef}
                                                onPointerDown={onCanvasDown} onPointerMove={onCanvasMove}
                                                onPointerUp={onCanvasUp} onPointerCancel={onCanvasUp}
                                                style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "52vh", display: "block", touchAction: "none", cursor: "crosshair" }} />
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

                                                {/* ── the timeline: every layer is a lane; adding layers is
                                                       ITS top line, so everything layer lives in one place ── */}
                                                <VideoTimeline
                                                    plan={plan}
                                                    previewTime={previewTime}
                                                    busy={busy}
                                                    selectedLayerId={selectedLayerId}
                                                    appendedIds={appendedIds}
                                                    extraLanes={bedLanes}
                                                    addRow={(
                                                        <>
                                                            <button className="btn btn-sm btn-outline-primary py-0" onClick={addTextLayer} disabled={busy}>
                                                                <i className="fas fa-font me-1" />Text
                                                            </button>
                                                            <button className="btn btn-sm btn-outline-primary py-0" disabled={busy || !tracks.length}
                                                                title={tracks.length ? "Pick a track from the audio library — as its own trimmed lane, or as the music bed that loops under the whole video" : "No tracks in rotation — add some on /audio"}
                                                                onClick={() => setShowSoundPicker(true)}>
                                                                <i className="fas fa-music me-1" />Sound
                                                            </button>
                                                            <button className="btn btn-sm btn-outline-primary py-0" disabled={busy}
                                                                title="A clip from the media library (or an upload — it lands in the library first). Adds TWO lanes: the picture and its audio, trimmed separately."
                                                                onClick={() => setShowVideoPicker(true)}>
                                                                <i className="fas fa-film me-1" />Video
                                                            </button>
                                                            <button className="btn btn-sm btn-outline-primary py-0" disabled={busy}
                                                                title="An image from the media library (or an upload — it lands in the library first) as its own layer — a sticker, a badge, a second mark. Drag, resize and retime it like anything else."
                                                                onClick={() => setImagePickerFor("new")}>
                                                                <i className="fas fa-image me-1" />Image
                                                            </button>
                                                            <button className="btn btn-sm btn-outline-primary py-0" disabled={busy || !logo}
                                                                title={logo ? "The brand mark from site settings — shown on the video, configured on its lane" : "No site logo available"}
                                                                onClick={addLogoLayer}>
                                                                <i className="fas fa-copyright me-1" />Logo
                                                            </button>
                                                            <button className="btn btn-sm btn-outline-primary py-0" disabled={busy}
                                                                title="The footer line — a text layer along the bottom edge"
                                                                onClick={addFooterLayer}>
                                                                <i className="fas fa-shoe-prints me-1" />Footer
                                                            </button>
                                                            <span className="vr mx-1" />
                                                            <button className="btn btn-sm btn-outline-warning py-0" disabled={busy || !productContext?.price}
                                                                title={productContext?.price ? `Adds a chip showing ${productContext.price} — kept fresh at render time` : "Link a product to the post first"}
                                                                onClick={() => addCommerceLayer("price")}>
                                                                <i className="fas fa-tag me-1" />Price
                                                            </button>
                                                            <button className="btn btn-sm btn-outline-warning py-0" disabled={busy || !productContext?.discount}
                                                                title={productContext?.discount ? `Adds "${productContext.discount} OFF"` : "Needs a product on sale (offer price below selling price)"}
                                                                onClick={() => addCommerceLayer("discount")}>
                                                                <i className="fas fa-percent me-1" />Discount
                                                            </button>
                                                            <button className="btn btn-sm btn-outline-warning py-0" disabled={busy || !productContext?.url}
                                                                title={productContext?.url ? `QR to ${productContext.url}` : "Link a product to the post first"}
                                                                onClick={() => addCommerceLayer("qr")}>
                                                                <i className="fas fa-qrcode me-1" />QR
                                                            </button>
                                                            <button className="btn btn-sm btn-outline-secondary py-0" disabled={busy}
                                                                onClick={() => addCommerceLayer("newSticker")}>NEW</button>
                                                            <button className="btn btn-sm btn-outline-secondary py-0" disabled={busy}
                                                                onClick={() => addCommerceLayer("saleSticker")}>SALE</button>
                                                        </>
                                                    )}
                                                    onSelect={setSelectedLayerId}
                                                    onScrub={(t) => { stopPreview(); setPreviewTime(t); }}
                                                    onPatch={upsertPatch}
                                                    onRemove={(id) => { removePatchLayer(id); if (selectedLayerId === id) setSelectedLayerId(null); }}
                                                    onDuplicate={duplicateLayer}
                                                />
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
                                        {!result && <small className="text-muted">Render (top right) produces the video; the result lands here for download and attach.</small>}
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

                        {/* ── the inspector: the SELECTED layer's properties, or the video's ── */}
                        <div className="flex-shrink-0" style={{ width: 340 }}>
                            <div style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto", paddingRight: 4 }}>
                                <audio ref={trackAudioRef} className="d-none" onEnded={() => setPreviewingId(null)} />

                                {/* ── rail tabs: the selected layer, or the video ── */}
                                {(selectedLayer || bedSelected) && (
                                    <div className="btn-group btn-group-sm w-100 mb-2">
                                        <button type="button" className={`btn ${railTab === "layer" ? "btn-secondary" : "btn-outline-secondary"} text-truncate`}
                                            onClick={() => setRailTab("layer")}>
                                            <i className="fas fa-layer-group me-1" />
                                            {selectedLayer ? (selectedLayer.name || selectedLayer.text || "Layer") : "Music bed"}
                                        </button>
                                        <button type="button" className={`btn ${railTab === "video" ? "btn-secondary" : "btn-outline-secondary"}`}
                                            title="The video's own properties — look, music, timing — without dropping the selection"
                                            onClick={() => setRailTab("video")}>
                                            <i className="fas fa-film me-1" />Video
                                        </button>
                                    </div>
                                )}

                                {/* ── the music bed's inspector: its own card, because the bed is
                                       options rather than a layer and shares none of the geometry
                                       every real layer has ── */}
                                {bedSelected && railTab === "layer" && (
                                <div className="card mb-3">
                                    <div className="card-header py-2 d-flex align-items-center gap-2">
                                        <i className="fas fa-music" />
                                        <strong className="text-truncate">Music bed</strong>
                                        <span className="badge bg-secondary">whole video</span>
                                        <button className="btn btn-sm btn-link ms-auto p-0" title="Back to the video's properties"
                                            onClick={() => setSelectedLayerId(null)}>
                                            <i className="fas fa-xmark" />
                                        </button>
                                    </div>
                                    <div className="card-body py-2">
                                        <div className="btn-group btn-group-sm w-100 mb-2">
                                            {[
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
                                        {tracksLoading && <div className="text-center py-2"><span className="spinner-border spinner-border-sm" /></div>}
                                        {!tracksLoading && tracks.length === 0 && (
                                            <div className="alert alert-secondary py-2 small mb-2">
                                                No tracks in rotation.{" "}
                                                <Link href="/audio">Add some to the audio library</Link> — a URL or an upload, either works.
                                            </div>
                                        )}
                                        {options.audioMode === "pick" && tracks.length > 0 && (
                                            <TrackBrowser tracks={tracks} busy={busy} maxHeight={160}
                                                pickedId={options.audioTrackId}
                                                onPick={(t) => setOpt({ audioTrackId: t.documentId })}
                                                previewingId={previewingId} onAudition={previewTrack} />
                                        )}
                                        <RangeRow label="Volume" value={options.audioVolume} min={0} max={1} step={0.05}
                                            suffix="" disabled={busy} onChange={(v) => setOpt({ audioVolume: v })} />
                                        <RangeRow label="Fade in" value={options.audioFadeIn} min={0} max={4} step={0.1}
                                            suffix="s" disabled={busy} onChange={(v) => setOpt({ audioFadeIn: v })} />
                                        <RangeRow label="Fade out" value={options.audioFadeOut} min={0} max={4} step={0.1}
                                            suffix="s" disabled={busy} onChange={(v) => setOpt({ audioFadeOut: v })} />
                                        <div className="form-check form-switch mt-2">
                                            <input className="form-check-input" type="checkbox" id="opt-randstart" disabled={busy}
                                                checked={!!options.audioRandomStart}
                                                onChange={(e) => setOpt({ audioRandomStart: e.target.checked })} />
                                            <label className="form-check-label small" htmlFor="opt-randstart">
                                                Start at a random point in the track
                                            </label>
                                        </div>
                                        <button className="btn btn-sm btn-outline-danger w-100 mt-2" disabled={busy}
                                            title="No music bed. Sound layers are unaffected — and the Sound button brings a bed back."
                                            onClick={() => { setOpt({ audioMode: "none" }); setSelectedLayerId(null); }}>
                                            <i className="fas fa-volume-xmark me-1" />Remove the bed
                                        </button>
                                        <p className="text-muted small mb-0 mt-2">
                                            The bed loops under the whole video. Play hears it exactly as the file will.
                                        </p>
                                    </div>
                                </div>
                                )}

                                {/* ── selected-layer inspector ── */}
                                {selectedLayer && railTab === "layer" && (
                                <div className="card mb-3">
                                    <div className="card-header py-2 d-flex align-items-center gap-2">
                                        <i className="fas fa-layer-group" />
                                        <strong className="text-truncate">{selectedLayer.name || selectedLayer.text || selectedLayer.id}</strong>
                                        {selectedLayer.timing && (
                                            <span className="badge bg-secondary">{selectedLayer.timing.start.toFixed(1)}–{selectedLayer.timing.end.toFixed(1)}s</span>
                                        )}
                                        <button className="btn btn-sm btn-link ms-auto p-0" title="Back to the video's properties"
                                            onClick={() => setSelectedLayerId(null)}>
                                            <i className="fas fa-xmark" />
                                        </button>
                                    </div>
                                    <div className="card-body py-2">
                                        {/* ── photo: inset geometry — full-stage or picture-in-picture ── */}
                                        {selectedLayer.type === "photo" && (
                                            <div className="border-bottom pb-2 mb-2">
                                                <div className="form-check form-switch mb-1">
                                                    <input className="form-check-input" type="checkbox" id="photo-inset" disabled={busy}
                                                        checked={!!selectedLayer.fw}
                                                        onChange={(e) => upsertPatch(e.target.checked
                                                            ? { id: selectedLayer.id, fx: 0.3, fy: 0.3, fw: 0.42 }
                                                            : { id: selectedLayer.id, fw: 0, fh: 0, rot: 0 })} />
                                                    <label className="form-check-label small" htmlFor="photo-inset"
                                                        title="An inset floats over the other layers — a close-up over the wide shot, a side-by-side. Off = the photo fills the stage.">
                                                        Inset (picture-in-picture)
                                                    </label>
                                                </div>
                                                {!selectedLayer.fw && (
                                                    <p className="text-muted mb-1" style={{ fontSize: 11 }}>
                                                        Or grab a corner handle on the preview — dragging one carves the full-frame photo into an inset.
                                                    </p>
                                                )}
                                                {!!selectedLayer.fw && (
                                                    <>
                                                        <RangeRow label="Size" value={selectedLayer.fw} min={0.1} max={0.9} step={0.01}
                                                            suffix="× width" disabled={busy} onChange={(v) => upsertPatch({ id: selectedLayer.id, fw: v })} />
                                                        <RangeRow label="Rotation" value={selectedLayer.rot || 0} min={-180} max={180} step={1}
                                                            suffix="°" disabled={busy} onChange={(v) => upsertPatch({ id: selectedLayer.id, rot: v })} />
                                                        <p className="text-muted mb-0" style={{ fontSize: 11 }}>
                                                            Drag it on the preview to place it; corner handles resize, the stalk rotates.
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {/* ── photo: order · exclude · focal · seconds (the old image strip) ── */}
                                        {selectedLayer.type === "photo" && (() => {
                                            if (appendedIds.has(selectedLayer.id)) {
                                                return <p className="text-muted small mb-0">A duplicated photo — place and trim it on its lane. Its look follows the original.</p>;
                                            }
                                            const ai = arrangementIndexForPhoto(selectedLayer.index);
                                            const a = ai >= 0 ? arrangement?.[ai] : null;
                                            const e = a ? images.find((i) => i.path === a.path) : null;
                                            if (!a) return <p className="text-muted small mb-0">Retime this photo on its lane.</p>;
                                            return (
                                                <>
                                                    <div className="d-flex align-items-center gap-2 mb-2">
                                                        {e && <img src={e.objectUrl} alt="" style={{ width: 84, height: 60, objectFit: "cover", borderRadius: 4 }} />}
                                                        <div className="btn-group btn-group-sm">
                                                            <button className="btn btn-outline-secondary" disabled={busy || ai === 0}
                                                                onClick={() => moveImage(ai, -1)} title="Earlier"><i className="fas fa-chevron-left" /></button>
                                                            <button className="btn btn-outline-secondary" disabled={busy || ai === (arrangement?.length || 1) - 1}
                                                                onClick={() => moveImage(ai, 1)} title="Later"><i className="fas fa-chevron-right" /></button>
                                                        </div>
                                                        <button className="btn btn-sm btn-outline-secondary" disabled={busy}
                                                            onClick={() => { updateArrangement(ai, { excluded: true }); setSelectedLayerId(null); }}
                                                            title="Take this photo out of the video (re-include it from the video properties)">
                                                            <i className="fas fa-eye-slash" />
                                                        </button>
                                                    </div>
                                                    <div className="row g-2 mb-2">
                                                        <div className="col-6">
                                                            <label className="form-label small mb-1">Focal point</label>
                                                            <select className="form-select form-select-sm" disabled={busy}
                                                                title="What a cropped fit keeps in frame"
                                                                value={a.focal ? FOCAL_PRESETS.find((f) => f.fx === a.focal.fx && f.fy === a.focal.fy)?.k || "c" : "c"}
                                                                onChange={(ev) => {
                                                                    const f = FOCAL_PRESETS.find((x) => x.k === ev.target.value);
                                                                    updateArrangement(ai, { focal: f && f.k !== "c" ? { fx: f.fx, fy: f.fy } : null });
                                                                }}>
                                                                {FOCAL_PRESETS.map((f) => <option key={f.k} value={f.k}>{f.k}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="col-6">
                                                            <label className="form-label small mb-1">Seconds</label>
                                                            <input type="number" className="form-control form-control-sm" min={0.5} max={20} step={0.5}
                                                                placeholder={`${options.secondsPerImage}s`} disabled={busy}
                                                                value={a.seconds ?? ""} title="Seconds for this image (blank = default)"
                                                                onChange={(ev) => updateArrangement(ai, { seconds: ev.target.value === "" ? null : Math.max(0.5, Number(ev.target.value)) })} />
                                                        </div>
                                                    </div>
                                                    <div className="d-flex align-items-center gap-3 mb-2">
                                                        <div className="form-check form-switch mb-0">
                                                            <input className="form-check-input" type="checkbox" id="photo-kb" disabled={busy}
                                                                checked={selectedLayer.kb ?? options.kenBurns}
                                                                onChange={(e) => upsertPatch({ id: selectedLayer.id, kb: e.target.checked })} />
                                                            <label className="form-check-label small" htmlFor="photo-kb"
                                                                title="Slow zoom for THIS photo — the switch in the video's Look is the default">Slow zoom</label>
                                                        </div>
                                                        <select className="form-select form-select-sm" style={{ width: 110 }} disabled={busy}
                                                            title="How THIS photo arrives — the video's Transition is the default"
                                                            value={selectedLayer.enter?.kind || "none"}
                                                            onChange={(e) => {
                                                                const kind = e.target.value;
                                                                upsertPatch({
                                                                    id: selectedLayer.id,
                                                                    enter: kind === "none"
                                                                        ? { kind: "none", seconds: 0 }
                                                                        : { kind, seconds: options.fadeSeconds || 0.7 },
                                                                });
                                                            }}>
                                                            <option value="none">Cut in</option>
                                                            <option value="fade">Fade in</option>
                                                            <option value="slide-left">Slide in</option>
                                                            <option value="push">Push in</option>
                                                            <option value="zoom">Zoom in</option>
                                                        </select>
                                                    </div>
                                                    <p className="text-muted mb-0" style={{ fontSize: 11 }}>
                                                        Order and seconds reflow every photo's slot; dragging the bar on the lane retimes just this one.
                                                    </p>
                                                </>
                                            );
                                        })()}

                                        {/* ── caption: the post's text (compiled), or the copy's own ── */}
                                        {selectedLayer.type === "caption" && selectedLayer.id === "caption" && (
                                            <>
                                                <textarea className="form-control form-control-sm" rows={5} disabled={busy}
                                                    value={captionText} onChange={(e) => { setDirty(true); setBodyOverride(e.target.value); }} />
                                                <div className="d-flex justify-content-between mt-1 mb-2">
                                                    <small className="text-muted">{captionText.length} characters — the video only, not the post.</small>
                                                    {bodyOverride !== null && (
                                                        <button className="btn btn-sm btn-link p-0" onClick={() => { setDirty(true); setBodyOverride(null); }} disabled={busy}>Reset</button>
                                                    )}
                                                </div>
                                                <Link className="btn btn-sm btn-link p-0" href={`/posts/${selected.documentId}`}>Edit the post →</Link>
                                            </>
                                        )}
                                        {selectedLayer.type === "caption" && selectedLayer.id !== "caption" && (
                                            <textarea className="form-control form-control-sm mb-2" rows={4} disabled={busy}
                                                value={(layerPatches || []).find((p) => p.id === selectedLayer.id)?.text || ""}
                                                onChange={(e) => upsertPatch({ id: selectedLayer.id, text: e.target.value })} />
                                        )}
                                        {selectedLayer.type === "caption" && (
                                            <div className="row g-1 mt-1">
                                                <div className="col-4">
                                                    <label className="form-label small mb-1">Reveal</label>
                                                    <select className="form-select form-select-sm" disabled={busy}
                                                        title="How the text comes into view — on this layer's own clock"
                                                        value={(layerPatches || []).find((p) => p.id === selectedLayer.id)?.reveal || selectedLayer.reveal || "type"}
                                                        onChange={(e) => upsertPatch({ id: selectedLayer.id, reveal: e.target.value })}>
                                                        <option value="type">Typewriter</option>
                                                        <option value="word">Word by word</option>
                                                        <option value="line">Line by line</option>
                                                        <option value="all">All at once</option>
                                                    </select>
                                                </div>
                                                <div className="col-4">
                                                    <label className="form-label small mb-1">Position</label>
                                                    <select className="form-select form-select-sm" value={options.textPosition} disabled={busy}
                                                        onChange={(e) => setOpt({ textPosition: e.target.value })}>
                                                        <option value="bottom">Bottom</option>
                                                        <option value="middle">Middle</option>
                                                    </select>
                                                </div>
                                                <div className="col-4">
                                                    <label className="form-label small mb-1">Style</label>
                                                    <select className="form-select form-select-sm" value={options.captionStyle || "box"} disabled={busy}
                                                        onChange={(e) => setOpt({ captionStyle: e.target.value })}>
                                                        <option value="box">Panel</option>
                                                        <option value="bare">Bare text</option>
                                                    </select>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── the brand mark: an image layer whose picture DEFAULTS to
                                               site settings and can be swapped for any library image ── */}
                                        {selectedLayer.type === "image" && selectedLayer.id === "logo" && (() => {
                                            const logoPatch = (layerPatches || []).find((x) => x.id === "logo") || {};
                                            const custom = logoPatch.url || null;
                                            const thumb = custom || logo?.objectUrl || null;
                                            return (
                                            <>
                                                {logoError && !custom && <div className="alert alert-warning py-2 small">{logoError}</div>}
                                                <div className="d-flex align-items-center gap-3 mb-2">
                                                    {thumb && (
                                                        <img src={thumb} alt=""
                                                            style={{ width: 64, height: 40, objectFit: "contain", background: "#222", borderRadius: 4, padding: 4 }} />
                                                    )}
                                                    <div className="form-check form-switch mb-0">
                                                        <input className="form-check-input" type="checkbox" id="opt-logo" disabled={busy || !thumb}
                                                            checked={options.showLogo && !!thumb}
                                                            onChange={(e) => setOpt({ showLogo: e.target.checked })} />
                                                        <label className="form-check-label small" htmlFor="opt-logo">Show on the video</label>
                                                    </div>
                                                </div>
                                                <div className="d-flex align-items-center gap-2 mb-2">
                                                    <button className="btn btn-sm btn-outline-secondary" disabled={busy}
                                                        title="Any image from the media library — the site logo is only the default"
                                                        onClick={() => setImagePickerFor("logo")}>
                                                        <i className="fas fa-image me-1" />Change image…
                                                    </button>
                                                    {custom && (
                                                        <button className="btn btn-sm btn-link p-0" disabled={busy}
                                                            title="Use the brand mark from site settings again"
                                                            onClick={() => upsertPatch({ id: "logo", type: "image", url: null })}>
                                                            Back to the site logo
                                                        </button>
                                                    )}
                                                </div>
                                                {options.showLogo && thumb && (
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
                                                        <p className="text-muted mb-0" style={{ fontSize: 11 }}>Drag it on the preview to place it anywhere.</p>
                                                    </>
                                                )}
                                            </>
                                            );
                                        })()}
                                        {/* ── an appended image (second logo / watermark) ── */}
                                        {selectedLayer.type === "image" && selectedLayer.id !== "logo" && (() => {
                                            const p = (layerPatches || []).find((x) => x.id === selectedLayer.id) || {};
                                            return (
                                                <>
                                                    <RangeRow label="Size" value={p.fw || 0.16} min={0.04} max={0.5} step={0.01}
                                                        suffix="× width" disabled={busy} onChange={(v) => upsertPatch({ id: selectedLayer.id, fw: v })} />
                                                    <RangeRow label="Rotation" value={p.rot || 0} min={-180} max={180} step={1}
                                                        suffix="°" disabled={busy} onChange={(v) => upsertPatch({ id: selectedLayer.id, rot: v })} />
                                                    <p className="text-muted mb-0" style={{ fontSize: 11 }}>Drag it on the preview to place it. Opacity is in Look below.</p>
                                                </>
                                            );
                                        })()}

                                        {/* ── sound layer ── */}
                                        {selectedSoundPatch && (() => {
                                            // A video's audio lane carries a url instead of a
                                            // trackId — its source length comes off the loaded clip.
                                            const soundTrack = selectedSoundPatch.trackId
                                                ? tracks.find((x) => String(x.documentId) === String(selectedSoundPatch.trackId)) : null;
                                            const srcDur = Number(soundTrack?.duration_seconds)
                                                || videoLib[selectedSoundPatch.url]?.duration || 0;
                                            const winLen = selectedLayer.timing
                                                ? selectedLayer.timing.end - selectedLayer.timing.start
                                                : (plan?.duration || 0);
                                            // The start point matters exactly when the source is
                                            // longer than its window — the slider covers the slack.
                                            const offMax = srcDur > winLen + 1
                                                ? Math.max(1, Math.ceil(srcDur - winLen))
                                                : Math.max(1, Math.ceil(srcDur || 180));
                                            return (
                                            <>
                                                {!selectedSoundPatch.url && (
                                                    <>
                                                        <label className="form-label small mb-1">Track</label>
                                                        <TrackBrowser tracks={tracks} busy={busy} maxHeight={150}
                                                            pickedId={selectedSoundPatch.trackId}
                                                            onPick={(t) => upsertPatch({ id: selectedSoundPatch.id, trackId: t.documentId, name: t.name || "Sound" })}
                                                            previewingId={previewingId} onAudition={previewTrack} />
                                                    </>
                                                )}
                                                <RangeRow label={srcDur ? `Start inside the ${Math.round(srcDur)}s source` : "Start inside the track"}
                                                    value={selectedSoundPatch.offset || 0} min={0} max={offMax} step={1}
                                                    suffix="s" disabled={busy} onChange={(v) => upsertPatch({ id: selectedSoundPatch.id, offset: v })} />
                                                <RangeRow label="Volume" value={selectedSoundPatch.volume ?? options.audioVolume} min={0} max={1} step={0.05}
                                                    suffix="" disabled={busy} onChange={(v) => upsertPatch({ id: selectedSoundPatch.id, volume: v })} />
                                                <RangeRow label="Fade in" value={selectedSoundPatch.enter?.seconds ?? 0} min={0} max={4} step={0.1}
                                                    suffix="s" disabled={busy} onChange={(v) => upsertPatch({ id: selectedSoundPatch.id, enter: { kind: "fade", seconds: v } })} />
                                                <RangeRow label="Fade out" value={selectedSoundPatch.exit?.seconds ?? 0} min={0} max={4} step={0.1}
                                                    suffix="s" disabled={busy} onChange={(v) => upsertPatch({ id: selectedSoundPatch.id, exit: { kind: "fade", seconds: v } })} />
                                                <label className="form-label small mb-1 mt-1">When it overlaps other sound</label>
                                                <select className="form-select form-select-sm mb-1" value={selectedSoundPatch.mix || "mix"} disabled={busy}
                                                    onChange={(e) => upsertPatch({ id: selectedSoundPatch.id, mix: e.target.value })}>
                                                    <option value="mix">Mix together</option>
                                                    <option value="duck">Duck the rest — they dip while this plays</option>
                                                    <option value="solo">Only this one — everything else goes silent</option>
                                                </select>
                                                <p className="text-muted mb-0" style={{ fontSize: 11 }}>
                                                    Plays in the preview and the finished file. Place and trim it on its lane;
                                                    the fades above are its edges, the overlap rule is how it treats the music
                                                    bed and other clips under it.
                                                </p>
                                            </>
                                            );
                                        })()}

                                        {/* ── the compiled footer line ── */}
                                        {selectedLayer.type === "text" && !selectedTextPatch && (
                                            <>
                                                <label className="form-label small mb-1">Footer line</label>
                                                <input className="form-control form-control-sm" value={options.footer} disabled={busy}
                                                    placeholder="rutba.pk" onChange={(e) => setOpt({ footer: e.target.value })} />
                                                <p className="text-muted mb-0 mt-1" style={{ fontSize: 11 }}>Drag it on the preview to place it.</p>
                                            </>
                                        )}

                                        {/* ── video clip: its picture half ── */}
                                        {selectedVideoPatch && (() => {
                                            const entry = videoLib[selectedVideoPatch.url];
                                            const audioId = `${selectedVideoPatch.id}-audio`;
                                            const hasAudioLane = (layerPatches || []).some((p) => p.id === audioId);
                                            return (
                                                <>
                                                    {!entry && <p className="text-muted small mb-2">Loading the clip…</p>}
                                                    <RangeRow label="Start inside the clip" value={selectedVideoPatch.offset || 0}
                                                        min={0} max={Math.max(1, Math.floor((entry?.duration || 60) - 0.5))} step={0.5}
                                                        suffix="s" disabled={busy}
                                                        onChange={(v) => upsertPatch({ id: selectedVideoPatch.id, offset: v })} />
                                                    <div className="form-check form-switch mb-1">
                                                        <input className="form-check-input" type="checkbox" id="video-inset" disabled={busy}
                                                            checked={!!selectedVideoPatch.fw}
                                                            onChange={(e) => upsertPatch(e.target.checked
                                                                ? { id: selectedVideoPatch.id, fx: 0.3, fy: 0.3, fw: 0.42 }
                                                                : { id: selectedVideoPatch.id, fw: 0, fh: 0, rot: 0 })} />
                                                        <label className="form-check-label small" htmlFor="video-inset">
                                                            Inset (picture-in-picture) — off = the clip covers the frame
                                                        </label>
                                                    </div>
                                                    {!selectedVideoPatch.fw && (
                                                        <p className="text-muted mb-1" style={{ fontSize: 11 }}>
                                                            Or grab a corner handle on the preview — dragging one carves the full-frame clip into an inset.
                                                        </p>
                                                    )}
                                                    {!!selectedVideoPatch.fw && (
                                                        <RangeRow label="Size" value={selectedVideoPatch.fw} min={0.1} max={0.9} step={0.01}
                                                            suffix="× width" disabled={busy} onChange={(v) => upsertPatch({ id: selectedVideoPatch.id, fw: v })} />
                                                    )}
                                                    <p className="text-muted mb-0" style={{ fontSize: 11 }}>
                                                        {entry ? `${entry.duration.toFixed(1)}s source clip. ` : ""}
                                                        The picture and its sound are separate lanes —{" "}
                                                        {hasAudioLane
                                                            ? <button className="btn btn-link p-0 align-baseline" style={{ fontSize: 11 }}
                                                                onClick={() => setSelectedLayerId(audioId)}>its audio lane</button>
                                                            : "its audio lane was removed (the clip plays silent)"}
                                                        {hasAudioLane ? " trims independently; delete it to mute the clip." : ""}
                                                    </p>
                                                </>
                                            );
                                        })()}

                                        {/* ── the open/close dip owns its own fade ── */}
                                        {selectedLayer.type === "edges" && (
                                            <RangeRow label="Open/close fade" value={options.edgeFadeSeconds ?? 0.45} min={0} max={1.5} step={0.05}
                                                suffix="s" disabled={busy} onChange={(v) => setOpt({ edgeFadeSeconds: v })} />
                                        )}
                                        {/* ── chrome layers configure through the video's own properties ── */}
                                        {["gradient", "title", "outro", "progress"].includes(selectedLayer.type) && (
                                            <p className="text-muted mb-0" style={{ fontSize: 11 }}>
                                                Part of the video's look — its options are in the video properties (press × above).
                                                Use the lane to retime it, or its eye to hide it.
                                            </p>
                                        )}

                                        {/* ── look: opacity + picture filters, per layer ── */}
                                        {["photo", "video", "image", "text"].includes(selectedLayer.type) && (
                                            <LookRows layer={selectedLayer} busy={busy}
                                                withFilters={selectedLayer.type !== "text"}
                                                onPatch={(p) => upsertPatch({ id: selectedLayer.id, ...p })} />
                                        )}

                                        {/* ── motion: keys on the layer's local clock ── */}
                                        {(["text", "qr", "image"].includes(selectedLayer.type)
                                            || ((selectedLayer.type === "photo" || selectedLayer.type === "video") && !!selectedLayer.fw)) && (
                                            <div className="border rounded p-2 mt-2">
                                                <div className="d-flex align-items-center gap-2">
                                                    <strong className="small">Motion</strong>
                                                    {selectedLayer.keys && <span className="badge bg-secondary">{keyCount(selectedLayer)} keys</span>}
                                                    <button className="btn btn-sm btn-outline-primary py-0 ms-auto" disabled={busy}
                                                        title="Key this layer's position and size at the playhead — then scrub and drag it on the preview to record the next key"
                                                        onClick={() => addKeyAtPlayhead(selectedLayer)}>
                                                        ◆ Key @ {Math.max(0, previewTime - (selectedLayer.timing?.start ?? 0)).toFixed(1)}s
                                                    </button>
                                                </div>
                                                {selectedLayer.keys && (
                                                    <>
                                                        <div className="d-flex align-items-center gap-2 mt-2">
                                                            <label className="small text-muted mb-0">Easing</label>
                                                            <select className="form-select form-select-sm" style={{ width: 130 }} disabled={busy}
                                                                value={firstEase(selectedLayer)}
                                                                onChange={(e) => upsertPatch({ id: selectedLayer.id, keys: withEase(selectedLayer.keys, e.target.value) })}>
                                                                <option value="">Linear</option>
                                                                <option value="in">Ease in</option>
                                                                <option value="out">Ease out</option>
                                                                <option value="in-out">Ease in-out</option>
                                                            </select>
                                                            <button className="btn btn-sm btn-outline-danger py-0 ms-auto" disabled={busy}
                                                                title="Remove every key — the layer goes back to sitting still"
                                                                onClick={() => upsertPatch({ id: selectedLayer.id, keys: null })}>Clear</button>
                                                        </div>
                                                        <p className="text-muted mb-0 mt-1" style={{ fontSize: 11 }}>
                                                            With keys set, dragging on the preview RECORDS position at the playhead.
                                                            Diamonds on the lane: drag to retime, double-click to delete.
                                                        </p>
                                                    </>
                                                )}
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
                                                <RangeRow label="Rotation" value={selectedTextPatch.rot || 0} min={-180} max={180} step={1}
                                                    suffix="°" disabled={busy} onChange={(v) => upsertPatch({ id: selectedTextPatch.id, rot: v })} />
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
                                        {/* ── selected QR layer editor ── */}
                                        {selectedQrPatch && (
                                            <div className="border rounded p-2 mt-2">
                                                <RangeRow label="QR size" value={selectedQrPatch.fw || 0.24} min={0.12} max={0.45} step={0.01}
                                                    suffix="× width" disabled={busy} onChange={(v) => upsertPatch({ id: selectedQrPatch.id, fw: v })} />
                                                <RangeRow label="Rotation" value={selectedQrPatch.rot || 0} min={-45} max={45} step={1}
                                                    suffix="°" disabled={busy} onChange={(v) => upsertPatch({ id: selectedQrPatch.id, rot: v })} />
                                                <p className="text-muted mb-0" style={{ fontSize: 11 }}>
                                                    Encodes the linked product's storefront page{productContext?.url ? `: ${productContext.url}` : ""} —
                                                    resolved fresh on every render. Drag it on the preview to place it.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                )}

                                {/* ── video inspector: the video's own properties ── */}
                                {((!selectedLayer && !bedSelected) || railTab === "video") && (
                                <>
                                <p className="text-muted mb-2" style={{ fontSize: 11 }}>
                                    Click a lane or a layer on the preview to edit that layer; these are the video's own properties.
                                </p>
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

                                {/* The logo has no card here any more: it is an image layer like
                                   any other, and the timeline's Logo button brings it back when
                                   it is switched off. */}

                                {/* ── excluded photos, so a hidden one has a way back ── */}
                                {arrangement?.some((a) => a.excluded) && (
                                    <div className="card mb-3">
                                        <div className="card-header py-2"><i className="fas fa-eye-slash me-2" />Excluded photos</div>
                                        <div className="card-body py-2 d-flex flex-wrap gap-2">
                                            {arrangement.map((a, ai) => {
                                                if (!a.excluded) return null;
                                                const e = images.find((i) => i.path === a.path);
                                                return (
                                                    <button key={a.path} className="btn btn-sm btn-outline-secondary p-1" disabled={busy}
                                                        title="Put this photo back into the video"
                                                        onClick={() => updateArrangement(ai, { excluded: false })}>
                                                        {e ? <img src={e.objectUrl} alt="" style={{ width: 56, height: 40, objectFit: "cover", borderRadius: 3 }} />
                                                            : <i className="fas fa-image" />}
                                                        <i className="fas fa-rotate-left ms-1" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* The music bed has no card here either: it is a lane on the
                                   timeline, and its properties open when that lane is selected.
                                   The Sound button makes one when there is none. */}

                                {/* ── pace & render: what is genuinely VIDEO-level. Everything
                                       that belonged to one layer now lives on that layer — typing
                                       on the caption, open/close fade on its lane, per-image
                                       seconds on each photo (these two are just the defaults). ── */}
                                <div className="card mb-3">
                                    <div className="card-header py-2"><i className="fas fa-stopwatch me-2" />Pace &amp; render</div>
                                    <div className="card-body">
                                        <RangeRow label="Seconds per image (default)" value={options.secondsPerImage} min={1.5} max={8} step={0.5}
                                            suffix="s" disabled={busy} onChange={(v) => setOpt({ secondsPerImage: v })} />
                                        <RangeRow label="Crossfade (default)" value={options.fadeSeconds} min={0} max={2} step={0.1}
                                            suffix="s" disabled={busy} onChange={(v) => setOpt({ fadeSeconds: v })} />
                                        <RangeRow label="Maximum length" value={options.maxSeconds} min={10} max={180} step={5}
                                            suffix="s" disabled={busy} onChange={(v) => setOpt({ maxSeconds: v })} />
                                        <RangeRow label="Frame rate" value={options.fps} min={15} max={60} step={5}
                                            suffix=" fps" disabled={busy} onChange={(v) => setOpt({ fps: v })} />
                                        <p className="text-muted small mb-0">
                                            The video runs for whichever is longer — the images, or the time the caption
                                            needs. Per-photo seconds live on each photo's lane; these are the defaults.
                                        </p>
                                    </div>
                                </div>

                                {/* ── caption text — also editable from its lane ── */}
                                {selected && (
                                    <div className="card mb-3">
                                        <div className="card-header py-2 d-flex align-items-center">
                                            <i className="fas fa-keyboard me-2" />Caption
                                            <Link className="btn btn-sm btn-link ms-auto p-0" href={`/posts/${selected.documentId}`}>Edit the post →</Link>
                                        </div>
                                        <div className="card-body py-2">
                                            <textarea className="form-control form-control-sm" rows={4} disabled={busy}
                                                value={captionText} onChange={(e) => { setDirty(true); setBodyOverride(e.target.value); }} />
                                            <div className="d-flex justify-content-between mt-1 mb-2">
                                                <small className="text-muted">{captionText.length} characters — the video only, not the post.</small>
                                                {bodyOverride !== null && (
                                                    <button className="btn btn-sm btn-link p-0" onClick={() => { setDirty(true); setBodyOverride(null); }} disabled={busy}>Reset</button>
                                                )}
                                            </div>
                                            <RangeRow label="Typing speed" value={options.charsPerSecond} min={4} max={45} step={1}
                                                suffix=" chars/s" disabled={busy} onChange={(v) => setOpt({ charsPerSecond: v })} />
                                            <RangeRow label="Text size" value={options.fontScale} min={0.7} max={1.5} step={0.05}
                                                suffix="×" disabled={busy} onChange={(v) => setOpt({ fontScale: v })} />
                                            {!hasCaptionLines ? (
                                                <button className="btn btn-sm btn-outline-primary w-100" disabled={busy || !plan}
                                                    title="One caption layer per line/sentence, each with its own lane — retime, restyle or delete lines individually"
                                                    onClick={splitCaption}>
                                                    <i className="fas fa-grip-lines me-1" />Split into timed lines
                                                </button>
                                            ) : (
                                                <button className="btn btn-sm btn-outline-secondary w-100" disabled={busy}
                                                    onClick={restoreSingleCaption}>
                                                    <i className="fas fa-paragraph me-1" />Back to one caption
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                                </>
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

/**
 * The track chooser everywhere a track gets picked: a search box plus the
 * library's tags as chips narrow the list; every row auditions; `onPick`
 * (when given) selects, `onAdd` (when given) places the row's track as a NEW
 * sound layer — picking and adding are different acts, so they are different
 * buttons. Active chips AND together — "upbeat" + "retail" is tracks tagged
 * both.
 */
function TrackBrowser({ tracks, busy, pickedId, onPick, pickLabel = "Use", onAdd, previewingId, onAudition, maxHeight = 190 }) {
    const [q, setQ] = useState("");
    const [tagsOn, setTagsOn] = useState([]);
    const norm = (s) => String(s || "").toLowerCase();
    const allTags = useMemo(() => {
        const s = new Set();
        for (const t of tracks) for (const x of (Array.isArray(t.tags) ? t.tags : [])) s.add(String(x));
        return [...s].sort((a, b) => a.localeCompare(b));
    }, [tracks]);
    const shown = useMemo(() => {
        const needle = norm(q).trim();
        return tracks.filter((t) => {
            const tags = Array.isArray(t.tags) ? t.tags.map(norm) : [];
            if (tagsOn.length && !tagsOn.every((x) => tags.includes(norm(x)))) return false;
            if (!needle) return true;
            return norm(t.name).includes(needle) || norm(t.credit).includes(needle)
                || tags.some((x) => x.includes(needle));
        });
    }, [tracks, q, tagsOn]);
    const toggleTag = (x) => setTagsOn((on) => (on.includes(x) ? on.filter((y) => y !== x) : [...on, x]));
    return (
        <>
            {(tracks.length > 5 || allTags.length > 0) && (
                <input className="form-control form-control-sm mb-1" placeholder="Search tracks…" value={q}
                    onChange={(e) => setQ(e.target.value)} disabled={busy} />
            )}
            {allTags.length > 0 && (
                <div className="d-flex flex-wrap gap-1 mb-1">
                    {allTags.map((x) => (
                        <button key={x} type="button" disabled={busy}
                            className={`btn btn-sm py-0 px-2 ${tagsOn.includes(x) ? "btn-primary" : "btn-outline-secondary"}`}
                            style={{ fontSize: 11 }} onClick={() => toggleTag(x)}>{x}</button>
                    ))}
                    {tagsOn.length > 0 && (
                        <button type="button" className="btn btn-sm btn-link py-0 px-1" style={{ fontSize: 11 }}
                            onClick={() => setTagsOn([])}>clear</button>
                    )}
                </div>
            )}
            <div className="list-group list-group-flush mb-2" style={{ maxHeight, overflowY: "auto" }}>
                {shown.length === 0 && (
                    <div className="text-muted small py-2 px-2">No track matches — clear the search or the tags.</div>
                )}
                {shown.map((t) => {
                    const chosen = pickedId != null && String(pickedId) === String(t.documentId);
                    return (
                        <div key={t.documentId} className={`list-group-item d-flex align-items-center gap-2 py-1 px-2 ${chosen ? "list-group-item-primary" : ""}`}>
                            {onAudition && (
                                <button className="btn btn-sm btn-link p-0" title="Listen" disabled={busy} onClick={() => onAudition(t)}>
                                    <i className={`fas ${previewingId === t.documentId ? "fa-pause" : "fa-play"}`} />
                                </button>
                            )}
                            <span className="flex-grow-1 text-truncate small" title={t.credit || t.name}>
                                {t.name}
                                {!t.audio_file?.id && <i className="fas fa-link ms-1 text-muted" title="foreign URL" style={{ fontSize: 10 }} />}
                                {(Array.isArray(t.tags) ? t.tags : []).slice(0, 3).map((x) => (
                                    <span key={x} className="badge bg-light text-dark border ms-1" style={{ fontSize: 9 }}>{x}</span>
                                ))}
                            </span>
                            {onPick && (
                                <button className={`btn btn-sm ${chosen ? "btn-primary" : "btn-outline-secondary"}`} disabled={busy}
                                    onClick={() => onPick(t)}>
                                    {chosen ? <i className="fas fa-check" /> : pickLabel}
                                </button>
                            )}
                            {onAdd && (
                                <button className="btn btn-sm btn-outline-primary" disabled={busy}
                                    title="Add this track as a sound layer on the timeline" onClick={() => onAdd(t)}>
                                    <i className="fas fa-plus" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}

/**
 * Per-layer look: opacity plus the picture filters (the renderer's
 * layer.filter). Defaults write as null so an untouched layer stays exactly
 * the pre-filter patch it was.
 */
function LookRows({ layer, busy, onPatch, withFilters = true }) {
    const f = layer.filter || {};
    const put = (k, v, dflt) => {
        const next = { ...f };
        if (v === dflt) delete next[k]; else next[k] = v;
        onPatch({ filter: Object.keys(next).length ? next : null });
    };
    const isDefault = !layer.filter && (layer.opacity == null || layer.opacity === 1);
    return (
        <div className="border rounded p-2 mt-2">
            <div className="d-flex align-items-center">
                <strong className="small">Look</strong>
                {!isDefault && (
                    <button className="btn btn-sm btn-link py-0 ms-auto" style={{ fontSize: 11 }} disabled={busy}
                        title="Back to the plain picture" onClick={() => onPatch({ opacity: null, filter: null })}>Reset</button>
                )}
            </div>
            <RangeRow label="Opacity" value={layer.opacity ?? 1} min={0.05} max={1} step={0.05} suffix=""
                disabled={busy} onChange={(v) => onPatch({ opacity: v === 1 ? null : v })} />
            {withFilters && (
                <>
                    <RangeRow label="Brightness" value={f.brightness ?? 1} min={0.4} max={1.6} step={0.05} suffix="×"
                        disabled={busy} onChange={(v) => put("brightness", v, 1)} />
                    <RangeRow label="Contrast" value={f.contrast ?? 1} min={0.4} max={1.6} step={0.05} suffix="×"
                        disabled={busy} onChange={(v) => put("contrast", v, 1)} />
                    <RangeRow label="Saturation" value={f.saturate ?? 1} min={0} max={2} step={0.05} suffix="×"
                        disabled={busy} onChange={(v) => put("saturate", v, 1)} />
                    <RangeRow label="Blur" value={f.blur ?? 0} min={0} max={16} step={0.5} suffix="px"
                        disabled={busy} onChange={(v) => put("blur", v, 0)} />
                    <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" id={`look-bw-${layer.id}`} disabled={busy}
                            checked={(f.grayscale ?? 0) >= 1}
                            onChange={(e) => put("grayscale", e.target.checked ? 1 : 0, 0)} />
                        <label className="form-check-label small" htmlFor={`look-bw-${layer.id}`}>Black &amp; white</label>
                    </div>
                </>
            )}
        </div>
    );
}
