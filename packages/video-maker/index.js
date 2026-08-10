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
    showTitle: true,
    titleSeconds: 3.2,
    showProgress: true,
    textPosition: 'bottom', // 'bottom' | 'middle'
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

/** True when a post has stills and nothing that is already a video. */
export function isImageOnly(post) {
    const hasVideo = (post?.video || []).length > 0
        || (post?.media || []).some((m) => /^video\//i.test(m?.mime || '') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(m?.url || ''));
    return !hasVideo && imageItems(post).length > 0;
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
export function buildPlan({ canvas, images, title, body, logo, options }) {
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

    const bandFraction = opts.aspect === 'vertical' ? 0.32 : 0.38;
    const maxVisibleLines = Math.max(2, Math.min(9, Math.floor((H * bandFraction - pad * 2) / lineHeight)));

    const count = Math.max(1, images.length);
    const fade = count > 1 ? Math.min(opts.fadeSeconds, opts.secondsPerImage * 0.5) : 0;
    const imagesDuration = count * opts.secondsPerImage;

    const totalChars = text.length;
    let cps = Math.max(1, opts.charsPerSecond);
    let needed = opts.leadInSeconds + totalChars / cps + opts.tailSeconds;
    let spedUp = false;
    if (needed > opts.maxSeconds) {
        const typingWindow = Math.max(1, opts.maxSeconds - opts.leadInSeconds - opts.tailSeconds);
        cps = totalChars / typingWindow;
        needed = opts.maxSeconds;
        spedUp = true;
    }
    const duration = Math.max(3, Math.min(opts.maxSeconds, Math.max(imagesDuration, needed)));

    // Images stretch to fill whatever duration the text demanded.
    const slot = (duration - fade) / count;
    const slots = Array.from({ length: count }, (_, i) => ({
        start: i * slot,
        end: Math.min(duration, i * slot + slot + fade),
    }));

    const bitrate = Math.round(W * H * opts.fps * (QUALITY_BPP[opts.quality] ?? QUALITY_BPP.high));

    return {
        opts, theme, W, H, fps: opts.fps, duration, bitrate,
        images, slots, fade,
        logo: opts.showLogo ? (logo || null) : null,
        title: String(title || '').trim(),
        text, lines, totalChars, cps,
        bodySize, lineHeight, titleSize, margin, pad, textWidth, maxVisibleLines,
        spedUp,
        secondsPerImageEffective: slot,
    };
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
    ctx.globalAlpha = alpha;

    if (opts.fit === 'cover') {
        const c = coverRect(entry.width, entry.height, W, H);
        const w = c.w * kb.zoom;
        const h = c.h * kb.zoom;
        ctx.drawImage(img, (W - w) / 2 + kb.dx * W, (H - h) / 2 + kb.dy * H, w, h);
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

/**
 * Paint the frame at time `t`. Pure: same t always gives the same picture, so
 * the preview scrubber and the recorder share one code path.
 */
export function paintFrame(ctx, plan, t) {
    const { W, H, theme, opts, lines, lineHeight, bodySize, margin, pad, maxVisibleLines } = plan;
    const time = Math.max(0, Math.min(plan.duration, t));

    ctx.save();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    // The band the caption owns; in blur mode the photo is fitted above it.
    const captionBandH = Math.round(maxVisibleLines * lineHeight + pad * 2 + margin);
    const stageRect = opts.textPosition === 'middle'
        ? { x: margin * 0.4, y: margin * 0.6, w: W - margin * 0.8, h: H - margin * 1.2 }
        : { x: margin * 0.4, y: margin * 0.6, w: W - margin * 0.8, h: H - captionBandH - margin * 0.6 };

    for (let i = 0; i < plan.images.length; i++) {
        const s = plan.slots[i];
        if (time < s.start || time > s.end) continue;
        const local = (time - s.start) / Math.max(0.0001, s.end - s.start);
        const alpha = (i > 0 && plan.fade > 0 && time < s.start + plan.fade)
            ? (time - s.start) / plan.fade
            : 1;
        drawImageLayer(ctx, plan, plan.images[i], i, local, Math.max(0, Math.min(1, alpha)), stageRect);
    }

    // Legibility gradient under the caption band.
    if (opts.textPosition === 'bottom') {
        const g = ctx.createLinearGradient(0, H - captionBandH * 1.5, 0, H);
        g.addColorStop(0, theme.key === 'light' ? 'rgba(244,244,246,0)' : 'rgba(8,6,14,0)');
        g.addColorStop(1, theme.key === 'light' ? 'rgba(244,244,246,0.9)' : 'rgba(8,6,14,0.85)');
        ctx.fillStyle = g;
        ctx.fillRect(0, H - captionBandH * 1.5, W, captionBandH * 1.5);
    }

    // ── typed caption ──
    const revealed = Math.max(0, Math.floor((time - opts.leadInSeconds) * plan.cps));
    const n = Math.min(plan.totalChars, revealed);
    const typing = n < plan.totalChars && time > opts.leadInSeconds;

    if (n > 0 || typing) {
        ctx.font = `500 ${bodySize}px ${FONT_STACK}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        const posF = revealPosition(lines, n);
        const shownLines = Math.max(1, Math.min(maxVisibleLines, posF + 1));
        const boxH = Math.round(shownLines * lineHeight + pad * 2);
        const boxW = W - margin * 2;
        const boxX = margin;
        const boxY = opts.textPosition === 'middle'
            ? Math.round((H - boxH) / 2)
            : Math.round(H - margin - boxH);

        ctx.save();
        ctx.fillStyle = theme.scrim;
        roundRect(ctx, boxX, boxY, boxW, boxH, Math.round(W * 0.028));
        ctx.fill();
        ctx.strokeStyle = theme.key === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Clip so scrolled-off lines vanish at the box edge instead of bleeding.
        roundRect(ctx, boxX, boxY, boxW, boxH, Math.round(W * 0.028));
        ctx.clip();

        const scroll = Math.max(0, posF - (maxVisibleLines - 1)) * lineHeight;
        const textX = boxX + pad;
        const textTop = boxY + pad - scroll;

        ctx.fillStyle = theme.text;
        let caret = null;
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (n < l.start) break; // `<` not `<=`: at n === start the caret has just landed on this line
            const y = textTop + i * lineHeight;
            if (y > boxY + boxH || y + lineHeight < boxY - lineHeight) continue;
            const slice = plan.text.slice(l.start, Math.min(l.end, n)).replace(/\s+$/, '');
            if (slice) ctx.fillText(slice, textX, y);
            if (n <= l.end) caret = { x: textX + ctx.measureText(slice).width + Math.round(bodySize * 0.14), y };
        }

        if (typing && caret && (time * 2) % 1 < 0.62) {
            ctx.fillStyle = theme.accent;
            ctx.fillRect(caret.x, caret.y + Math.round(bodySize * 0.12), Math.round(bodySize * 0.09), bodySize);
        }
        ctx.restore();
    }

    // ── title card ──
    if (opts.showTitle && plan.title && time < opts.titleSeconds) {
        const fadeIn = Math.min(1, time / 0.45);
        const fadeOut = Math.min(1, Math.max(0, (opts.titleSeconds - time) / 0.6));
        const a = Math.min(fadeIn, fadeOut);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.font = `700 ${plan.titleSize}px ${FONT_STACK}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        const tLines = layoutLines(ctx, plan.title, W - margin * 2 - pad * 2).slice(0, 3);
        const boxH = tLines.length * Math.round(plan.titleSize * 1.28) + pad * 1.6;
        ctx.fillStyle = theme.scrim;
        roundRect(ctx, margin, margin, W - margin * 2, boxH, Math.round(W * 0.028));
        ctx.fill();
        ctx.fillStyle = theme.text;
        tLines.forEach((l, i) => {
            ctx.fillText(plan.title.slice(l.start, l.end).replace(/\s+$/, ''),
                margin + pad, margin + pad * 0.8 + i * Math.round(plan.titleSize * 1.28));
        });
        ctx.restore();
    }

    // ── brand mark ──
    // Anchored to where the caption box sits at its FULL height, not its current
    // one. Tied to the growing box it would creep up the frame as the text
    // typed, which reads as a wobble rather than a watermark.
    if (plan.logo?.img) {
        const li = plan.logo.img;
        const lw = W * Math.max(0.04, Math.min(0.4, opts.logoScale));
        const lh = lw * (plan.logo.height / Math.max(1, plan.logo.width));
        const fullBoxH = maxVisibleLines * lineHeight + pad * 2;
        const captionTopFull = opts.textPosition === 'middle'
            ? (H - fullBoxH) / 2
            : H - margin - fullBoxH;
        const bottomY = Math.max(margin, captionTopFull - margin * 0.45 - lh);
        const pos = opts.logoPosition || 'top-right';
        const x = pos.endsWith('left') ? margin : W - margin - lw;
        const y = pos.startsWith('top') ? margin : bottomY;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, opts.logoOpacity));
        // Most brand marks are transparent PNGs; over a busy photo they vanish
        // without something to lift them off it.
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = Math.round(W * 0.012);
        ctx.drawImage(li, x, y, lw, lh);
        ctx.restore();
    }

    // ── footer + progress ──
    if (opts.footer) {
        ctx.save();
        ctx.font = `600 ${Math.round(plan.bodySize * 0.62)}px ${FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = theme.dim;
        ctx.fillText(opts.footer, W / 2, H - Math.round(margin * 0.28));
        ctx.restore();
    }

    if (opts.showProgress) {
        const h = Math.max(4, Math.round(H * 0.004));
        ctx.fillStyle = theme.key === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)';
        ctx.fillRect(0, H - h, W, h);
        ctx.fillStyle = theme.accent;
        ctx.fillRect(0, H - h, W * (time / plan.duration), h);
    }

    // Open and close on black — a hard cut from frame zero looks like a glitch.
    const edge = 0.45;
    const dip = time < edge ? 1 - time / edge : (time > plan.duration - edge ? 1 - (plan.duration - time) / edge : 0);
    if (dip > 0) {
        ctx.fillStyle = theme.key === 'light' ? `rgba(255,255,255,${dip})` : `rgba(0,0,0,${dip})`;
        ctx.fillRect(0, 0, W, H);
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
async function primeEncoder(ctx, plan, stream, mimeType, pushFrame) {
    try {
        const primer = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: plan.bitrate });
        const done = new Promise((resolve) => { primer.onstop = resolve; primer.onerror = resolve; });
        primer.ondataavailable = () => { /* deliberately discarded */ };
        primer.start(PRIME_SLICE_MS);
        for (let i = 0; i < PRIME_FRAMES; i++) {
            paintFrame(ctx, plan, 0);
            pushFrame();
            await new Promise((r) => setTimeout(r, Math.max(16, 1000 / plan.fps)));
        }
        primer.stop();
        await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
    } catch { /* the real recording is what matters */ }
}

/**
 * Record `plan` off `canvas` in real time. Resolves to the encoded blob.
 * onProgress gets 0..1; `signal` cancels.
 */
export async function renderVideo({ canvas, plan, audio, onProgress, signal }) {
    const withAudio = !!audio?.buffer;
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
        const { ac } = audioNodes;
        const dest = ac.createMediaStreamDestination();
        const source = ac.createBufferSource();
        source.buffer = audio.buffer;
        source.loop = true;
        const gain = ac.createGain();
        source.connect(gain);
        gain.connect(dest);
        tracks.push(...dest.stream.getAudioTracks());
        Object.assign(audioNodes, { dest, source, gain });
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

    paintFrame(ctx, plan, 0);
    pushFrame();
    await primeEncoder(ctx, plan, stream, mimeType, pushFrame);
    rec.start(1000);

    // Music starts in the same tick the recorder does, and its envelope is
    // scheduled from that instant — any earlier and the fades drift out of step
    // with the picture by however long the setup above took.
    if (audioNodes) {
        const { ac, source, gain } = audioNodes;
        const vol = Math.max(0, Math.min(1, audio.volume ?? 0.7));
        const fadeIn = Math.max(0, Math.min(audio.fadeIn ?? 1.2, plan.duration / 3));
        const fadeOut = Math.max(0, Math.min(audio.fadeOut ?? 1.6, plan.duration / 3));
        const t = ac.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + fadeIn);
        gain.gain.setValueAtTime(vol, t + Math.max(fadeIn, plan.duration - fadeOut));
        gain.gain.linearRampToValueAtTime(0, t + plan.duration);
        const offset = audio.buffer.duration > 0 ? (audio.offset || 0) % audio.buffer.duration : 0;
        source.start(0, offset);
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
        try { audioNodes.source.stop(); } catch { /* already ended */ }
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
        try { audioNodes.source.disconnect(); audioNodes.gain.disconnect(); } catch { /* already torn down */ }
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
