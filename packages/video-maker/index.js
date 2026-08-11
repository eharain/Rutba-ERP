/**
 * @rutba/video-maker — turn a post's still images into a short video with the
 * post text typed over it, using only what a browser engine already ships.
 *
 * Every frame is painted onto a <canvas>; the canvas' captureStream() is fed to
 * a MediaRecorder, with an optional music track muxed in. No ffmpeg, no
 * server-side render farm, and no dependencies of any kind.
 *
 * TWO HOSTS, ONE RENDERER. rutba-social runs this in a page; the Rutba Social
 * Poster runs it in an Electron window. Nothing in here may assume either — so
 * there is no framework, no app config, and above all no hardcoded transport:
 * every caller passes its own `fetchMedia(url) => Promise<Blob>`. That single
 * seam is what lets one file serve both, because the two hosts fetch media in
 * genuinely different ways (a page must go through a same-origin proxy or the
 * canvas is tainted; Electron can fetch in the main process and hand bytes
 * over IPC).
 *
 * EVERYTHING IS A LAYER. A photo is a layer, the caption is a layer, the logo
 * and the QR are layers — and a sound is a layer too. Every layer carries the
 * same envelope: order (z), timing (start/end on the video's clock), entry and
 * exit (fade / slide / zoom / push, applied around the painter), fractional
 * geometry where it applies, and state (visible, named). Legacy options
 * compile into this stack in compileLayers — options are sugar, layers are
 * truth — which is why every pre-layer recipe keeps rendering identically.
 *
 * WHAT CALLERS MUST KNOW
 * - Rendering is REAL TIME: a 30-second video takes 30 seconds.
 * - The canvas must belong to a live document. Where the document is not being
 *   composited some browser APIs stall, which is why the render loop is driven
 *   by a timer rather than requestAnimationFrame, and why images are decoded
 *   with createImageBitmap rather than HTMLImageElement.decode().
 * - Images MUST arrive as blobs from fetchMedia. Drawing a cross-origin image
 *   taints the canvas and captureStream() then throws SecurityError.
 */

// ── output shapes ────────────────────────────────────────────────────────────

export const ASPECTS = {
    vertical: { key: 'vertical', label: 'Vertical 9:16', hint: 'Reels · Shorts · TikTok · Status', width: 1080, height: 1920 },
    square: { key: 'square', label: 'Square 1:1', hint: 'Instagram & Facebook feed', width: 1080, height: 1080 },
    landscape: { key: 'landscape', label: 'Landscape 16:9', hint: 'YouTube · LinkedIn · X', width: 1920, height: 1080 },
};

export const THEMES = {
    dark: { key: 'dark', label: 'Dark', bg: '#0d0b14', scrim: 'rgba(8,6,14,0.72)', text: '#ffffff', dim: 'rgba(255,255,255,0.62)', accent: '#ffc107' },
    light: { key: 'light', label: 'Light', bg: '#f4f4f6', scrim: 'rgba(255,255,255,0.86)', text: '#141118', dim: 'rgba(20,17,24,0.6)', accent: '#d6336c' },
};

export const DEFAULTS = {
    aspect: 'vertical',
    theme: 'dark',
    fps: 30,
    secondsPerImage: 3.5,
    fadeSeconds: 0.7,
    charsPerSecond: 16,
    leadInSeconds: 0.8,
    tailSeconds: 1.8,
    maxSeconds: 60,
    kenBurns: true,
    fit: 'blur', // 'blur' = whole image, blurred fill behind · 'cover' = fill the frame, cropped
    // How one image hands over to the next. 'fade' is the legacy crossfade;
    // 'cut' is a hard cut (no overlap at all).
    transition: 'fade', // 'fade' | 'cut' | 'slide' | 'push' | 'zoom'
    // Branded end card: theme background + logo + a line of text, appended to
    // the timeline. 0 = off (and off is what every stored recipe predates).
    outroSeconds: 0,
    outroText: '', // falls back to `footer`
    // The open/close dip to black (white on the light theme).
    edgeFadeSeconds: 0.45,
    showTitle: true,
    titleSeconds: 3.2,
    showProgress: true,
    textPosition: 'bottom', // 'bottom' | 'middle'
    captionStyle: 'box', // 'box' (scrim panel) | 'bare' (shadowed text, no panel)
    fontScale: 1,
    quality: 'high', // 'high' | 'medium' | 'low'
    footer: '',
    // Brand mark, taken from the site settings row for this app.
    showLogo: true,
    logoPosition: 'top-right', // top-left | top-right | bottom-left | bottom-right
    logoScale: 0.16, // fraction of the frame width
    logoOpacity: 0.92,
    // Music. `audioMode` decides where the track comes from; the track itself is
    // handed to renderVideo, not stored here.
    audioMode: 'none', // 'none' | 'pick' | 'random'
    audioTrackId: null, // media-library file id when audioMode === 'pick'
    audioVolume: 0.7,
    audioFadeIn: 1.2,
    audioFadeOut: 1.6,
    audioRandomStart: true, // start a random distance into the track
};

const QUALITY_BPP = { high: 0.10, medium: 0.06, low: 0.035 };

// Throwaway recording that brings the encoder up before the real take starts.
// See primeEncoder.
const PRIME_FRAMES = 8;
const PRIME_SLICE_MS = 100;

const FONT_STACK = '"Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif';

// ── capability probing ───────────────────────────────────────────────────────

// H.264 in MP4 first: every platform accepts it, and several reject WebM
// outright. Chrome only grew MP4 recording recently, so WebM stays as the
// fallback rather than the target.
//
// The audio list is separate rather than "the video list plus a codec": a
// container string that names only a video codec can be reported as supported
// and then drop the audio track on the floor, which is how you end up with a
// silent file and no error to explain it.
const MIME_CANDIDATES = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
];

const MIME_CANDIDATES_AV = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
];

export function pickMimeType(withAudio = false) {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const m of (withAudio ? MIME_CANDIDATES_AV : MIME_CANDIDATES)) {
        try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* keep looking */ }
    }
    return null;
}

export function extensionFor(mimeType) {
    return /mp4/i.test(mimeType || '') ? 'mp4' : 'webm';
}

/** Why video making is unavailable here, or null when it works. */
export function unsupportedReason() {
    if (typeof document === 'undefined') return null; // SSR — decided in the browser
    if (typeof MediaRecorder === 'undefined') return 'This browser has no MediaRecorder, so it cannot encode video. Use Chrome or Edge.';
    const c = document.createElement('canvas');
    if (typeof c.captureStream !== 'function') return 'This browser cannot capture a canvas as video. Use Chrome or Edge.';
    if (!pickMimeType()) return 'This browser exposes no video codec that MediaRecorder can use. Use Chrome or Edge.';
    return null;
}

// ── media loading ────────────────────────────────────────────────────────────

/** Media items on a post that are actually still images. */
export function imageItems(post) {
    const out = [];
    const push = (m) => {
        if (!m || !m.url) return;
        const isImage = /^image\//i.test(m.mime || '') || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(m.url);
        if (!isImage) return;
        if (out.some((x) => x.id === m.id)) return;
        out.push(m);
    };
    if (post?.cover) push(post.cover);
    (post?.media || []).forEach(push);
    return out;
}

/** True when a media file is a video, by mime or by extension. */
export function isVideoFile(m) {
    return /^video\//i.test(m?.mime || '') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(m?.url || '');
}

/** True when a post carries a video — attached or sitting in its gallery. */
export function hasVideo(post) {
    return (post?.video || []).length > 0 || (post?.media || []).some(isVideoFile);
}

/** True when a post has stills and nothing that is already a video. */
export function isImageOnly(post) {
    return !hasVideo(post) && imageItems(post).length > 0;
}

/**
 * Load images as blobs through our own proxy so the canvas stays untainted.
 * Returns the ones that loaded plus a list of the ones that didn't — a single
 * dead URL must not sink the whole video.
 */
/**
 * The host's media transport. Set once at startup with configureMediaFetch, or
 * passed per call. Kept as a seam rather than a hardcoded fetch because the two
 * hosts genuinely differ: a page has to route through a same-origin proxy to
 * keep the canvas untainted, while Electron fetches in the main process.
 */
let _fetchMedia = null;

/** Install the default `fetchMedia(url, { signal }) => Promise<Blob>`. */
export function configureMediaFetch(fn) {
    _fetchMedia = typeof fn === 'function' ? fn : null;
}

function mediaFetcher(override) {
    const fn = override || _fetchMedia;
    if (!fn) {
        throw new Error(
            'video-maker has no media transport. Call configureMediaFetch(fn) at startup, '
            + 'or pass { fetchMedia } to the load call.',
        );
    }
    return fn;
}

/**
 * One image, via the proxy, decoded and ready to draw.
 *
 * createImageBitmap first: it decodes off the main thread and, unlike
 * HTMLImageElement.decode(), does not depend on the document being rendered —
 * decode() can hang indefinitely when the page is not compositing, which would
 * wedge an unattended batch with no error to show for it. The <img> path stays
 * as a fallback for browsers without it, on a timeout for the same reason.
 */
export async function loadImage(url, { signal, timeoutMs = 20000, fetchMedia } = {}) {
    const blob = await mediaFetcher(fetchMedia)(url, { signal });
    const objectUrl = URL.createObjectURL(blob);

    if (typeof createImageBitmap === 'function') {
        try {
            const bmp = await createImageBitmap(blob);
            return { img: bmp, width: bmp.width, height: bmp.height, objectUrl, url };
        } catch { /* fall through to the <img> path */ }
    }

    const img = new Image();
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out decoding the image')), timeoutMs);
        img.onload = () => { clearTimeout(timer); resolve(); };
        img.onerror = () => { clearTimeout(timer); reject(new Error('the browser could not decode this image')); };
        img.src = objectUrl;
    });
    return { img, width: img.naturalWidth, height: img.naturalHeight, objectUrl, url };
}

export async function loadImages(urls, { onProgress, signal, fetchMedia } = {}) {
    const images = [];
    const failures = [];
    for (let i = 0; i < urls.length; i++) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const url = urls[i];
        try {
            images.push(await loadImage(url, { signal, fetchMedia }));
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            failures.push({ url, error: err?.message || String(err) });
        }
        onProgress?.((i + 1) / urls.length);
    }
    return { images, failures };
}

// ── audio ────────────────────────────────────────────────────────────────────

// One context for decoding, previewing and recording. AudioBuffers are bound to
// the context that decoded them, so sharing it keeps a previewed track usable by
// the recorder without a second decode.
let _audioCtx = null;
export function audioContext() {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!_audioCtx) _audioCtx = new Ctor();
    return _audioCtx;
}

/** Decode a music track through the proxy. Returns an AudioBuffer. */
export async function loadAudioTrack(url, { signal, fetchMedia } = {}) {
    const ctx = audioContext();
    if (!ctx) throw new Error('This browser has no Web Audio support, so music cannot be added.');
    const blob = await mediaFetcher(fetchMedia)(url, { signal });
    const bytes = await blob.arrayBuffer();
    // Callback form as well as promise form: Safari still only implements the
    // callback signature, and returns undefined from the promise one.
    return await new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(bytes, resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
}

/** True when a media-library file is a music track we can use. */
export function isAudioFile(file) {
    return /^audio\//i.test(file?.mime || '') || /\.(mp3|m4a|aac|wav|ogg|opus|flac)(\?|$)/i.test(file?.url || file?.name || '');
}

export function releaseImages(images) {
    (images || []).forEach((i) => {
        try { URL.revokeObjectURL(i.objectUrl); } catch { /* already gone */ }
        // ImageBitmaps hold decoded pixels outside the JS heap; a batch over a
        // few hundred posts leaks steadily without this.
        try { i.img?.close?.(); } catch { /* not a bitmap */ }
    });
}

// ── text layout ──────────────────────────────────────────────────────────────

/**
 * Wrap `text` to `maxWidth` ONCE, up front, recording each line as a slice of
 * the source string. Laying out the full text before any of it is revealed is
 * what stops the lines re-flowing while they type: wrapping the partial text
 * each frame makes every word jump to a new place the moment it completes.
 */
function layoutLines(ctx, text, maxWidth) {
    const src = String(text || '').replace(/\r\n/g, '\n');
    const lines = [];

    const hardSplit = (start, end) => {
        // A single "word" wider than the line (a long URL) — break it by character.
        let s = start;
        for (let i = start + 1; i <= end; i++) {
            if (ctx.measureText(src.slice(s, i)).width > maxWidth && i - 1 > s) {
                lines.push({ start: s, end: i - 1 });
                s = i - 1;
            }
        }
        return s;
    };

    let cursor = 0;
    while (cursor <= src.length) {
        let nl = src.indexOf('\n', cursor);
        const paraEnd = nl === -1 ? src.length : nl;
        const para = src.slice(cursor, paraEnd);

        if (!para.trim()) {
            lines.push({ start: cursor, end: Math.min(paraEnd + 1, src.length) });
        } else {
            const words = [];
            const re = /\S+\s*/g;
            let m;
            while ((m = re.exec(para))) words.push({ start: cursor + m.index, end: cursor + m.index + m[0].length });

            let cur = null;
            for (const w of words) {
                if (!cur) {
                    if (ctx.measureText(src.slice(w.start, w.end).trimEnd()).width > maxWidth) {
                        const rest = hardSplit(w.start, w.end);
                        cur = { start: rest, end: w.end };
                    } else {
                        cur = { start: w.start, end: w.end };
                    }
                    continue;
                }
                const trial = src.slice(cur.start, w.end).trimEnd();
                if (ctx.measureText(trial).width > maxWidth) {
                    lines.push(cur);
                    if (ctx.measureText(src.slice(w.start, w.end).trimEnd()).width > maxWidth) {
                        const rest = hardSplit(w.start, w.end);
                        cur = { start: rest, end: w.end };
                    } else {
                        cur = { start: w.start, end: w.end };
                    }
                } else {
                    cur = { start: cur.start, end: w.end };
                }
            }
            // Swallow the paragraph's newline into the last line so the reveal
            // counter doesn't stall for a frame on an invisible character.
            if (cur) lines.push({ start: cur.start, end: Math.min(paraEnd + 1, src.length) });
        }

        if (nl === -1) break;
        cursor = nl + 1;
    }
    return lines.length ? lines : [{ start: 0, end: 0 }];
}

// ── plan ─────────────────────────────────────────────────────────────────────

/**
 * Everything the painter needs, worked out once: canvas size, fonts, wrapped
 * lines, per-image time slots, total duration.
 *
 * Duration is the longer of "enough time for the images" and "enough time to
 * type the whole text", so the caption always finishes. If the text alone would
 * blow past maxSeconds the typing speeds up to fit rather than getting cut off
 * mid-sentence — `plan.spedUp` says so, and the UI reports it.
 */
export function buildPlan({ canvas, images, title, body, logo, options, layerPatches, context, assets }) {
    const opts = { ...DEFAULTS, ...(options || {}) };
    const aspect = ASPECTS[opts.aspect] || ASPECTS.vertical;
    const W = aspect.width;
    const H = aspect.height;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    const theme = THEMES[opts.theme] || THEMES.dark;

    const bodySize = Math.round(W * 0.046 * (opts.fontScale || 1));
    const lineHeight = Math.round(bodySize * 1.34);
    const titleSize = Math.round(W * 0.058 * (opts.fontScale || 1));
    const margin = Math.round(W * 0.062);
    const pad = Math.round(W * 0.038);
    const textWidth = W - margin * 2 - pad * 2;

    ctx.font = `500 ${bodySize}px ${FONT_STACK}`;
    const text = String(body || '').trim();
    const lines = layoutLines(ctx, text, textWidth);
    // Urdu/Arabic (and Hebrew) captions lay out right-to-left. Shaping itself
    // comes from the OS text stack; what the painters must flip is the anchor
    // edge and the canvas direction, or punctuation lands on the wrong side.
    const rtl = /[֐-ࣿﭐ-﷿ﹰ-ﻼ]/.test(text);

    const bandFraction = opts.aspect === 'vertical' ? 0.32 : 0.38;
    const maxVisibleLines = Math.max(2, Math.min(9, Math.floor((H * bandFraction - pad * 2) / lineHeight)));

    const count = Math.max(1, images.length);
    // A hard cut is "no overlap at all" — the rest of the slot math needs no
    // other change, which is the point of expressing it through `fade`.
    const fade = count > 1 && opts.transition !== 'cut' ? Math.min(opts.fadeSeconds, opts.secondsPerImage * 0.5) : 0;
    // Per-image durations (the studio's image strip). Uniform when absent —
    // and the uniform case must reduce to the exact legacy arithmetic.
    const per = Array.isArray(opts.perImageSeconds) && opts.perImageSeconds.length === count
        ? opts.perImageSeconds.map((s) => Math.max(0.5, Number(s) || opts.secondsPerImage))
        : null;
    const imagesDuration = per ? per.reduce((a, b) => a + b, 0) : count * opts.secondsPerImage;

    // The outro card is APPENDED to the content: images and typing get the
    // budget that remains under maxSeconds, so the total still honours the cap.
    const outro = Math.max(0, Math.min(Number(opts.outroSeconds) || 0, 6));
    const contentMax = Math.max(3, opts.maxSeconds - outro);

    const totalChars = text.length;
    let cps = Math.max(1, opts.charsPerSecond);
    let needed = opts.leadInSeconds + totalChars / cps + opts.tailSeconds;
    let spedUp = false;
    if (needed > contentMax) {
        const typingWindow = Math.max(1, contentMax - opts.leadInSeconds - opts.tailSeconds);
        cps = totalChars / typingWindow;
        needed = contentMax;
        spedUp = true;
    }
    const contentDuration = Math.max(3, Math.min(contentMax, Math.max(imagesDuration, needed)));
    const duration = contentDuration + outro;

    // Images stretch to fill whatever duration the text demanded, each taking
    // its share of the usable window (equal shares without per-image seconds —
    // in which case this IS the legacy slot math). The outro's tail is NOT
    // theirs to fill.
    const usable = contentDuration - fade;
    const slot = usable / count;
    const shares = per ? per.map((s) => s / imagesDuration) : null;
    let cum = 0;
    const slots = Array.from({ length: count }, (_, i) => {
        const width = shares ? usable * shares[i] : slot;
        const start = shares ? cum : i * slot;
        cum += width;
        return { start, end: Math.min(contentDuration, start + width + fade) };
    });
    // The last image holds under the outro card's fade-in rather than dropping
    // to a bare background a beat before the card lands.
    if (outro > 0) slots[count - 1].end = duration;

    const bitrate = Math.round(W * H * opts.fps * (QUALITY_BPP[opts.quality] ?? QUALITY_BPP.high));

    const plan = {
        opts, theme, W, H, fps: opts.fps, duration, bitrate,
        contentDuration, outroSeconds: outro,
        images, slots, fade,
        logo: opts.showLogo ? (logo || null) : null,
        title: String(title || '').trim(),
        text, lines, totalChars, cps, rtl,
        bodySize, lineHeight, titleSize, margin, pad, textWidth, maxVisibleLines,
        spedUp,
        secondsPerImageEffective: slot,
    };

    // Shared geometry the slideshow and gradient painters both need: the band
    // the caption owns, and the stage the photos are fitted into above it.
    plan.captionBandH = Math.round(maxVisibleLines * lineHeight + pad * 2 + margin);
    plan.stageRect = opts.textPosition === 'middle'
        ? { x: margin * 0.4, y: margin * 0.6, w: W - margin * 0.8, h: H - margin * 1.2 }
        : { x: margin * 0.4, y: margin * 0.6, w: W - margin * 0.8, h: H - plan.captionBandH - margin * 0.6 };

    // Render-time data for {token} layers: prices, product names, storefront
    // urls. Supplied fresh by each host, never stored — that is what keeps a
    // "{price}" chip honest when the price changes after the recipe was saved.
    plan.context = context && typeof context === 'object' ? context : {};

    // Pre-loaded bitmaps for appended image layers (a second logo, a
    // watermark), keyed by the url the recipe stores. Loading is the host's
    // job — compile is synchronous and must stay that way.
    plan.assets = assets && typeof assets === 'object' ? assets : {};

    plan.layers = compileLayers(plan);
    if (Array.isArray(layerPatches) && layerPatches.length) applyLayerPatches(plan, layerPatches);
    return plan;
}

/**
 * Substitute {token} placeholders from plan.context. `missing` is true when a
 * referenced token has no value — the caller hides the layer, because "Rs
 * {price}" on a video is worse than no price chip at all.
 */
function resolveTokens(str, context) {
    let missing = false;
    const text = String(str || '').replace(/\{(\w+)\}/g, (_, key) => {
        const v = context?.[key];
        if (v === undefined || v === null || String(v).trim() === '') { missing = true; return ''; }
        return String(v);
    });
    return { text, missing };
}

/**
 * Apply stored layer customizations to a compiled plan — the persistence
 * format templates and per-post recipes use. Two kinds of entry:
 *
 *   { id: 'logo', visible: false }            — patch a compiled layer by id
 *   { id: 'promo', type: 'text', text: 'SALE',
 *     fx: 0.5, fy: 0.08, sizeFrac: 0.05, ... } — append a new layer
 *
 * Stored geometry is FRACTIONAL (fx/fy/fw of the frame, sizeFrac of the
 * width) so one recipe renders correctly at any aspect; it resolves to pixels
 * here, keeping the painters' compile-time-pixels contract. Color accepts the
 * theme tokens 'text' | 'dim' | 'accent' or any CSS color. Unknown types are
 * kept but skipped by paintFrame, so a recipe from a NEWER renderer degrades
 * to "that layer doesn't draw" instead of breaking the whole video.
 */
export function applyLayerPatches(plan, patches) {
    const { W, H, theme } = plan;
    const themeColor = (c, fallback) => (c === 'text' ? theme.text : c === 'dim' ? theme.dim : c === 'accent' ? theme.accent : (c || fallback));
    // Appended layers land on top of everything already there — the same place
    // the old push-at-the-end put them, now written down as a z.
    const nextZ = () => plan.layers.reduce((m, l) => Math.max(m, l.z || 0), 0) + 10;

    for (const patch of patches) {
        if (!patch || !patch.id) continue;

        // v2 recipes patched the photos as one 'slideshow' layer. The only
        // thing those patches could express was hiding the photos wholesale,
        // so that is what the patch still means — applied to every photo.
        if (patch.id === 'slideshow' && !plan.layers.some((l) => l.id === 'slideshow')) {
            if (patch.visible !== undefined) {
                for (const l of plan.layers) if (l.type === 'photo') l.visible = patch.visible;
            }
            continue;
        }

        const existing = plan.layers.find((l) => l.id === patch.id);

        if (existing) {
            const { id, type, anim, ...rest } = patch;
            Object.assign(existing, rest);
            // The legacy `anim` key is sugar for the envelope now — one
            // mechanism, not two. An explicit enter/exit in the same patch
            // wins over the translation.
            if (anim !== undefined) {
                existing.anim = anim;
                const env = envelopeFromAnim(anim, H);
                if (patch.enter === undefined) existing.enter = env.enter;
                if (patch.exit === undefined) existing.exit = env.exit;
            }
            // Fractional geometry on a patched layer (e.g. a dragged logo or
            // footer) re-resolves against this frame's size.
            if (existing.type === 'image') {
                if (patch.fw !== undefined) {
                    existing.w = W * patch.fw;
                    const srcH = existing.src?.height || 1;
                    const srcW = existing.src?.width || 1;
                    existing.h = existing.w * (srcH / srcW);
                }
                if (patch.fx !== undefined) existing.x = W * patch.fx;
                if (patch.fy !== undefined) existing.y = H * patch.fy;
            } else if (existing.type === 'text') {
                if (patch.fx !== undefined) existing.x = W * patch.fx;
                if (patch.fy !== undefined) existing.y = H * patch.fy;
                if (patch.sizeFrac !== undefined) {
                    // A corner-drag resize on a compiled text layer (the
                    // footer) — the font re-resolves like an appended one's.
                    existing.sizePx = Math.max(10, Math.round(W * patch.sizeFrac));
                    existing.font = `${existing.weight || 600} ${existing.sizePx}px ${FONT_STACK}`;
                }
            } else if (existing.type === 'qr') {
                if (patch.fx !== undefined) existing.x = W * patch.fx;
                if (patch.fy !== undefined) existing.y = H * patch.fy;
                if (patch.fw !== undefined) existing.size = Math.max(60, Math.round(W * patch.fw));
            }
            continue;
        }

        if (patch.type === 'text' && patch.text) {
            const sizePx = Math.max(10, Math.round(W * (patch.sizeFrac || 0.035)));
            const resolved = resolveTokens(patch.text, plan.context);
            const text = resolved.text;
            const env = envelopeFromAnim(patch.anim, H);
            plan.layers.push({
                id: patch.id, type: 'text', text,
                name: patch.name || null,
                // A tokened layer whose data isn't available simply doesn't
                // draw — "Rs " with the price missing must never reach a video.
                visible: patch.visible !== false && !resolved.missing,
                missingToken: resolved.missing,
                timing: patch.timing || null,
                enter: patch.enter || env.enter,
                exit: patch.exit || env.exit,
                z: patch.z ?? nextZ(),
                font: `${patch.weight || 600} ${sizePx}px ${FONT_STACK}`,
                sizePx,
                color: themeColor(patch.color, theme.text),
                align: patch.align || 'center',
                baseline: patch.baseline || 'top',
                x: W * (patch.fx ?? 0.5),
                y: H * (patch.fy ?? 0.1),
                bg: !!patch.bg || !!patch.pill,
                pillColor: patch.pill === 'accent' ? theme.accent : null,
                anim: patch.anim || 'none',
                rtl: patch.direction === 'rtl'
                    || (patch.direction !== 'ltr' && /[֐-ࣿﭐ-﷿ﹰ-ﻼ]/.test(text)),
                // The source fractions ride along so an editor can round-trip
                // the layer without re-deriving them from pixels.
                fx: patch.fx ?? 0.5, fy: patch.fy ?? 0.1,
                sizeFrac: patch.sizeFrac || 0.035,
                weight: patch.weight || 600,
                colorToken: patch.color || 'text',
                direction: patch.direction || 'auto',
                rot: patch.rot || 0,
            });
            continue;
        }

        if (patch.type === 'qr') {
            const resolved = resolveTokens(patch.data || '{url}', plan.context);
            const sizePx = Math.max(60, Math.round(W * (patch.fw || 0.22)));
            plan.layers.push({
                id: patch.id, type: 'qr',
                name: patch.name || 'QR code',
                data: resolved.text,
                visible: patch.visible !== false && !resolved.missing && !!resolved.text,
                missingToken: resolved.missing,
                timing: patch.timing || null,
                enter: patch.enter || { kind: 'none', seconds: 0 },
                exit: patch.exit || { kind: 'none', seconds: 0 },
                z: patch.z ?? nextZ(),
                x: W * (patch.fx ?? 0.72), y: H * (patch.fy ?? 0.06),
                size: sizePx,
                fx: patch.fx ?? 0.72, fy: patch.fy ?? 0.06, fw: patch.fw || 0.22,
                rot: patch.rot || 0,
            });
            continue;
        }

        // A photo appended a second time — the same picture reappearing later
        // on the clock. It references the loaded image by index, and carries
        // kbIndex so the Ken Burns direction can stay what the original had.
        if (patch.type === 'photo') {
            const idx = Number(patch.index) || 0;
            plan.layers.push({
                id: patch.id, type: 'photo',
                name: patch.name || `Photo ${idx + 1} again`,
                index: idx,
                kbIndex: patch.kbIndex ?? idx,
                visible: patch.visible !== false && !!plan.images[idx],
                timing: patch.timing || null,
                enter: patch.enter || { kind: 'fade', seconds: 0.4 },
                exit: patch.exit || { kind: 'fade', seconds: 0.4 },
                z: patch.z ?? nextZ(),
                // Geometry makes it an INSET (picture-in-picture); without it
                // the copy fills the stage like the original.
                fx: patch.fx, fy: patch.fy, fw: patch.fw, fh: patch.fh,
                rot: patch.rot || 0,
            });
            continue;
        }

        // A second logo / watermark. Its bitmap must already be decoded — the
        // compiled logo covers the common case, anything else arrives through
        // buildPlan({ assets }) keyed by the url the recipe stores.
        if (patch.type === 'image') {
            const src = (patch.src === 'logo' || !patch.url) ? plan.logo : (plan.assets[patch.url] || null);
            const fw = patch.fw || 0.16;
            const w = W * fw;
            const h = src ? w * (src.height / Math.max(1, src.width)) : w;
            plan.layers.push({
                id: patch.id, type: 'image',
                name: patch.name || 'Image',
                src,
                url: patch.url || null,
                visible: patch.visible !== false && !!src?.img,
                timing: patch.timing || null,
                enter: patch.enter || { kind: 'none', seconds: 0 },
                exit: patch.exit || { kind: 'none', seconds: 0 },
                z: patch.z ?? nextZ(),
                x: W * (patch.fx ?? 0.5), y: H * (patch.fy ?? 0.5), w, h,
                opacity: patch.opacity ?? 1,
                shadow: patch.shadow !== false,
                fx: patch.fx ?? 0.5, fy: patch.fy ?? 0.5, fw,
                rot: patch.rot || 0,
                draggable: true,
            });
            continue;
        }

        // A sound clip. It never paints — the host resolves trackId/url to a
        // decoded buffer and hands renderVideo the clips (see soundLayers /
        // clipFromSoundLayer). enter/exit seconds are its audio fades.
        if (patch.type === 'sound') {
            plan.layers.push({
                id: patch.id, type: 'sound',
                name: patch.name || 'Sound',
                trackId: patch.trackId ?? null,
                url: patch.url || null,
                offset: Number(patch.offset) || 0,
                volume: patch.volume ?? null, // null = the host's default
                loop: !!patch.loop,
                visible: patch.visible !== false,
                timing: patch.timing || null,
                enter: patch.enter || { kind: 'fade', seconds: 0 },
                exit: patch.exit || { kind: 'fade', seconds: 0 },
                z: patch.z ?? nextZ(),
            });
            continue;
        }

        // A second typewriter block with its own text and its own window.
        if (patch.type === 'caption') {
            plan.layers.push({
                id: patch.id, type: 'caption',
                name: patch.name || 'Caption again',
                text: String(patch.text ?? plan.text),
                visible: patch.visible !== false,
                timing: patch.timing || null,
                enter: patch.enter || { kind: 'none', seconds: 0 },
                exit: patch.exit || { kind: 'none', seconds: 0 },
                z: patch.z ?? nextZ(),
            });
            continue;
        }

        // Anything else (a layer type this renderer version doesn't know) is
        // kept for round-tripping; paintFrame skips what it can't paint.
        plan.layers.push({ ...patch, visible: patch.visible !== false, z: patch.z ?? nextZ() });
    }
}

// ── entry / exit envelope ────────────────────────────────────────────────────
// Every layer carries `enter` and `exit`: { kind, seconds } plus an optional
// `dist` (pixels) for the slides. The envelope is applied AROUND the painter —
// fades scale ctx.globalAlpha, slides translate, zoom scales — so every layer
// type gets entry/exit treatments without its painter knowing. Painters
// therefore MULTIPLY into ctx.globalAlpha rather than assign it.
//
// 'type-on' is the one kind the envelope cannot express: only a text painter
// can reveal per character, so paintText / paintCaption read it themselves.

/** The legacy text-layer `anim` key, translated. One mechanism, not two. */
function envelopeFromAnim(anim, H) {
    if (anim === 'fade') return { enter: { kind: 'fade', seconds: 0.4 }, exit: { kind: 'fade', seconds: 0.4 } };
    if (anim === 'slide-up') return { enter: { kind: 'slide-up', seconds: 0.4, dist: H * 0.02 }, exit: { kind: 'fade', seconds: 0.4 } };
    if (anim === 'type') return { enter: { kind: 'type-on', seconds: 0 }, exit: { kind: 'none', seconds: 0 } };
    return { enter: { kind: 'none', seconds: 0 }, exit: { kind: 'none', seconds: 0 } };
}

/**
 * The transform the envelope imposes at `time`, or null when it is identity —
 * which it is for every layer outside its ramps, so the common frame costs
 * nothing. Slides name the direction of MOTION: 'slide-left' enters from the
 * right edge moving left, and exits off the left edge. 'push' is slide-left
 * that a photo pairs with the next photo's slide-left enter — the incoming one
 * shoves this one out. Distances default to the full frame (a photo crossing
 * it); text compiled from the legacy `anim` carries its own small dist.
 */
function envelopeAt(plan, layer, time) {
    const en = layer.enter;
    const ex = layer.exit;
    if (!en && !ex) return null;
    const start = layer.timing ? layer.timing.start : 0;
    const end = layer.timing ? layer.timing.end : plan.duration;
    let alpha = 1;
    let tx = 0;
    let ty = 0;
    let scale = 1;

    if (en && en.seconds > 0 && en.kind !== 'none' && en.kind !== 'type-on' && time < start + en.seconds) {
        const p = Math.max(0, (time - start) / en.seconds); // 0 → 1 across the ramp
        const out = 1 - p;
        if (en.kind === 'fade') alpha *= p;
        else if (en.kind === 'zoom') { alpha *= p; scale *= 1 + 0.2 * out; }
        else if (en.kind === 'push' || en.kind === 'slide-left') tx += out * (en.dist ?? plan.W); // in from the right
        else if (en.kind === 'slide-right') tx -= out * (en.dist ?? plan.W); // in from the left
        else if (en.kind === 'slide-up') ty += out * (en.dist ?? plan.H); // in from below
        else if (en.kind === 'slide-down') ty -= out * (en.dist ?? plan.H); // in from above
    }

    if (ex && ex.seconds > 0 && ex.kind !== 'none' && ex.kind !== 'type-on') {
        const exitStart = end - ex.seconds;
        if (time > exitStart) {
            const p = Math.min(1, (time - exitStart) / ex.seconds); // 0 → 1 across the ramp
            if (ex.kind === 'fade') alpha *= 1 - p;
            else if (ex.kind === 'zoom') { alpha *= 1 - p; scale *= 1 + 0.2 * p; }
            else if (ex.kind === 'push' || ex.kind === 'slide-left') tx -= p * (ex.dist ?? plan.W); // out to the left
            else if (ex.kind === 'slide-right') tx += p * (ex.dist ?? plan.W); // out to the right
            else if (ex.kind === 'slide-up') ty -= p * (ex.dist ?? plan.H); // out through the top
            else if (ex.kind === 'slide-down') ty += p * (ex.dist ?? plan.H); // out through the bottom
        }
    }

    if (alpha >= 1 && tx === 0 && ty === 0 && scale === 1) return null;
    return { alpha, tx, ty, scale };
}

// ── painting ─────────────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function coverRect(iw, ih, w, h) {
    const s = Math.max(w / iw, h / ih);
    return { w: iw * s, h: ih * s };
}
function containRect(iw, ih, w, h) {
    const s = Math.min(w / iw, h / ih);
    return { w: iw * s, h: ih * s };
}

// Slow drift + zoom. Alternating direction per image keeps a run of photos from
// looking like one long push-in.
function kenBurns(index, p, enabled) {
    if (!enabled) return { zoom: 1, dx: 0, dy: 0 };
    const inward = index % 2 === 0;
    const zoom = inward ? 1 + 0.10 * p : 1.10 - 0.10 * p;
    const drift = (p - 0.5) * 0.05 * (index % 4 < 2 ? 1 : -1);
    return { zoom, dx: drift, dy: drift * 0.6 };
}

/**
 * The blurred backdrop, rendered once per image and reused every frame.
 * A 46px blur over a full 1080×1920 canvas costs far too much to redo 30 times
 * a second; baked at half size it is a plain drawImage, and nobody can tell —
 * it's a blur. Keyed on the frame size so switching aspect ratio rebuilds it.
 */
function backdropFor(entry, W, H, theme) {
    const key = `${W}x${H}x${theme.key}`;
    if (entry._backdropKey === key && entry._backdrop) return entry._backdrop;

    const bw = Math.max(2, Math.round(W / 2));
    const bh = Math.max(2, Math.round(H / 2));
    const off = document.createElement('canvas');
    off.width = bw;
    off.height = bh;
    const octx = off.getContext('2d');
    const { img } = entry;
    const c = coverRect(entry.width, entry.height, bw, bh);
    const w = c.w * 1.3;
    const h = c.h * 1.3;
    octx.filter = 'blur(24px) brightness(0.55) saturate(1.2)';
    octx.drawImage(img, (bw - w) / 2, (bh - h) / 2, w, h);
    octx.filter = 'none';
    octx.fillStyle = theme.key === 'light' ? 'rgba(244,244,246,0.35)' : 'rgba(8,6,14,0.25)';
    octx.fillRect(0, 0, bw, bh);

    entry._backdrop = off;
    entry._backdropKey = key;
    return off;
}

function drawImageLayer(ctx, plan, entry, index, p, alpha, stageRect) {
    const { img } = entry;
    const { W, H, opts, theme } = plan;
    const kb = kenBurns(index, p, opts.kenBurns);

    ctx.save();
    // Multiplied, not assigned — the entry/exit envelope may already have
    // scaled globalAlpha down before this painter ran.
    ctx.globalAlpha *= alpha;

    if (opts.fit === 'cover') {
        const c = coverRect(entry.width, entry.height, W, H);
        const w = c.w * kb.zoom;
        const h = c.h * kb.zoom;
        // The focal point (0..1 of the source image) is what the crop keeps in
        // frame — a product shot is rarely centered. 0.5/0.5 reproduces the
        // legacy centered crop exactly.
        const f = entry.focal || { fx: 0.5, fy: 0.5 };
        const x = Math.min(0, Math.max(W - w, W / 2 - f.fx * w));
        const y = Math.min(0, Math.max(H - h, H / 2 - f.fy * h));
        ctx.drawImage(img, x + kb.dx * W, y + kb.dy * H, w, h);
    } else {
        // Blurred, darkened cover behind so an off-aspect photo never leaves a
        // dead letterbox — then the whole photo, uncropped, on top of it.
        const backdrop = backdropFor(entry, W, H, theme);
        const bw = W * kb.zoom;
        const bh = H * kb.zoom;
        ctx.drawImage(backdrop, (W - bw) / 2, (H - bh) / 2, bw, bh);

        const f = containRect(entry.width, entry.height, stageRect.w, stageRect.h);
        const w = f.w * kb.zoom;
        const h = f.h * kb.zoom;
        const x = stageRect.x + (stageRect.w - w) / 2 + kb.dx * stageRect.w * 0.4;
        const y = stageRect.y + (stageRect.h - h) / 2 + kb.dy * stageRect.h * 0.4;
        ctx.save();
        roundRect(ctx, x, y, w, h, Math.round(W * 0.022));
        ctx.clip();
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();
    }

    ctx.restore();
}

/** Which source line is being typed right now, as a float (for smooth scroll). */
function revealPosition(lines, n) {
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (n < l.end || i === lines.length - 1) {
            const span = Math.max(1, l.end - l.start);
            return i + Math.max(0, Math.min(1, (n - l.start) / span));
        }
    }
    return lines.length - 1;
}

// ── layer painters ───────────────────────────────────────────────────────────
// A video is a STACK of layers painted in order; each painter is pure in `t`.
// This is the seam the v2 editor builds on: templates store a stack, the
// editor manipulates plan.layers, and every painter stays oblivious to both.

// Cover-fit `entry` into an arbitrary rect honoring its focal point — the
// inset (picture-in-picture) form of a photo layer.
function drawCoverInRect(ctx, plan, entry, x, y, w, h) {
    const c = coverRect(entry.width, entry.height, w, h);
    const f = entry.focal || { fx: 0.5, fy: 0.5 };
    const ix = Math.min(x, Math.max(x + w - c.w, x + w / 2 - f.fx * c.w));
    const iy = Math.min(y, Math.max(y + h - c.h, y + h / 2 - f.fy * c.h));
    ctx.save();
    roundRect(ctx, x, y, w, h, Math.round(plan.W * 0.015));
    ctx.clip();
    ctx.drawImage(entry.img, ix, iy, c.w, c.h);
    ctx.restore();
}

// One photo, one layer. The crossfade that used to live inside a slideshow
// painter is now this layer's `enter` overlapping the previous photo's window
// — the envelope applies it before this runs, so all that is left is the Ken
// Burns drift and the draw itself: the body of the old loop, unchanged.
function paintPhoto(ctx, plan, layer, time) {
    const entry = plan.images[layer.index];
    if (!entry) return;

    // A photo WITH geometry is an inset — a close-up over the wide shot, a
    // side-by-side, a before/after. `fh` is optional: absent, the rect takes
    // the photo's own aspect at `fw` width. No Ken Burns — insets hold still.
    if (layer.fw) {
        const w = plan.W * layer.fw;
        const h = layer.fh ? plan.H * layer.fh : w * (entry.height / Math.max(1, entry.width));
        drawCoverInRect(ctx, plan, entry, plan.W * (layer.fx ?? 0.3), plan.H * (layer.fy ?? 0.3), w, h);
        return;
    }

    const t0 = layer.timing ? layer.timing.start : 0;
    const t1 = layer.timing ? layer.timing.end : plan.duration;
    const local = (time - t0) / Math.max(0.0001, t1 - t0);
    // kbIndex keeps the alternating Ken Burns direction stable when a photo is
    // duplicated or reordered — it is the image's place in the arrangement.
    drawImageLayer(ctx, plan, entry, layer.kbIndex ?? layer.index, local, 1, plan.stageRect);
}

// Legibility gradient under the caption band.
function paintGradient(ctx, plan) {
    const { W, H, theme, captionBandH } = plan;
    const g = ctx.createLinearGradient(0, H - captionBandH * 1.5, 0, H);
    g.addColorStop(0, theme.key === 'light' ? 'rgba(244,244,246,0)' : 'rgba(8,6,14,0)');
    g.addColorStop(1, theme.key === 'light' ? 'rgba(244,244,246,0.9)' : 'rgba(8,6,14,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - captionBandH * 1.5, W, captionBandH * 1.5);
}

// The typewriter caption. A duplicated caption layer carries its own text and
// its own window; the compiled one uses the plan's, and typing runs on the
// layer's local clock so a retimed caption starts typing when IT starts.
function paintCaption(ctx, plan, layer, time) {
    const { W, H, theme, opts, lineHeight, bodySize, margin, pad, maxVisibleLines } = plan;

    let { lines, totalChars, text, rtl } = plan;
    if (layer.text !== undefined && layer.text !== null && layer.text !== plan.text) {
        text = String(layer.text);
        // Wrapping is far too slow to redo per frame; the layout is cached on
        // the layer, keyed so an edited text or resized frame re-wraps.
        const key = `${plan.textWidth}|${bodySize}|${text}`;
        if (layer._layoutKey !== key) {
            ctx.font = `500 ${bodySize}px ${FONT_STACK}`;
            layer._lines = layoutLines(ctx, text, plan.textWidth);
            layer._layoutKey = key;
        }
        lines = layer._lines;
        totalChars = text.length;
        rtl = /[֐-ࣿﭐ-﷿ﹰ-ﻼ]/.test(text);
    }

    const local = layer.timing ? time - layer.timing.start : time;
    const revealed = Math.max(0, Math.floor((local - opts.leadInSeconds) * plan.cps));
    const n = Math.min(totalChars, revealed);
    const typing = n < totalChars && local > opts.leadInSeconds;
    if (n <= 0 && !typing) return;

    ctx.font = `500 ${bodySize}px ${FONT_STACK}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = rtl ? 'right' : 'left';
    if (rtl) ctx.direction = 'rtl';

    const posF = revealPosition(lines, n);
    const shownLines = Math.max(1, Math.min(maxVisibleLines, posF + 1));
    const boxH = Math.round(shownLines * lineHeight + pad * 2);
    const boxW = W - margin * 2;
    const boxX = margin;
    const boxY = opts.textPosition === 'middle'
        ? Math.round((H - boxH) / 2)
        : Math.round(H - margin - boxH);

    ctx.save();
    if (opts.captionStyle !== 'bare') {
        ctx.fillStyle = theme.scrim;
        roundRect(ctx, boxX, boxY, boxW, boxH, Math.round(W * 0.028));
        ctx.fill();
        ctx.strokeStyle = theme.key === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Clip so scrolled-off lines vanish at the box edge instead of bleeding —
    // the clip stays in 'bare' mode too, or a long caption scrolls out of its
    // band and over the photos.
    roundRect(ctx, boxX, boxY, boxW, boxH, Math.round(W * 0.028));
    ctx.clip();
    if (opts.captionStyle === 'bare') {
        // No panel behind the text, so the text itself has to carry the
        // separation from a busy photo.
        ctx.shadowColor = theme.key === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = Math.round(W * 0.008);
    }

    const scroll = Math.max(0, posF - (maxVisibleLines - 1)) * lineHeight;
    const textX = rtl ? boxX + boxW - pad : boxX + pad;
    const textTop = boxY + pad - scroll;

    ctx.fillStyle = theme.text;
    let caret = null;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (n < l.start) break; // `<` not `<=`: at n === start the caret has just landed on this line
        const y = textTop + i * lineHeight;
        if (y > boxY + boxH || y + lineHeight < boxY - lineHeight) continue;
        const slice = text.slice(l.start, Math.min(l.end, n)).replace(/\s+$/, '');
        if (slice) ctx.fillText(slice, textX, y);
        if (n <= l.end) {
            const advance = ctx.measureText(slice).width + Math.round(bodySize * 0.14);
            caret = { x: rtl ? textX - advance - Math.round(bodySize * 0.09) : textX + advance, y };
        }
    }

    if (typing && caret && (local * 2) % 1 < 0.62) {
        ctx.fillStyle = theme.accent;
        ctx.fillRect(caret.x, caret.y + Math.round(bodySize * 0.12), Math.round(bodySize * 0.09), bodySize);
    }
    ctx.restore();
}

// The opening title card. Its own fades live here; the layer's timing window
// only gates when the painter runs at all.
function paintTitle(ctx, plan, layer, time) {
    const { W, theme, margin, pad } = plan;
    if (!plan.title) return;
    // On the layer's own clock, so a retimed title card fades at ITS edges.
    // With the compiled window {0, titleSeconds} this is the legacy arithmetic.
    const winStart = layer.timing ? layer.timing.start : 0;
    const winLen = layer.timing ? layer.timing.end - winStart : plan.opts.titleSeconds;
    const local = time - winStart;
    const fadeIn = Math.min(1, local / 0.45);
    const fadeOut = Math.min(1, Math.max(0, (winLen - local) / 0.6));
    const a = Math.min(fadeIn, fadeOut);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.font = `700 ${plan.titleSize}px ${FONT_STACK}`;
    ctx.textBaseline = 'top';
    const titleRtl = plan.rtl;
    ctx.textAlign = titleRtl ? 'right' : 'left';
    if (titleRtl) ctx.direction = 'rtl';
    const tLines = layoutLines(ctx, plan.title, W - margin * 2 - pad * 2).slice(0, 3);
    const boxH = tLines.length * Math.round(plan.titleSize * 1.28) + pad * 1.6;
    ctx.fillStyle = theme.scrim;
    roundRect(ctx, margin, margin, W - margin * 2, boxH, Math.round(W * 0.028));
    ctx.fill();
    ctx.fillStyle = theme.text;
    const titleX = titleRtl ? W - margin - pad : margin + pad;
    tLines.forEach((l, i) => {
        ctx.fillText(plan.title.slice(l.start, l.end).replace(/\s+$/, ''),
            titleX, margin + pad * 0.8 + i * Math.round(plan.titleSize * 1.28));
    });
    ctx.restore();
}

// A static image overlay (the brand mark today; any watermark/sticker later).
// Geometry is resolved to pixels at compile time, so this stays a dumb draw.
function paintImage(ctx, plan, layer) {
    const entry = layer.src;
    if (!entry?.img) return;
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, layer.opacity ?? 1));
    if (layer.shadow) {
        // Most brand marks are transparent PNGs; over a busy photo they vanish
        // without something to lift them off it.
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = Math.round(plan.W * 0.012);
    }
    ctx.drawImage(entry.img, layer.x, layer.y, layer.w, layer.h);
    ctx.restore();
}

// A text overlay: the compiled footer, and every editor-added text layer.
// Static layers paint exactly as the original footer painter did — that
// identity is load-bearing for the A/B guarantee. Fades and slides are the
// envelope's job now; the one reveal only a text painter can do stays here.
function paintText(ctx, plan, layer, time) {
    const winStart = layer.timing ? layer.timing.start : 0;
    const local = time - winStart;

    let text = layer.text;
    if (layer.enter?.kind === 'type-on' || layer.anim === 'type') {
        const cps = Math.max(8, layer.text.length / 1.2);
        text = layer.text.slice(0, Math.max(0, Math.floor(local * cps)));
        if (!text) return;
    }

    ctx.save();
    ctx.font = layer.font;
    ctx.textAlign = layer.align || 'left';
    ctx.textBaseline = layer.baseline || 'top';
    if (layer.rtl) ctx.direction = 'rtl';

    if (layer.bg) {
        // A pill behind the text — theme scrim, or a solid color (the accent
        // for price chips and stickers). Sized off the FULL text so a type-on
        // reveal doesn't pulse the pill width every frame.
        const size = layer.sizePx || 24;
        const w = ctx.measureText(layer.text).width;
        const padX = Math.round(size * 0.55);
        const padY = Math.round(size * 0.3);
        const x0 = layer.align === 'center' ? layer.x - w / 2 : layer.align === 'right' ? layer.x - w : layer.x;
        const y0 = layer.baseline === 'bottom' ? layer.y - size : layer.baseline === 'middle' ? layer.y - size / 2 : layer.y;
        ctx.fillStyle = layer.pillColor || plan.theme.scrim;
        roundRect(ctx, x0 - padX, y0 - padY, w + padX * 2, size + padY * 2, Math.round(size * 0.6));
        ctx.fill();
    }

    ctx.fillStyle = layer.color;
    ctx.fillText(text, layer.x, layer.y);
    ctx.restore();
}

// A QR code layer. The matrix renders once to an offscreen canvas (cached on
// the layer, keyed by content+size) with a white field and the mandatory
// 4-module quiet zone; the per-frame cost is one drawImage.
function paintQr(ctx, plan, layer) {
    if (!layer.data) return;
    const key = layer.data + ':' + layer.size;
    if (layer._qrKey !== key) {
        const qr = qrEncode(layer.data);
        if (!qr) { layer._qrKey = key; layer._qr = null; return; }
        const quiet = 4;
        const cells = qr.size + quiet * 2;
        const mod = Math.max(2, Math.floor(layer.size / cells));
        const px = mod * cells;
        const off = document.createElement('canvas');
        off.width = px;
        off.height = px;
        const octx = off.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, px, px);
        octx.fillStyle = '#000000';
        for (let y = 0; y < qr.size; y++) {
            for (let x = 0; x < qr.size; x++) {
                if (qr.modules[y * qr.size + x]) octx.fillRect((x + quiet) * mod, (y + quiet) * mod, mod, mod);
            }
        }
        layer._qr = off;
        layer._qrKey = key;
        layer._qrPx = px;
    }
    if (layer._qr) ctx.drawImage(layer._qr, layer.x, layer.y, layer._qrPx, layer._qrPx);
}

// The branded end card: theme background, logo, a line of text. Fades in over
// the last image so the video ends on brand instead of stopping dead.
function paintOutro(ctx, plan, layer, time) {
    const start = layer.timing ? layer.timing.start : plan.duration - plan.outroSeconds;
    const p = Math.max(0, Math.min(1, (time - start) / 0.5));
    if (p <= 0) return;
    const { W, H, theme } = plan;

    ctx.save();
    ctx.globalAlpha *= p;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    let y = H / 2;
    if (plan.logo?.img) {
        const lw = W * 0.34;
        const lh = lw * (plan.logo.height / Math.max(1, plan.logo.width));
        ctx.drawImage(plan.logo.img, (W - lw) / 2, H / 2 - lh - H * 0.02, lw, lh);
        y = H / 2 + H * 0.03;
    } else {
        y = H / 2 - plan.titleSize;
    }

    const line = layer.text;
    if (line) {
        ctx.font = `700 ${plan.titleSize}px ${FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = theme.text;
        ctx.fillText(line, W / 2, y);
    }
    ctx.restore();
}

function paintProgress(ctx, plan, layer, time) {
    const { W, H, theme } = plan;
    const h = Math.max(4, Math.round(H * 0.004));
    ctx.fillStyle = theme.key === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)';
    ctx.fillRect(0, H - h, W, h);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(0, H - h, W * (time / plan.duration), h);
}

// Open and close on black — a hard cut from frame zero looks like a glitch.
function paintEdges(ctx, plan, layer, time) {
    const { W, H, theme } = plan;
    const edge = plan.opts.edgeFadeSeconds ?? 0.45;
    if (edge <= 0) return;
    const dip = time < edge ? 1 - time / edge : (time > plan.duration - edge ? 1 - (plan.duration - time) / edge : 0);
    if (dip > 0) {
        ctx.fillStyle = theme.key === 'light' ? `rgba(255,255,255,${dip})` : `rgba(0,0,0,${dip})`;
        ctx.fillRect(0, 0, W, H);
    }
}

const PAINTERS = {
    photo: paintPhoto,
    gradient: paintGradient,
    caption: paintCaption,
    title: paintTitle,
    image: paintImage,
    text: paintText,
    qr: paintQr,
    outro: paintOutro,
    progress: paintProgress,
    edges: paintEdges,
};

/**
 * The default stack, compiled from the legacy options — which is why every
 * pre-layer caller keeps working: options are sugar, layers are truth.
 * Geometry for the static overlays (logo, footer) resolves to pixels HERE,
 * once, so their painters stay trivially dumb and templates can later swap in
 * fractional coordinates at the same spot.
 */
export function compileLayers(plan) {
    const { W, H, opts, margin, pad, lineHeight, maxVisibleLines } = plan;
    const layers = [];

    // One layer per photo. The crossfade that used to live inside the
    // slideshow painter is photo N+1's `enter` overlapping photo N's window —
    // the same windows and the same ramps the old loop computed, written down.
    // The first photo gets no enter and only 'push' gives a photo an exit
    // (everything else is simply covered by the incoming one) — exactly the
    // `i > 0` / `i < n-1` guards the old painter carried.
    const tr = opts.transition || 'fade';
    const ENTER_FOR = { fade: 'fade', slide: 'slide-left', push: 'push', zoom: 'zoom' };
    const enterKind = plan.fade > 0 ? (ENTER_FOR[tr] || 'none') : 'none';
    plan.images.forEach((entry, i) => {
        layers.push({
            id: `photo-${i + 1}`, type: 'photo', name: `Photo ${i + 1}`,
            index: i,
            timing: { start: plan.slots[i].start, end: plan.slots[i].end },
            enter: i > 0 && enterKind !== 'none'
                ? { kind: enterKind, seconds: plan.fade }
                : { kind: 'none', seconds: 0 },
            exit: tr === 'push' && plan.fade > 0 && i < plan.images.length - 1
                ? { kind: 'push', seconds: plan.fade }
                : { kind: 'none', seconds: 0 },
        });
    });

    if (opts.textPosition === 'bottom') layers.push({ id: 'gradient', type: 'gradient', name: 'Caption shade' });
    layers.push({ id: 'caption', type: 'caption', name: 'Caption' });

    if (opts.showTitle && plan.title) {
        layers.push({ id: 'title', type: 'title', name: 'Title card', timing: { start: 0, end: opts.titleSeconds } });
    }

    if (plan.logo?.img) {
        // Anchored to where the caption box sits at its FULL height, not its
        // current one. Tied to the growing box it would creep up the frame as
        // the text typed, which reads as a wobble rather than a watermark.
        const lw = W * Math.max(0.04, Math.min(0.4, opts.logoScale));
        const lh = lw * (plan.logo.height / Math.max(1, plan.logo.width));
        const fullBoxH = maxVisibleLines * lineHeight + pad * 2;
        const captionTopFull = opts.textPosition === 'middle'
            ? (H - fullBoxH) / 2
            : H - margin - fullBoxH;
        const bottomY = Math.max(margin, captionTopFull - margin * 0.45 - lh);
        const pos = opts.logoPosition || 'top-right';
        layers.push({
            id: 'logo', type: 'image', name: 'Logo', src: plan.logo,
            x: pos.endsWith('left') ? margin : W - margin - lw,
            y: pos.startsWith('top') ? margin : bottomY,
            w: lw, h: lh,
            opacity: opts.logoOpacity, shadow: true,
            draggable: true,
        });
    }

    if (opts.footer) {
        const sizePx = Math.round(plan.bodySize * 0.62);
        layers.push({
            id: 'footer', type: 'text', name: 'Footer', text: opts.footer,
            font: `600 ${sizePx}px ${FONT_STACK}`,
            sizePx,
            color: plan.theme.dim, align: 'center', baseline: 'bottom',
            x: W / 2, y: H - Math.round(margin * 0.28),
            draggable: true,
        });
    }

    if (plan.outroSeconds > 0) {
        layers.push({
            id: 'outro', type: 'outro', name: 'Outro card',
            text: String(opts.outroText || opts.footer || '').trim(),
            timing: { start: plan.duration - plan.outroSeconds, end: plan.duration + 1 },
        });
    }
    if (opts.showProgress) layers.push({ id: 'progress', type: 'progress', name: 'Progress bar' });
    layers.push({ id: 'edges', type: 'edges', name: 'Fade in/out' });

    // The universal envelope: every layer leaves compile with the same five
    // things — order, timing, entry/exit, geometry (where it applies), state.
    // z is compile order, so an untouched recipe stacks exactly as it always
    // did; `timing: null` means the whole video, however long it becomes.
    layers.forEach((l, i) => {
        l.z = (i + 1) * 10;
        if (l.visible === undefined) l.visible = true;
        if (l.timing === undefined) l.timing = null;
        if (!l.enter) l.enter = { kind: 'none', seconds: 0 };
        if (!l.exit) l.exit = { kind: 'none', seconds: 0 };
    });

    return layers;
}

// ── QR encoding ──────────────────────────────────────────────────────────────
// A self-contained byte-mode QR encoder (versions 1–10, EC level M, penalty-
// chosen mask). Written here rather than pulled in because this package's
// zero-dependency, single-file contract is what lets the same code run in the
// studio page and the poster's Electron window with no build step — and a QR
// layer is useless if it can't render everywhere the videos do.
// Correctness is proven by round-trip in the harness: painted pixels are
// DECODED with an independent reader and must yield the input string.

const QR_EC_M = {
    // version → [totalDataCodewords, ecPerBlock, [blockDataSizes...]]
    1: [16, 10, [16]],
    2: [28, 16, [28]],
    3: [44, 26, [44]],
    4: [64, 18, [32, 32]],
    5: [86, 24, [43, 43]],
    6: [108, 16, [27, 27, 27, 27]],
    7: [124, 18, [31, 31, 31, 31]],
    8: [154, 22, [38, 38, 39, 39]],
    9: [182, 22, [36, 36, 36, 37, 37]],
    10: [216, 26, [43, 43, 43, 43, 44]],
};
const QR_ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
const gfMul = (a, b) => (a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0);

// Reed-Solomon ECC by plain polynomial division. The generator is built
// HIGHEST-degree-first (gen[0] is the leading, monic coefficient) because the
// division loop below aligns gen[0] with the current position — mixing the two
// orderings is the classic way to corrupt every ECC block at ecLen >= 2.
function rsEccDivide(data, ecLen) {
    let gen = [1];
    for (let i = 0; i < ecLen; i++) {
        // gen(x) · (x + α^i), keeping highest-first order
        const next = new Array(gen.length + 1).fill(0);
        for (let j = 0; j < gen.length; j++) {
            next[j] ^= gen[j];
            next[j + 1] ^= gfMul(gen[j], GF_EXP[i]);
        }
        gen = next;
    }
    const buf = [...data, ...new Array(ecLen).fill(0)];
    for (let i = 0; i < data.length; i++) {
        const factor = buf[i];
        if (!factor) continue;
        for (let j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], factor);
    }
    return buf.slice(data.length);
}

/**
 * Encode `text` (UTF-8 bytes) as a QR matrix. Returns { size, modules } where
 * modules is a flat Uint8Array (1 = dark), or null when the text is too long
 * for version 10 (216 bytes at EC M) — callers skip the layer rather than
 * render an unscannable code.
 */
export function qrEncode(text) {
    const bytes = [];
    for (const ch of new TextEncoder().encode(String(text))) bytes.push(ch);

    let version = 0;
    for (let v = 1; v <= 10; v++) {
        const cap = QR_EC_M[v][0] - (v >= 10 ? 4 : 3); // mode(4b)+count(8|16b) rounded up
        if (bytes.length <= cap) { version = v; break; }
    }
    if (!version) return null;

    const [dataLen, ecLen, blockSizes] = QR_EC_M[version];
    const countBits = version >= 10 ? 16 : 8;

    // bit stream: mode 0100, count, data, terminator, pad
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, countBits);
    for (const b of bytes) push(b, 8);
    const capacityBits = dataLen * 8;
    for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
        codewords.push(b);
    }
    const pads = [0xec, 0x11];
    for (let i = 0; codewords.length < dataLen; i++) codewords.push(pads[i % 2]);

    // split into blocks, compute EC, interleave
    const blocks = [];
    let off = 0;
    for (const size of blockSizes) {
        const d = codewords.slice(off, off + size);
        off += size;
        blocks.push({ d, e: rsEccDivide(d, ecLen) });
    }
    const inter = [];
    const maxD = Math.max(...blockSizes);
    for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) inter.push(b.d[i]);
    for (let i = 0; i < ecLen; i++) for (const b of blocks) inter.push(b.e[i]);

    // matrix scaffolding
    const size = 17 + version * 4;
    const modules = new Uint8Array(size * size);
    const reserved = new Uint8Array(size * size);
    const set = (x, y, v) => { modules[y * size + x] = v ? 1 : 0; reserved[y * size + x] = 1; };

    const finder = (cx, cy) => {
        for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || y < 0 || x >= size || y >= size) continue;
            const inOuter = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
            const onRing = inOuter && (dx === 0 || dx === 6 || dy === 0 || dy === 6);
            const inCore = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
            set(x, y, onRing || inCore);
        }
    };
    finder(0, 0);
    finder(size - 7, 0);
    finder(0, size - 7);

    // alignment patterns (skip any overlapping a finder)
    const centers = QR_ALIGN[version];
    for (const cy of centers) for (const cx of centers) {
        if ((cx <= 8 && cy <= 8) || (cx <= 8 && cy >= size - 9) || (cx >= size - 9 && cy <= 8)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
    }

    // timing patterns
    for (let i = 8; i < size - 8; i++) {
        if (!reserved[6 * size + i]) set(i, 6, i % 2 === 0);
        if (!reserved[i * size + 6]) set(6, i, i % 2 === 0);
    }

    // reserve format areas (values written after masking)
    for (let i = 0; i < 9; i++) {
        if (i !== 6) { reserved[8 * size + i] = 1; reserved[i * size + 8] = 1; }
    }
    for (let i = 0; i < 8; i++) {
        reserved[8 * size + (size - 1 - i)] = 1;
        reserved[(size - 1 - i) * size + 8] = 1;
    }
    modules[(size - 8) * size + 8] = 1; // the always-dark module
    reserved[(size - 8) * size + 8] = 1;

    // version info (v7+)
    if (version >= 7) {
        let rem = version;
        for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) & 1 ? 0x1f25 : 0);
        const info = ((version << 12) | rem) >>> 0;
        for (let i = 0; i < 18; i++) {
            const bit = (info >> i) & 1;
            const a = Math.floor(i / 3);
            const b = (i % 3) + size - 11;
            set(a, b, bit);
            set(b, a, bit);
        }
    }

    // data placement: upward/downward zigzag, right to left, skipping col 6
    const dataBits = [];
    for (const cw of inter) for (let i = 7; i >= 0; i--) dataBits.push((cw >> i) & 1);
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        for (let i = 0; i < size; i++) {
            const y = upward ? size - 1 - i : i;
            for (const x of [col, col - 1]) {
                if (reserved[y * size + x]) continue;
                modules[y * size + x] = bitIdx < dataBits.length ? dataBits[bitIdx] : 0;
                bitIdx++;
            }
        }
        upward = !upward;
    }

    // mask selection by penalty
    const maskFns = [
        (x, y) => (x + y) % 2 === 0,
        (x, y) => y % 2 === 0,
        (x, y) => x % 3 === 0,
        (x, y) => (x + y) % 3 === 0,
        (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
        (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
        (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
        (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];

    const applyMask = (m) => {
        const out = new Uint8Array(modules);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            if (!reserved[y * size + x] && maskFns[m](x, y)) out[y * size + x] ^= 1;
        }
        // format info: EC M = 00, then mask
        let fmt = (0b00 << 3) | m;
        let rem = fmt;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) & 1 ? 0x537 : 0);
        const info = (((fmt << 10) | rem) ^ 0x5412) >>> 0;
        const fbit = (i) => (info >> i) & 1;
        for (let i = 0; i < 6; i++) out[8 * size + i] = fbit(14 - i);
        out[8 * size + 7] = fbit(8);
        out[8 * size + 8] = fbit(7);
        out[7 * size + 8] = fbit(6);
        for (let i = 0; i < 6; i++) out[(5 - i) * size + 8] = fbit(5 - i) ? 1 : 0;
        // second copy
        for (let i = 0; i < 7; i++) out[(size - 1 - i) * size + 8] = fbit(14 - i);
        for (let i = 0; i < 8; i++) out[8 * size + (size - 8 + i)] = fbit(7 - i);
        out[(size - 8) * size + 8] = 1; // dark module survives
        return out;
    };

    const penalty = (grid) => {
        let score = 0;
        const at = (x, y) => grid[y * size + x];
        // N1: runs
        for (let pass = 0; pass < 2; pass++) {
            for (let a = 0; a < size; a++) {
                let run = 1;
                let prev = pass ? at(a, 0) : at(0, a);
                for (let b = 1; b < size; b++) {
                    const cur = pass ? at(a, b) : at(b, a);
                    if (cur === prev) run++;
                    else { if (run >= 5) score += 3 + (run - 5); run = 1; prev = cur; }
                }
                if (run >= 5) score += 3 + (run - 5);
            }
        }
        // N2: 2x2 blocks
        for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
            const v = at(x, y);
            if (v === at(x + 1, y) && v === at(x, y + 1) && v === at(x + 1, y + 1)) score += 3;
        }
        // N3: finder-like 1011101 with 0000 on a side
        const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
        const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
        for (let pass = 0; pass < 2; pass++) {
            for (let a = 0; a < size; a++) for (let b = 0; b <= size - 11; b++) {
                let m1 = true;
                let m2 = true;
                for (let k = 0; k < 11; k++) {
                    const v = pass ? at(a, b + k) : at(b + k, a);
                    if (v !== pat1[k]) m1 = false;
                    if (v !== pat2[k]) m2 = false;
                }
                if (m1) score += 40;
                if (m2) score += 40;
            }
        }
        // N4: dark ratio
        let dark = 0;
        for (const v of grid) dark += v;
        score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
        return score;
    };

    let best = null;
    let bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
        const g = applyMask(m);
        const s = penalty(g);
        if (s < bestScore) { bestScore = s; best = g; }
    }
    return { size, modules: best };
}

// ── editor support ───────────────────────────────────────────────────────────

/**
 * The on-canvas rectangle a layer occupies, for selection outlines and
 * hit-testing. Only movable layer kinds report bounds — the slideshow,
 * caption and chrome layers are configured from the panel, not dragged.
 * Text bounds need a ctx for measureText.
 */
export function layerBounds(ctx, plan, layer) {
    if (layer.type === 'image') return { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
    if (layer.type === 'qr') return { x: layer.x, y: layer.y, w: layer._qrPx || layer.size, h: layer._qrPx || layer.size };
    if (layer.type === 'photo' && layer.fw) {
        // Only INSET photos report bounds — a full-stage photo is configured
        // from its lane and the inspector, not dragged.
        const entry = plan.images[layer.index];
        const w = plan.W * layer.fw;
        const h = layer.fh ? plan.H * layer.fh : (entry ? w * (entry.height / Math.max(1, entry.width)) : w);
        return { x: plan.W * (layer.fx ?? 0.3), y: plan.H * (layer.fy ?? 0.3), w, h };
    }
    if (layer.type === 'text') {
        ctx.save();
        ctx.font = layer.font;
        if (layer.rtl) ctx.direction = 'rtl';
        const w = ctx.measureText(layer.text).width;
        ctx.restore();
        const size = layer.sizePx || 24;
        const x0 = layer.align === 'center' ? layer.x - w / 2 : layer.align === 'right' ? layer.x - w : layer.x;
        const y0 = layer.baseline === 'bottom' ? layer.y - size : layer.baseline === 'middle' ? layer.y - size / 2 : layer.y;
        // Padded a little so thin text is still clickable.
        return { x: x0 - 8, y: y0 - 6, w: w + 16, h: Math.round(size * 1.3) + 8 };
    }
    return null;
}

/** Rotate point (x, y) about (cx, cy) by `deg` degrees. */
function rotatePoint(x, y, cx, cy, deg) {
    const a = (deg * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}

/**
 * The topmost movable layer under canvas point (x, y), or null. Iterates in
 * PAINT order (z descending) so what LOOKS frontmost is what a click selects;
 * a rotated layer is tested by un-rotating the pointer into its frame.
 */
export function hitTestLayers(ctx, plan, x, y) {
    const ordered = [...plan.layers].sort((a, b) => (a.z || 0) - (b.z || 0));
    for (let i = ordered.length - 1; i >= 0; i--) {
        const layer = ordered[i];
        if (layer.visible === false) continue;
        const movable = layer.type === 'text' || layer.type === 'image' || layer.type === 'qr'
            || (layer.type === 'photo' && layer.fw);
        if (!movable) continue;
        const b = layerBounds(ctx, plan, layer);
        if (!b) continue;
        let px = x;
        let py = y;
        if (layer.rot) ({ x: px, y: py } = rotatePoint(x, y, b.x + b.w / 2, b.y + b.h / 2, -layer.rot));
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return { layer, bounds: b };
    }
    return null;
}

/**
 * The selection instrument: four corner handles plus a rotation stalk, in
 * canvas pixels, rotated with the layer. The editor draws these and feeds
 * pointer hits back through hitTestHandles / resizePatch.
 */
export function layerHandles(ctx, plan, layer) {
    const b = layerBounds(ctx, plan, layer);
    if (!b) return null;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const stalk = Math.max(24, Math.round(plan.W * 0.022));
    const pts = [
        { kind: 'nw', x: b.x, y: b.y },
        { kind: 'ne', x: b.x + b.w, y: b.y },
        { kind: 'se', x: b.x + b.w, y: b.y + b.h },
        { kind: 'sw', x: b.x, y: b.y + b.h },
        { kind: 'rotate', x: cx, y: b.y - stalk },
    ];
    if (layer.rot) {
        for (const p of pts) Object.assign(p, rotatePoint(p.x, p.y, cx, cy, layer.rot));
    }
    return { bounds: b, center: { x: cx, y: cy }, handles: pts };
}

/** The handle under (x, y) within `tolerance` canvas pixels, or null. */
export function hitTestHandles(ctx, plan, layer, x, y, tolerance = 16) {
    const h = layerHandles(ctx, plan, layer);
    if (!h) return null;
    for (const p of h.handles) {
        if (Math.hypot(x - p.x, y - p.y) <= tolerance) {
            return { ...p, center: h.center, bounds: h.bounds };
        }
    }
    return null;
}

/**
 * Uniform scale factor for a corner drag. The anchor is the corner OPPOSITE
 * the grabbed one — the reflection of the handle through the centre, which is
 * the same world point whatever the rotation. k is the ratio of the pointer's
 * distance to that anchor now vs at grab time.
 */
export function scaleFromDrag(handleHit, start, current) {
    const anchor = { x: handleHit.center.x * 2 - handleHit.x, y: handleHit.center.y * 2 - handleHit.y };
    const d0 = Math.max(8, Math.hypot(start.x - anchor.x, start.y - anchor.y));
    const d1 = Math.max(8, Math.hypot(current.x - anchor.x, current.y - anchor.y));
    return d1 / d0;
}

/** The new box origin with the corner OPPOSITE the grabbed one held fixed. */
function anchoredOrigin(b0, kind, newW, newH) {
    if (kind === 'se') return { bx: b0.x, by: b0.y }; // anchor nw
    if (kind === 'sw') return { bx: b0.x + b0.w - newW, by: b0.y }; // anchor ne
    if (kind === 'ne') return { bx: b0.x, by: b0.y + b0.h - newH }; // anchor sw
    return { bx: b0.x + b0.w - newW, by: b0.y + b0.h - newH }; // 'nw' → anchor se
}

/**
 * The patch a corner-drag writes: size multiplied by k, position set so the
 * anchor corner stays put. Computed from the BOUNDS, not by mapping the
 * stored point affinely — text bounds carry constant padding and their width
 * comes from font metrics, so the only exact way is to build the target box
 * anchored, then invert the bounds formula back to the stored point. The
 * measurement here mirrors what applyLayerPatches will do with the patch,
 * so the anchor holds to the pixel after the plan rebuilds.
 */
export function resizePatch(ctx, plan, layer, kind, k) {
    const b0 = layerBounds(ctx, plan, layer);
    if (!b0 || !['nw', 'ne', 'se', 'sw'].includes(kind)) return null;
    const patch = { id: layer.id };

    if (layer.type === 'text') {
        const base = layer.sizeFrac || 0.035;
        const kk = Math.max(0.015 / base, Math.min(0.2 / base, k));
        const newFrac = +(base * kk).toFixed(4);
        const sizePx = Math.max(10, Math.round(plan.W * newFrac));
        ctx.save();
        ctx.font = `${layer.weight || 600} ${sizePx}px ${FONT_STACK}`;
        if (layer.rtl) ctx.direction = 'rtl';
        const tw = ctx.measureText(layer.text).width;
        ctx.restore();
        const newW = tw + 16; // the constants in layerBounds' text case
        const newH = Math.round(sizePx * 1.3) + 8;
        const { bx, by } = anchoredOrigin(b0, kind, newW, newH);
        const x0 = bx + 8;
        const yTop = by + 6;
        const xPt = layer.align === 'center' ? x0 + tw / 2 : layer.align === 'right' ? x0 + tw : x0;
        const yPt = layer.baseline === 'bottom' ? yTop + sizePx : layer.baseline === 'middle' ? yTop + sizePx / 2 : yTop;
        patch.sizeFrac = newFrac;
        patch.fx = +(xPt / plan.W).toFixed(4);
        patch.fy = +(yPt / plan.H).toFixed(4);
        return patch;
    }

    // image / qr / inset photo: top-left anchored boxes with no padding.
    const baseFw = layer.fw ?? (layer.w ? layer.w / plan.W : 0.16);
    const kk = Math.max(0.03 / baseFw, Math.min(0.9 / baseFw, k));
    const newFw = +(baseFw * kk).toFixed(4);
    const scale = newFw / baseFw;
    const { bx, by } = anchoredOrigin(b0, kind, b0.w * scale, b0.h * scale);
    patch.fw = newFw;
    if (layer.fh) patch.fh = +(layer.fh * kk).toFixed(4);
    patch.fx = +(bx / plan.W).toFixed(4);
    patch.fy = +(by / plan.H).toFixed(4);
    return patch;
}

/**
 * Paint the frame at time `t`. Pure: same t always gives the same picture, so
 * the preview scrubber and the recorder share one code path. The frame is the
 * background plus plan.layers painted in z order (ascending — the sort is
 * stable, so equal z keeps compile order); a layer skips when hidden or
 * outside its timing window, and its entry/exit envelope is applied around
 * its painter.
 */
export function paintFrame(ctx, plan, t) {
    const time = Math.max(0, Math.min(plan.duration, t));

    ctx.save();
    ctx.fillStyle = plan.theme.bg;
    ctx.fillRect(0, 0, plan.W, plan.H);

    const ordered = [...plan.layers].sort((a, b) => (a.z || 0) - (b.z || 0));

    for (const layer of ordered) {
        if (layer.visible === false) continue;
        // Inclusive at the end: the old slideshow held an image through
        // `time <= slot.end`, and the very last frame paints at exactly
        // t === duration — it must still show the last photo.
        if (layer.timing && (time < layer.timing.start || time > layer.timing.end)) continue;
        const painter = PAINTERS[layer.type];
        if (!painter) continue;
        ctx.save();
        const env = envelopeAt(plan, layer, time);
        if (env) {
            if (env.tx || env.ty) ctx.translate(env.tx, env.ty);
            if (env.scale !== 1) {
                ctx.translate(plan.W / 2, plan.H / 2);
                ctx.scale(env.scale, env.scale);
                ctx.translate(-plan.W / 2, -plan.H / 2);
            }
            if (env.alpha < 1) ctx.globalAlpha = env.alpha;
        }
        // Rotation lives here, not in the painters — the same trick as the
        // envelope: rotate about the layer's own centre and every layer type
        // gets it without its painter knowing.
        if (layer.rot) {
            const b = layerBounds(ctx, plan, layer);
            if (b) {
                const cx = b.x + b.w / 2;
                const cy = b.y + b.h / 2;
                ctx.translate(cx, cy);
                ctx.rotate((layer.rot * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }
        }
        painter(ctx, plan, layer, time);
        ctx.restore();
    }

    ctx.restore();
}

// ── recording ────────────────────────────────────────────────────────────────

/**
 * Run a throwaway recording before the real one, and throw the result away.
 *
 * The FIRST MediaRecorder in a process pays for bringing the whole pipeline up —
 * the capture track, the GPU path, the H.264 encoder. Frames pushed during that
 * window are dropped on the floor, and the recorder timestamps against the wall
 * clock regardless, so the first video of a session came out visibly thinner
 * than the rest (a third of the bytes) and sometimes completely empty. Warming
 * the CANVAS alone does not fix it; the encoder is what is slow to arrive.
 *
 * Paying that cost against a recorder whose output is discarded means the real
 * take starts against a pipeline that is already running. Best-effort: if any
 * of it throws, the real recording still goes ahead.
 */
async function primeEncoder(plan, mimeType) {
    try {
        // The primer records ITS OWN small canvas, never the real stream. An
        // earlier version primed on the same stream the real recorder then
        // started on — and a track handed from a just-stopped recorder to a new
        // one is itself a race, which occasionally reproduced the exact empty
        // file the primer exists to prevent.
        const c = document.createElement('canvas');
        c.width = 480;
        c.height = 270;
        const cctx = c.getContext('2d');
        const s = c.captureStream(0);
        const track = s.getVideoTracks()[0];
        const push = track && typeof track.requestFrame === 'function' ? () => track.requestFrame() : () => {};

        const primer = new MediaRecorder(s, { mimeType, videoBitsPerSecond: 500000 });
        const done = new Promise((resolve) => { primer.onstop = resolve; primer.onerror = resolve; });
        primer.ondataavailable = () => { /* deliberately discarded */ };
        primer.start(PRIME_SLICE_MS);
        for (let i = 0; i < PRIME_FRAMES; i++) {
            cctx.fillStyle = i % 2 ? '#222' : '#444';
            cctx.fillRect(0, 0, c.width, c.height);
            push();
            await new Promise((r) => setTimeout(r, Math.max(16, 1000 / plan.fps)));
        }
        primer.stop();
        await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
        s.getTracks().forEach((t) => t.stop());
    } catch { /* the real recording is what matters */ }
}

/** The sound layers a host must resolve into clips before calling renderVideo. */
export function soundLayers(plan) {
    return plan.layers.filter((l) => l.type === 'sound' && l.visible !== false);
}

/**
 * A renderVideo clip from a sound layer plus the buffer the host decoded for
 * it. `defaults` supplies the studio-level volume/fades that apply when the
 * layer doesn't carry its own.
 */
export function clipFromSoundLayer(layer, buffer, plan, defaults = {}) {
    return {
        buffer,
        start: layer.timing ? layer.timing.start : 0,
        end: layer.timing ? layer.timing.end : plan.duration,
        offset: layer.offset || 0,
        volume: layer.volume ?? defaults.volume,
        fadeIn: layer.enter?.seconds ?? defaults.fadeIn ?? 0,
        fadeOut: layer.exit?.seconds ?? defaults.fadeOut ?? 0,
        loop: !!layer.loop,
    };
}

/**
 * Every accepted `audio` shape, reduced to one list of scheduled clips.
 * The single-bed form ({ buffer, offset, volume, fadeIn, fadeOut }) is the one
 * every stored recipe and the poster already use: it becomes a one-clip array
 * that loops across the whole video — nothing about its output changes.
 */
function normalizeAudioClips(audio, plan) {
    if (!audio) return [];
    const raw = Array.isArray(audio) ? audio
        : Array.isArray(audio.clips) ? audio.clips
            : audio.buffer ? [{ ...audio, loop: audio.loop !== false }] : [];
    const clips = [];
    for (const c of raw) {
        if (!c?.buffer) continue;
        const start = Math.max(0, Math.min(plan.duration, Number(c.start) || 0));
        const end = Math.max(start, Math.min(plan.duration, Number(c.end) || plan.duration));
        const dur = end - start;
        if (dur <= 0.05) continue;
        clips.push({
            buffer: c.buffer,
            start,
            dur,
            offset: c.buffer.duration > 0 ? (Number(c.offset) || 0) % c.buffer.duration : 0,
            vol: Math.max(0, Math.min(1, c.volume ?? 0.7)),
            fadeIn: Math.max(0, Math.min(c.fadeIn ?? 1.2, dur / 3)),
            fadeOut: Math.max(0, Math.min(c.fadeOut ?? 1.6, dur / 3)),
            loop: !!c.loop,
        });
    }
    return clips;
}

/**
 * Record `plan` off `canvas` in real time. Resolves to the encoded blob.
 * onProgress gets 0..1; `signal` cancels.
 *
 * `audio` is either the legacy single bed ({ buffer, offset, volume, fadeIn,
 * fadeOut }) or { clips: [...] } — each clip a bed-shaped record plus `start`
 * and `end` on the video's clock. Clips may overlap; each gets its own source
 * and gain envelope into the one recorded stream.
 */
export async function renderVideo({ canvas, plan, audio, onProgress, signal }) {
    const clips = normalizeAudioClips(audio, plan);
    const withAudio = clips.length > 0;
    const mimeType = pickMimeType(withAudio);
    if (!mimeType) throw new Error(unsupportedReason() || 'This browser cannot record video.');

    const ctx = canvas.getContext('2d');

    // ── music ──
    // The track is played into a MediaStreamDestination and its output track
    // joins the canvas track in one stream, so the recorder muxes both into a
    // single file. Looped to cover the video and faded at both ends — a hard cut
    // into and out of music is the tell of an auto-generated clip.
    //
    // resume() FIRST, before anything else exists. It can take over a second on
    // a cold context, and the recorder timestamps the audio track from when it
    // went live: set the graph up early and that whole delay is prepended to the
    // file as silence, which is how a 4.8s plan lands as a 6.2s video.
    let audioNodes = null;
    if (withAudio) {
        const ac = audioContext();
        if (ac.state === 'suspended') { try { await ac.resume(); } catch { /* falls through to the check below */ } }
        audioNodes = { ac };
    }

    // captureStream(0) means "capture only when I say so", and every painted
    // frame is then pushed explicitly with requestFrame().
    //
    // The rate-based form, captureStream(fps), samples the canvas off the
    // compositor — and a hidden or unfocused window barely composites, so it
    // silently drops most of what was painted. That is what made a render in an
    // offscreen Electron window come out a fraction of the size of the same
    // render in a visible tab. Pushing frames removes the compositor from the
    // path entirely; timestamps still come from the wall clock, which is what
    // the loop below is paced against, so the duration is unaffected.
    let canvasStream = canvas.captureStream(0);
    let videoTrack = canvasStream.getVideoTracks()[0];
    const manualFrames = !!videoTrack && typeof videoTrack.requestFrame === 'function';
    if (!manualFrames) {
        // Older engines: fall back to rate-based capture.
        canvasStream.getTracks().forEach((t) => t.stop());
        canvasStream = canvas.captureStream(plan.fps);
        videoTrack = canvasStream.getVideoTracks()[0];
    }
    let framesPushed = 0;
    const pushFrame = manualFrames
        ? () => { framesPushed++; try { videoTrack.requestFrame(); } catch { /* track ended */ } }
        : () => { framesPushed++; };

    const tracks = [...canvasStream.getVideoTracks()];

    if (audioNodes) {
        // One destination, one source + gain per clip — overlapping clips mix
        // by simple summation into the single recorded audio track.
        const { ac } = audioNodes;
        const dest = ac.createMediaStreamDestination();
        const sources = clips.map((clip) => {
            const source = ac.createBufferSource();
            source.buffer = clip.buffer;
            source.loop = clip.loop;
            const gain = ac.createGain();
            source.connect(gain);
            gain.connect(dest);
            return { source, gain, clip };
        });
        tracks.push(...dest.stream.getAudioTracks());
        Object.assign(audioNodes, { dest, sources });
    }

    const stream = new MediaStream(tracks);
    const rec = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: plan.bitrate,
        ...(withAudio ? { audioBitsPerSecond: 128000 } : {}),
    });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const stopped = new Promise((resolve, reject) => {
        rec.onstop = resolve;
        rec.onerror = (e) => reject(e?.error || new Error('The recorder failed mid-render.'));
    });

    await primeEncoder(plan, mimeType);
    paintFrame(ctx, plan, 0);
    pushFrame();
    rec.start(1000);

    // Music starts in the same tick the recorder does, and every clip is
    // scheduled from that instant — any earlier and the fades drift out of
    // step with the picture by however long the setup above took.
    if (audioNodes) {
        const { ac, sources } = audioNodes;
        const t0a = ac.currentTime;
        for (const { source, gain, clip } of sources) {
            const at = t0a + clip.start;
            gain.gain.setValueAtTime(0, at);
            gain.gain.linearRampToValueAtTime(clip.vol, at + clip.fadeIn);
            gain.gain.setValueAtTime(clip.vol, at + Math.max(clip.fadeIn, clip.dur - clip.fadeOut));
            gain.gain.linearRampToValueAtTime(0, at + clip.dur);
            // A looped clip runs until the explicit stop below; a one-shot is
            // bounded here so it can never spill past its window.
            if (clip.loop) source.start(at, clip.offset);
            else source.start(at, clip.offset, clip.dur);
        }
    }

    // Paced by setTimeout, NOT requestAnimationFrame. rAF only fires while the
    // page is actually being composited — in an offscreen or non-rendering
    // context it never ticks at all, and an rAF-driven loop then hangs forever
    // instead of merely stuttering. A timer always fires (throttled to ~1Hz in a
    // backgrounded tab, which freezes the picture but still ends on schedule,
    // because the clock below is wall time and not a frame count).
    const frameMs = 1000 / plan.fps;
    const t0 = performance.now();
    let timer = 0;
    let cancelled = false;
    await new Promise((resolve) => {
        const step = () => {
            if (signal?.aborted) { cancelled = true; resolve(); return; }
            const t = (performance.now() - t0) / 1000;
            if (t >= plan.duration) { paintFrame(ctx, plan, plan.duration); pushFrame(); resolve(); return; }
            paintFrame(ctx, plan, t);
            pushFrame();
            onProgress?.(t / plan.duration);
            // Aim at the next frame boundary rather than "now + frameMs", so a
            // slow frame doesn't push every later one further behind.
            const drift = (performance.now() - t0) - Math.floor((performance.now() - t0) / frameMs) * frameMs;
            timer = setTimeout(step, Math.max(0, frameMs - drift));
        };
        timer = setTimeout(step, 0);
    });
    clearTimeout(timer);

    // End the music the instant the picture does. A canvas track simply stops
    // producing frames when painting stops, but an audio track goes on emitting
    // real-time samples until it is ended — including through the tail wait and
    // the recorder's own finalize — and every one of those samples extends the
    // file. Left running it tacks a second or more of silence onto a video whose
    // content ended on schedule.
    if (audioNodes) {
        for (const s of audioNodes.sources) {
            try { s.source.stop(); } catch { /* already ended */ }
        }
        audioNodes.dest.stream.getAudioTracks().forEach((tr) => tr.stop());
    }

    // The last painted frame needs to reach the encoder before the tap closes.
    await new Promise((r) => setTimeout(r, 260));
    try { rec.stop(); } catch { /* already stopping */ }
    await stopped;
    stream.getTracks().forEach((tr) => tr.stop());
    canvasStream.getTracks().forEach((tr) => tr.stop());
    if (audioNodes) {
        // Disconnect but do NOT close the shared context — it still owns the
        // decoded buffers of every other track in the library.
        for (const s of audioNodes.sources) {
            try { s.source.disconnect(); s.gain.disconnect(); } catch { /* already torn down */ }
        }
    }

    if (cancelled) throw new DOMException('Render cancelled', 'AbortError');

    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) throw new Error('The recorder produced an empty file. Keep this tab in the foreground while it renders.');
    onProgress?.(1);
    return {
        blob, mimeType, extension: extensionFor(mimeType), duration: plan.duration,
        hasAudio: withAudio,
        // Frames actually delivered vs asked for. A big shortfall means the host
        // throttled the render loop (a hidden or backgrounded window does this),
        // which shows up as a juddery video rather than an error — so it is
        // reported rather than left for someone to notice in the output.
        frames: framesPushed,
        expectedFrames: Math.round(plan.fps * plan.duration),
    };
}

/** Slug-safe file name for the generated video. */
export function videoFileName(post, extension) {
    const base = String(post?.title || 'social-post')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'social-post';
    return `${base}-video.${extension}`;
}
