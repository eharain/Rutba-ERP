/**
 * DEV FIXTURE — the T2 gate from docs/todo/video-studio-timeline-plan.md.
 *
 * A synthetic plan with every layer type on the timeline: compiled photos,
 * gradient, caption, title, logo, footer, outro, progress, edges, plus an
 * appended sticker, QR, second photo, second caption and a sound layer. No
 * auth and no network — the photos are painted, not fetched — so this page
 * exercises the timeline exactly as the studio mounts it, without a session.
 *
 * On load it also runs the retime probe: for a set of layers (compiled and
 * appended) it patches `timing` and asserts the layer paints inside its
 * window and not outside, by comparing frames with the layer shown vs hidden.
 * paintFrame is the preview AND the recorder, so proving the windows here is
 * proving "a retimed layer's video matches its preview at the same instants".
 * Results land in window.__T2 and on the page.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VideoTimeline from "../../components/VideoTimeline";
import { TimingRows, LookRows, TrackBrowser } from "../../components/InspectorRows";
import { onsetTimes, snapEdges, edgesFromLengths, lengthsFromEdges } from "../../lib/beats";
import { draftStoryboard, withoutDraft, SAFE, SB_PREFIX } from "../../lib/storyboard";
import { buildPlan, paintFrame, layerBounds, layerHandles, scaleFromDrag, resizePatch } from "../../lib/video-maker";

function makePhoto(seed, w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${(seed * 67) % 360},70%,45%)`);
    g.addColorStop(1, `hsl(${(seed * 131 + 40) % 360},60%,25%)`);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.fillStyle = "#fff";
    x.font = `${Math.round(h * 0.14)}px system-ui`;
    x.fillText(`photo ${seed}`, w * 0.08, h * 0.5);
    return { img: c, width: w, height: h };
}

function makeLogo() {
    const c = document.createElement("canvas");
    c.width = 400; c.height = 160;
    const x = c.getContext("2d");
    x.fillStyle = "#ffc107";
    x.beginPath(); x.arc(80, 80, 70, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#fff";
    x.font = "700 64px system-ui";
    x.fillText("RUTBA", 150, 104);
    return { img: c, width: 400, height: 160 };
}

const BODY = "Hand-embroidered lawn suit in soft pistachio. Stitched to order in every size, cash on delivery across Pakistan.";
const OPTIONS = {
    aspect: "square", theme: "dark", transition: "fade", fit: "blur",
    footer: "rutba.pk", outroSeconds: 2.5, outroText: "rutba.pk — shop now",
};
const CONTEXT = { url: "https://rutba.pk/s/test" };

const BASE_PATCHES = [
    { id: "sticker-1", type: "text", text: "SALE", pill: "accent", color: "#141118", weight: 800, sizeFrac: 0.05, fx: 0.18, fy: 0.07, align: "center", timing: { start: 1, end: 5 }, enter: { kind: "fade", seconds: 0.4 }, exit: { kind: "fade", seconds: 0.4 } },
    { id: "qr-1", type: "qr", fx: 0.68, fy: 0.05, fw: 0.22 },
    { id: "photo-again-1", type: "photo", index: 0, timing: { start: 7, end: 9.5 } },
    { id: "caption-again-1", type: "caption", text: "A second typewriter block.", timing: { start: 6, end: 10 } },
    { id: "sound-1", type: "sound", url: "about:none", name: "Voice-over", timing: { start: 2, end: 8 }, enter: { kind: "fade", seconds: 0.5 }, exit: { kind: "fade", seconds: 0.5 } },
];

// A library shaped like the real one: a hundred-odd tracks that all share one
// broad tag and each carry their own filename as a second. That shape is what
// made the picker unusable — every unique tag became a chip.
const FIXTURE_TRACKS = Array.from({ length: 114 }, (_, i) => ({
    documentId: `trk-${i}`,
    name: `${String(i + 1).padStart(3, "0")} - Track ${i + 1}`,
    credit: i % 7 === 0 ? "Studio session" : "",
    tags: ["quran", `${String(i + 1).padStart(3, "0")} - Track ${i + 1}.mp3`, ...(i % 5 === 0 ? ["short"] : [])],
    audio_file: { id: i },
}));

// The studio's music bed: a lane the timeline SHOWS but the plan never holds,
// because the bed lives in the render options. The probe below is what keeps
// "display only" true — an extra lane that could be trimmed would be writing
// timing nothing reads.
const EXTRA_LANES = [
    { id: "music-bed", type: "sound", name: "Music bed · fixture", readOnly: true, visible: true, z: -1, timing: null, enter: { kind: "fade", seconds: 0.5 }, exit: { kind: "fade", seconds: 1 } },
];

export default function TimelineFixturePage() {
    const canvasRef = useRef(null);
    const [layerPatches, setLayerPatches] = useState(BASE_PATCHES);
    const [selectedLayerId, setSelectedLayerId] = useState(null);
    const [previewTime, setPreviewTime] = useState(0);
    const [plan, setPlan] = useState(null);
    const [probe, setProbe] = useState(null);

    // Client-only: the photos are canvases, and SSR has no document.
    const [media, setMedia] = useState(null);
    useEffect(() => {
        setMedia({
            images: [makePhoto(1, 900, 1200), makePhoto(2, 1200, 900), makePhoto(3, 900, 900)],
            logo: makeLogo(),
        });
    }, []);

    const upsertPatch = useCallback((patch) => setLayerPatches((list) => {
        const arr = [...(list || [])];
        const i = arr.findIndex((p) => p.id === patch.id);
        if (i >= 0) arr[i] = { ...arr[i], ...patch }; else arr.push(patch);
        return arr;
    }), []);
    const removePatchLayer = useCallback((id) => setLayerPatches((list) => (list || []).filter((p) => p.id !== id)), []);

    const appendedIds = useMemo(() => new Set((layerPatches || []).filter((p) => p.type).map((p) => p.id)), [layerPatches]);

    // For the automated checker (poster tools/t2-check.js): current patches
    // and playhead, readable without scraping the DOM.
    useEffect(() => { window.__PATCHES = layerPatches; }, [layerPatches]);
    useEffect(() => { window.__PREVIEW_T = previewTime; }, [previewTime]);

    const buildArgs = useCallback((patches) => ({
        images: media.images, title: "Timeline fixture", body: BODY, logo: media.logo,
        options: OPTIONS, layerPatches: patches, context: CONTEXT,
    }), [media]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !media) return;
        const p = buildPlan({ canvas, ...buildArgs(layerPatches) });
        setPlan(p);
        paintFrame(canvas.getContext("2d"), p, Math.min(previewTime, p.duration));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layerPatches, buildArgs, media]);

    useEffect(() => {
        if (!plan || !canvasRef.current) return;
        paintFrame(canvasRef.current.getContext("2d"), plan, Math.min(previewTime, plan.duration));
    }, [previewTime, plan]);

    const duplicateLayer = (l) => {
        if (!plan) return;
        const newId = `${l.type}-${Date.now().toString(36)}`;
        const w = l.timing || { start: 0, end: plan.duration };
        const len = w.end - w.start;
        const start = Math.min(Math.max(0, w.start + Math.max(1, Math.min(len, 2))), Math.max(0, plan.duration - Math.max(0.5, len)));
        const timing = { start: +start.toFixed(3), end: +Math.min(plan.duration, start + len).toFixed(3) };
        const srcPatch = (layerPatches || []).find((p) => p.id === l.id && p.type);
        let patch = null;
        if (srcPatch) patch = { ...srcPatch, id: newId, timing };
        else if (l.type === "photo") patch = { id: newId, type: "photo", index: l.index, kbIndex: l.kbIndex ?? l.index, timing };
        else if (l.type === "image") patch = { id: newId, type: "image", src: "logo", fx: 0.4, fy: 0.4, fw: +(l.w / plan.W).toFixed(4), timing };
        else if (l.type === "caption") patch = { id: newId, type: "caption", timing };
        else if (l.type === "text") patch = { id: newId, type: "text", text: l.text, fx: 0.5, fy: 0.3, sizeFrac: 0.04, timing };
        else if (l.type === "sound") patch = { id: newId, type: "sound", trackId: l.trackId, url: l.url, offset: l.offset, timing };
        if (!patch) return;
        upsertPatch(patch);
        setSelectedLayerId(newId);
    };

    // ── the retime probe ────────────────────────────────────
    useEffect(() => {
        if (!plan || window.__T2) return;
        const c = document.createElement("canvas");
        const x = () => c.getContext("2d", { willReadFrequently: true });
        const mk = (patches) => buildPlan({ canvas: c, ...buildArgs(patches) });
        const snap = (p, t) => { paintFrame(x(), p, t); return new Uint32Array(x().getImageData(0, 0, c.width, c.height).data.buffer.slice(0)); };
        const differs = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true; return false; };

        // Each case: patch `id` to `timing`, then the layer must paint at
        // `inside` instants and not at `outside` ones — measured against the
        // same plan with the layer hidden.
        const cases = [
            { id: "sticker-1", timing: { start: 2, end: 4 }, inside: [3], outside: [1, 5] },
            { id: "qr-1", timing: { start: 5, end: 7 }, inside: [6], outside: [2, 8] },
            { id: "photo-again-1", timing: { start: 7, end: 9 }, inside: [8], outside: [3] },
            { id: "caption-again-1", timing: { start: 6, end: 10 }, inside: [8.5], outside: [3] },
            { id: "title", timing: { start: 1, end: 3 }, inside: [1.8], outside: [4] },
            { id: "logo", timing: { start: 2, end: 5 }, inside: [3.5], outside: [6] },
        ];
        const results = [];
        for (const cse of cases) {
            const withTiming = BASE_PATCHES.filter((p) => p.id !== cse.id).concat([{
                ...(BASE_PATCHES.find((p) => p.id === cse.id) || { id: cse.id }),
                timing: cse.timing,
            }]);
            const hidden = withTiming.map((p) => (p.id === cse.id ? { ...p, visible: false } : p));
            const pOn = mk(withTiming);
            const pOff = mk(hidden);
            for (const t of cse.inside) {
                results.push({ label: `${cse.id} paints inside its window @ ${t}s`, ok: differs(snap(pOn, t), snap(pOff, t)) });
            }
            for (const t of cse.outside) {
                results.push({ label: `${cse.id} absent outside its window @ ${t}s`, ok: !differs(snap(pOn, t), snap(pOff, t)) });
            }
        }
        const pass = results.every((r) => r.ok);
        window.__T2 = { done: true, pass, results };
        setProbe({ pass, results });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    // ── the geometry probe (v4-M1): rotation, insets, resize math ───────────
    useEffect(() => {
        if (!plan || window.__GEO) return;
        const c = document.createElement("canvas");
        const x = () => c.getContext("2d", { willReadFrequently: true });
        const mk = (patches) => buildPlan({ canvas: c, ...buildArgs(patches) });
        const snap = (p, t) => { paintFrame(x(), p, t); return new Uint32Array(x().getImageData(0, 0, c.width, c.height).data.buffer.slice(0)); };
        const differs = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true; return false; };
        const results = [];
        const push = (label, ok) => results.push({ label, ok });

        // Rotation reaches the pixels.
        const withRot = BASE_PATCHES.map((p) => (p.id === "sticker-1" ? { ...p, rot: 30 } : p));
        push("rotating a sticker changes its pixels", differs(snap(mk(withRot), 3), snap(mk(BASE_PATCHES), 3)));

        // A photo with geometry is an inset, not the stage.
        const withPip = [...BASE_PATCHES, { id: "photo-1", fx: 0.06, fy: 0.06, fw: 0.4 }];
        push("an inset photo paints differently from full-stage", differs(snap(mk(withPip), 1), snap(mk(BASE_PATCHES), 1)));

        // Corner-resize math: k from the drag, size scales by k, and the
        // OPPOSITE corner stays put after the patch round-trips a rebuild.
        const p0 = mk(BASE_PATCHES);
        const sticker = p0.layers.find((l) => l.id === "sticker-1");
        const h0 = layerHandles(x(), p0, sticker);
        const se = h0.handles.find((p) => p.kind === "se");
        const hit = { ...se, center: h0.center, bounds: h0.bounds };
        const k = scaleFromDrag(hit, { x: se.x, y: se.y }, { x: se.x + 60, y: se.y + 60 });
        push("dragging a corner outward grows k", k > 1.1);
        const patch = resizePatch(x(), p0, sticker, "se", k);
        push("resize writes sizeFrac scaled by k", !!patch && Math.abs(patch.sizeFrac / (sticker.sizeFrac || 0.05) - k) < 0.02);
        const b0 = layerBounds(x(), p0, sticker);
        const p1 = mk(BASE_PATCHES.map((p) => (p.id === "sticker-1" ? { ...p, ...patch } : p)));
        const b1 = layerBounds(x(), p1, p1.layers.find((l) => l.id === "sticker-1"));
        push("the opposite corner holds under resize", Math.abs(b1.x - b0.x) < 3 && Math.abs(b1.y - b0.y) < 3);

        // Per-photo slow-zoom override reaches the pixels.
        push("per-photo slow-zoom override changes pixels",
            differs(snap(mk([...BASE_PATCHES, { id: "photo-1", kb: false }]), 1.5), snap(mk(BASE_PATCHES), 1.5)));

        // A split caption line's own lead-in types earlier than the global one.
        const seg = { id: "cl-1", type: "caption", text: "Hello there world", timing: { start: 1, end: 4 } };
        push("caption leadIn override types earlier",
            differs(snap(mk([...BASE_PATCHES, { ...seg, leadIn: 0.1 }]), 1.45), snap(mk([...BASE_PATCHES, seg]), 1.45)));

        // Reveal 'all' lands whole while 'type' is still mid-word.
        push("reveal method changes what is on screen",
            differs(snap(mk([...BASE_PATCHES, { ...seg, leadIn: 0.1, reveal: "all" }]), 1.6), snap(mk([...BASE_PATCHES, { ...seg, leadIn: 0.1 }]), 1.6)));

        window.__GEO = { done: true, pass: results.every((r) => r.ok), results };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    // ── the keyframe probe (v4-M2): lerp, retime invariance, keyed opacity ──
    useEffect(() => {
        if (!plan || window.__KEYS) return;
        const c = document.createElement("canvas");
        const x = () => c.getContext("2d", { willReadFrequently: true });
        const mk = (patches) => buildPlan({ canvas: c, ...buildArgs(patches) });
        const results = [];
        const push = (label, ok) => results.push({ label, ok });

        // The SALE pill paints in the theme accent; its horizontal centroid in
        // the top band of the frame IS the layer's keyed fx, measured.
        const accentStats = (p, t) => {
            paintFrame(x(), p, t);
            const d = x().getImageData(0, 0, c.width, Math.floor(c.height * 0.3)).data;
            let n = 0;
            let sx = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (Math.abs(d[i] - 255) <= 2 && Math.abs(d[i + 1] - 193) <= 2 && Math.abs(d[i + 2] - 7) <= 2) {
                    n++;
                    sx += (i / 4) % c.width;
                }
            }
            return { n, cx: n ? sx / n : -1 };
        };

        // The QR panel sits top-right ABOVE the sticker — at fx 0.8 the keyed
        // pill would fly under it and vanish from the scan, so the keyed
        // variants hide the QR. (The first probe run caught exactly that.)
        const stickerKeyed = (timing) => BASE_PATCHES.map((p) => (p.id === "sticker-1"
            ? {
                ...p, timing,
                enter: { kind: "none", seconds: 0 }, exit: { kind: "none", seconds: 0 },
                keys: { fx: [{ t: 0, v: 0.2 }, { t: 2, v: 0.8 }] },
            }
            : p.id === "qr-1" ? { ...p, visible: false } : p));

        const pk = mk(stickerKeyed({ start: 1, end: 5 }));
        const s0 = accentStats(pk, 1.0); // local 0 → fx 0.2
        const sMid = accentStats(pk, 2.0); // local 1 → fx 0.5
        const s1 = accentStats(pk, 3.0); // local 2 → fx 0.8
        push("keyed layer paints at every instant", s0.n > 50 && sMid.n > 50 && s1.n > 50);
        push("position lerps along the window",
            Math.abs(s0.cx - 0.2 * c.width) < 30
            && Math.abs(sMid.cx - 0.5 * c.width) < 30
            && Math.abs(s1.cx - 0.8 * c.width) < 30);

        // Key times are LOCAL: moving the bar moves the whole motion.
        const pk2 = mk(stickerKeyed({ start: 2, end: 6 }));
        const r = accentStats(pk2, 3.0); // the same LOCAL instant as sMid
        push("retiming the bar carries the motion", Math.abs(r.cx - sMid.cx) < 2);

        // Keyed opacity owns the interior (the envelope only owns the edges).
        const pf = mk(BASE_PATCHES.map((p) => (p.id === "sticker-1"
            ? {
                ...p,
                enter: { kind: "none", seconds: 0 }, exit: { kind: "none", seconds: 0 },
                keys: { opacity: [{ t: 1, v: 1 }, { t: 3.5, v: 0 }] },
            }
            : p)));
        const early = accentStats(pf, 1.5); // local 0.5 → holds at 1
        const late = accentStats(pf, 4.4); // local 3.4 → α ≈ 0.04
        push("keyed opacity fades the interior", early.n > 50 && late.n < early.n / 5);

        window.__KEYS = { done: true, pass: results.every((res) => res.ok), results };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    // ── extra lanes (the music bed): shown on the timeline, absent from the
    //    plan. A DOM probe, because "display only" is a property of what the
    //    lane OFFERS — a trim handle on it would write timing nothing reads.
    useEffect(() => {
        if (!plan || window.__LANES) return;
        const results = [];
        const push = (label, ok) => results.push({ label, ok });
        const lane = (id) => document.querySelector(`[data-lane-id="${id}"]`);
        const all = [...document.querySelectorAll("[data-lane-id]")];

        push("the bed lane is on the timeline", !!lane("music-bed"));
        push("it did NOT become a plan layer", !plan.layers.some((l) => l.id === "music-bed"));
        push("every other lane is a plan layer",
            all.filter((el) => el.dataset.laneId !== "music-bed").length === plan.layers.length);
        push("the bed lane offers no trim handles",
            !!lane("music-bed") && lane("music-bed").querySelectorAll("[data-trim]").length === 0);
        push("a real lane still offers both trim handles",
            !!lane("sound-1") && lane("sound-1").querySelectorAll("[data-trim]").length === 2);
        push("the bed lane cannot be hidden, duplicated or deleted",
            !!lane("music-bed") && lane("music-bed").querySelectorAll("button").length === 0);

        window.__LANES = { done: true, pass: results.every((r) => r.ok), results };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    // ── the crop probe: which part of the picture draws ─────
    // The fixture logo is a yellow disc on its LEFT half and white text on the
    // right, so "how much yellow reached the frame" answers "which part of the
    // source did this layer use" without any tolerance games.
    useEffect(() => {
        if (!plan || window.__CROP) return;
        const c = document.createElement("canvas");
        const x = () => c.getContext("2d", { willReadFrequently: true });
        const mk = (patches) => buildPlan({ canvas: c, ...buildArgs(patches) });
        const results = [];
        const push = (label, ok) => results.push({ label, ok });

        // The accent pill and the compiled logo are the same yellow — hide both
        // so the count belongs to the probe layer alone.
        const quiet = BASE_PATCHES.map((p) => (p.id === "sticker-1" ? { ...p, visible: false } : p))
            .concat({ id: "logo", visible: false });
        const mkImg = (extra) => mk([...quiet, {
            id: "crop-1", type: "image", src: "logo", fx: 0.5, fy: 0.5, fw: 0.7, timing: null, ...extra,
        }]);
        const yellow = (p, t) => {
            paintFrame(x(), p, t);
            const d = x().getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (Math.abs(d[i] - 255) <= 6 && Math.abs(d[i + 1] - 193) <= 6 && Math.abs(d[i + 2] - 7) <= 6) n++;
            }
            return n;
        };

        const whole = yellow(mkImg({}), 3);
        const left = yellow(mkImg({ crop: { x: 0, y: 0, w: 0.5, h: 1 } }), 3);
        const right = yellow(mkImg({ crop: { x: 0.5, y: 0, w: 0.5, h: 1 } }), 3);
        push("the uncropped layer draws the disc", whole > 200);
        push("cropping to the left half keeps the disc, larger", left > whole);
        push("cropping to the right half loses it", right < whole / 10);

        // A crop changes the drawn SHAPE too: half the width at the same box
        // width is twice as tall. Compile-time geometry has to know that.
        const pWhole = mkImg({});
        const pHalf = mkImg({ crop: { x: 0, y: 0, w: 0.5, h: 1 } });
        const hOf = (p) => p.layers.find((l) => l.id === "crop-1")?.h || 0;
        push("a half-width crop doubles the drawn height",
            Math.abs(hOf(pHalf) / Math.max(1, hOf(pWhole)) - 2) < 0.02);

        // Zoom + pan pick a region without a crop being set at all.
        const zoomLeft = yellow(mkImg({ zoom: 2, panX: 0, panY: 0.5 }), 3);
        const zoomRight = yellow(mkImg({ zoom: 2, panX: 1, panY: 0.5 }), 3);
        push("zoomed and panned left, the disc fills more", zoomLeft > whole);
        push("zoomed and panned right, the disc is gone", zoomRight < whole / 10);

        // Keyed, the same pair IS a push-in: at each end it matches the static
        // frame it should, which is what makes an animated zoom trustworthy.
        // Sampled at the SAME instants as their static references: the photos
        // behind are still crossfading, so comparing t=2 with t=3 would be
        // measuring the background, not the zoom.
        const keyed = mkImg({ keys: { zoom: [{ t: 0, v: 1 }, { t: 2, v: 2 }], panX: [{ t: 0, v: 0 }, { t: 2, v: 0 }] } });
        push("a keyed push-in starts where zoom 1 does",
            Math.abs(yellow(keyed, 0) - yellow(mkImg({ panX: 0 }), 0)) <= 2);
        push("and ends where zoom 2 does",
            Math.abs(yellow(keyed, 2) - yellow(mkImg({ zoom: 2, panX: 0 }), 2)) <= 2);

        // D2: the blurred backdrop is built from the picture, so it has to
        // follow the crop too — otherwise a cropped photo floats on a blur of
        // the part you cut away. The frame's extreme corner is backdrop only
        // (the contained photo sits inside stageRect), so it isolates it.
        const corner = (p, t) => {
            paintFrame(x(), p, t);
            return x().getImageData(0, 0, 48, 48).data;
        };
        const cornerDiff = (a, b) => {
            let n = 0;
            for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) n++;
            return n;
        };
        const photoPlain = mk(BASE_PATCHES);
        const photoCropped = mk([...BASE_PATCHES, { id: "photo-1", crop: { x: 0.55, y: 0.55, w: 0.45, h: 0.45 } }]);
        push("cropping a photo changes its blurred backdrop",
            cornerDiff(corner(photoPlain, 1), corner(photoCropped, 1)) > 200);
        push("an uncropped photo's backdrop is untouched",
            cornerDiff(corner(photoPlain, 1), corner(mk([...BASE_PATCHES, { id: "photo-1" }]), 1)) === 0);

        window.__CROP = { done: true, pass: results.every((r) => r.ok), results };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    // ── the caption-look probe (D1) ─────────────────────────
    // A caption may carry its own colour, size, position and style. Two things
    // have to hold: the fields must reach the pixels, and a caption that sets
    // NOTHING must paint exactly what it painted before the fields existed —
    // which is the whole reason they resolve through the video's options.
    useEffect(() => {
        if (!plan || window.__CAPLOOK) return;
        const c = document.createElement("canvas");
        const x = () => c.getContext("2d", { willReadFrequently: true });
        const mk = (patches) => buildPlan({ canvas: c, ...buildArgs(patches) });
        const results = [];
        const push = (label, ok) => results.push({ label, ok });

        // Only the caption under test may differ between frames.
        const quiet = BASE_PATCHES.map((p) => (p.id === "sticker-1" ? { ...p, visible: false } : p))
            .concat({ id: "logo", visible: false }, { id: "qr-1", visible: false });
        const cap = (extra) => mk(quiet.map((p) => (p.id === "caption-again-1" ? { ...p, ...extra } : p)));
        const T = 8; // inside caption-again-1's 6→10s window
        const snap = (p) => { paintFrame(x(), p, T); return x().getImageData(0, 0, c.width, c.height).data; };
        const diff = (a, b) => {
            let n = 0;
            let sy = 0;
            for (let i = 0; i < a.length; i += 4) {
                if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
                    n++;
                    sy += Math.floor(i / 4 / c.width);
                }
            }
            return { n, cy: n ? sy / n : -1 };
        };
        const accent = (d) => {
            let n = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (Math.abs(d[i] - 255) <= 6 && Math.abs(d[i + 1] - 193) <= 6 && Math.abs(d[i + 2] - 7) <= 6) n++;
            }
            return n;
        };

        const plain = snap(cap({}));

        // Unset fields, written explicitly as null, must change nothing.
        push("null look fields paint the same caption",
            diff(plain, snap(cap({ color: null, sizeScale: null, position: null, style: null }))).n === 0);
        // And setting them to what the video already says must also change
        // nothing — the fallback and the explicit path have to agree.
        push("stating the video's own values changes nothing",
            diff(plain, snap(cap({ sizeScale: 1, position: "bottom", style: "box" }))).n === 0);

        push("a caption can take the accent colour",
            accent(snap(cap({ color: "accent" }))) > accent(plain) + 200);

        const bigger = diff(plain, snap(cap({ sizeScale: 1.6 })));
        push("its own size reaches the pixels", bigger.n > 500);

        // Where the caption's OWN ink sits, isolated by differencing against a
        // frame with it hidden. Comparing the two positions to each other
        // instead would centroid the union of both, which sits between them
        // and says nothing about either.
        const hidden = snap(cap({ visible: false }));
        const inkCy = (extra) => diff(snap(cap(extra)), hidden).cy;
        const atBottom = inkCy({});
        const atMiddle = inkCy({ position: "middle" });
        push("its own position moves it up the frame",
            atMiddle > 0 && atBottom > 0 && atMiddle < atBottom - c.height * 0.15);

        push("its own style drops the panel", diff(plain, snap(cap({ style: "bare" }))).n > 500);

        window.__CAPLOOK = { done: true, pass: results.every((r) => r.ok), results };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    // ── the polish pack (D3) ────────────────────────────────
    // Two new envelope kinds, a new caption reveal, and the beat helpers —
    // the last against a synthesised click track, which is why they are pure
    // functions in lib/beats.js rather than buried in the page.
    useEffect(() => {
        if (!plan || window.__POLISH) return;
        const c = document.createElement("canvas");
        const x = () => c.getContext("2d", { willReadFrequently: true });
        const mk = (patches) => buildPlan({ canvas: c, ...buildArgs(patches) });
        const results = [];
        const push = (label, ok) => results.push({ label, ok });
        const snap = (p, t) => { paintFrame(x(), p, t); return new Uint32Array(x().getImageData(0, 0, c.width, c.height).data.buffer.slice(0)); };
        const differs = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true; return false; };
        // How much of the frame a layer is responsible for, by differencing
        // against the same frame with it hidden. A brightness threshold would
        // miss karaoke's dim look-ahead text, which is the thing being counted.
        const inkOf = (patches, id, t) => {
            const on = snap(mk(patches), t);
            const off = snap(mk(patches.map((p) => (p.id === id ? { ...p, visible: false } : p))), t);
            let n = 0;
            for (let i = 0; i < on.length; i++) if (on[i] !== off[i]) n++;
            return n;
        };

        // A wipe uncovers across the layer, so mid-ramp is neither absent nor
        // whole — and it is NOT a fade, so the pixels it does show are full
        // strength (a fade at the same instant differs).
        const withEnter = (kind) => BASE_PATCHES.map((p) => (p.id === "sticker-1"
            ? { ...p, timing: { start: 2, end: 6 }, enter: { kind, seconds: 1 }, exit: { kind: "none", seconds: 0 } } : p));
        const cut = mk(withEnter("none"));
        const wiped = mk(withEnter("wipe"));
        push("a wipe is partway through mid-ramp", differs(snap(wiped, 2.5), snap(cut, 2.5)));
        push("a wipe has finished by the end of its ramp", !differs(snap(wiped, 3.05), snap(cut, 3.05)));
        push("a wipe is not a fade", differs(snap(wiped, 2.5), snap(mk(withEnter("fade")), 2.5)));

        const blurred = mk(withEnter("blur-through"));
        push("blur-through softens mid-ramp", differs(snap(blurred, 2.4), snap(cut, 2.4)));
        push("blur-through resolves by the end of its ramp", !differs(snap(blurred, 3.05), snap(cut, 3.05)));

        // Karaoke shows the whole line from the start, so early on it has far
        // more ink than a typewriter at the same instant.
        const reveal = (kind) => BASE_PATCHES.map((p) => (p.id === "caption-again-1" ? { ...p, reveal: kind } : p));
        push("karaoke shows the line ahead of the reading",
            inkOf(reveal("karaoke"), "caption-again-1", 6.3)
            > inkOf(reveal("type"), "caption-again-1", 6.3) * 1.5);

        // The beat helpers, against a click track at a REAL sample rate: the
        // hop is 512 samples, so 8kHz would test a 64ms grid the detector
        // never sees in practice, and would prove nothing about its accuracy.
        const sr = 44100;
        const clicks = new Float32Array(sr * 6);
        for (let k = 1; k < 12; k++) {
            const at = Math.round(k * 0.5 * sr);
            const len = Math.round(sr * 0.0375);
            for (let i = 0; i < len && at + i < clicks.length; i++) {
                clicks[at + i] = Math.sin((i / sr) * 2 * Math.PI * 900) * Math.exp(-i / (sr * 0.0275));
            }
        }
        const found = onsetTimes(clicks, sr);
        push(`onsets found in a click track (${found.length})`, found.length >= 9 && found.length <= 13);
        // Within 50ms of the grid: closer than a frame at 30fps, which is what
        // "on the beat" has to mean for a cut.
        push("onsets land on the clicks",
            found.every((t) => Math.abs(t - Math.round(t * 2) / 2) < 0.05));

        const edges = edgesFromLengths([3, 3, 3]);
        const snapped = snapEdges(edges, [2.6, 6.4], { tolerance: 0.8, minSlot: 1 });
        push("edges move to the nearby beats", snapped.moved === 2
            && Math.abs(snapped.edges[1] - 2.6) < 0.01 && Math.abs(snapped.edges[2] - 6.4) < 0.01);
        push("an edge with no beat near it stays put",
            snapEdges(edges, [7.9], { tolerance: 0.5, minSlot: 1 }).edges[1] === 3);
        push("the ends never move", snapped.edges[0] === 0 && snapped.edges[3] === 9);
        push("lengths round-trip through edges",
            lengthsFromEdges(edgesFromLengths([2, 3.5, 1.25])).join() === "2,3.5,1.25");

        window.__POLISH = { done: true, pass: results.every((r) => r.ok), results };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    // ── the storyboard draft (D5) ───────────────────────────
    // Its rules ARE the deliverable: inside the video, out of the platform's
    // UI bands, nothing invented from data that isn't there, and safe to press
    // twice. All four are checkable without a post or a product.
    useEffect(() => {
        if (!plan || window.__STORY) return;
        const results = [];
        const push = (label, ok) => results.push({ label, ok });
        const D = 12;
        const full = draftStoryboard({
            duration: D,
            context: { price: "Rs 4,500", discount: "25%", url: "https://rutba.pk/s/abc" },
            captionSegments: ["First line.", "Second line.", "Third line."],
            hasTitle: true,
            options: {},
        });

        push("it drafts something from a full product", full.patches.length >= 5);
        push("every added layer is inside the video",
            full.patches.every((p) => !p.timing || (p.timing.start >= 0 && p.timing.end <= D && p.timing.end > p.timing.start)));
        push("nothing is placed under the platform's UI",
            full.patches.filter((p) => p.fx != null).every((p) =>
                p.fx >= SAFE.left && p.fx <= SAFE.right && p.fy >= SAFE.top && p.fy <= SAFE.bottom));
        push("the hook comes before the price",
            full.patches.find((p) => p.id === `${SB_PREFIX}discount`).timing.start
            < full.patches.find((p) => p.id === `${SB_PREFIX}price`).timing.start);
        push("the QR waits for the last third",
            full.patches.find((p) => p.id === `${SB_PREFIX}qr`).timing.start >= D * 0.6);
        push("it fills an empty end card", full.options.outroSeconds > 0);

        // Nothing invented: no product, no commerce layers.
        const bare = draftStoryboard({ duration: D, context: {}, captionSegments: [], options: {} });
        push("with no product it adds no commerce layers",
            bare.patches.every((p) => !String(p.id).startsWith(SB_PREFIX)));

        // Never overwrites a decision the operator already made.
        const withOutro = draftStoryboard({
            duration: D, context: { url: "https://rutba.pk/s/abc" }, options: { outroSeconds: 4, showTitle: false }, hasTitle: false,
        });
        push("an end card already set is left alone", withOutro.options.outroSeconds === undefined);

        // Safe to press twice: the second draft replaces the first's set.
        const once = [...withoutDraft([]), ...full.patches];
        const twice = [...withoutDraft(once).filter((p) => !full.patches.some((n) => n.id === p.id)), ...full.patches];
        const ids = (l) => l.map((p) => p.id).sort().join();
        push("drafting twice replaces rather than stacks", ids(once) === ids(twice));

        window.__STORY = { done: true, pass: results.every((r) => r.ok), results };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    // ── the rail's rows, mounted for real ───────────────────
    // The studio page needs a session; these components do not, because they
    // take props and nothing else. What they WRITE is the contract worth
    // holding: Pace must not flatten an entry kind into a fade, and Look must
    // write null rather than a defaults-shaped object.
    useEffect(() => {
        if (!plan || window.__ROWS) return;
        const results = [];
        const push = (label, ok) => results.push({ label, ok });
        const writes = [];
        const catcher = (p) => writes.push(p);

        // Mounted for real, further down the page: if either threw, these are
        // missing and every check below is moot.
        push("Pace mounts in the DOM", !!document.querySelector('[data-rows-probe="pace"] input[type=range]'));
        push("Look mounts in the DOM", !!document.querySelector('[data-rows-probe="look"] input[type=range]'));

        // Then drive the callbacks: same components, asked what they WRITE.
        const slid = { id: "x", type: "photo", timing: { start: 1, end: 4 }, enter: { kind: "slide-left", seconds: 0.4 }, exit: { kind: "none", seconds: 0 } };
        const paceWrites = [];
        const Pace = TimingRows({ layer: slid, duration: 10, busy: false, onPatch: (p) => paceWrites.push(p) });
        const findRamp = (node, label) => {
            const walk = (n) => {
                if (!n || typeof n !== "object") return null;
                if (n.props?.label === label) return n;
                const kids = n.props?.children;
                for (const k of (Array.isArray(kids) ? kids : [kids])) { const hit = walk(k); if (hit) return hit; }
                return null;
            };
            return walk(node);
        };
        const fadeIn = findRamp(Pace, "Fade in");
        push("Pace offers a fade-in row", !!fadeIn);
        if (fadeIn) {
            fadeIn.props.onChange(1.2);
            const w = paceWrites[paceWrites.length - 1];
            push("changing the seconds keeps the entry KIND", w?.enter?.kind === "slide-left" && w.enter.seconds === 1.2);
        }
        const noRamp = findRamp(TimingRows({ layer: { id: "y", type: "text", timing: null, enter: { kind: "none", seconds: 0 } }, duration: 10, busy: false, onPatch: catcher }), "Fade in");
        noRamp?.props.onChange(0.5);
        push("a layer with no ramp gets a fade", writes.some((w) => w.enter?.kind === "fade" && w.enter.seconds === 0.5));

        const lookWrites = [];
        const Look = LookRows({ layer: { id: "z", type: "image", opacity: 1 }, busy: false, onPatch: (p) => lookWrites.push(p), withFilters: true });
        const bright = findRamp(Look, "Brightness");
        push("Look offers a brightness row", !!bright);
        if (bright) {
            bright.props.onChange(1.3);
            push("a changed filter writes an object", !!lookWrites[lookWrites.length - 1]?.filter?.brightness);
            bright.props.onChange(1);
            push("back at the default it writes null, not {}", lookWrites[lookWrites.length - 1]?.filter === null);
        }

        window.__ROWS = { done: true, pass: results.every((r) => r.ok), results };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    // ── the track picker at library scale ───────────────────
    // 114 tracks, one shared tag, 114 one-off filename tags. The picker must
    // stay a small control: a page of rows, and only the tags worth offering.
    useEffect(() => {
        if (!plan || window.__PICKER) return;
        const results = [];
        const push = (label, ok) => results.push({ label, ok });
        const root = document.querySelector('[data-rows-probe="tracks"]');
        const rows = () => (root ? [...root.querySelectorAll(".list-group-item")] : []);
        const chips = () => (root ? [...root.querySelectorAll("button")].filter((b) => /^\w[\w\s-]*\s\d+$/.test(b.textContent.trim())) : []);
        const names = () => rows().map((r) => r.textContent.trim());

        push("the picker mounted", !!root && rows().length > 0);
        push("one page of rows, not the whole library", rows().length === 5);
        push("the one-off filename tags are not chips", chips().length <= 8);
        push("the shared tag is offered", chips().some((b) => b.textContent.includes("quran")));
        push("the count says how much is hidden", /114/.test(root?.textContent || ""));

        const first = names()[0];
        const next = [...(root?.querySelectorAll("button") || [])]
            .find((b) => b.querySelector(".fa-chevron-right"));
        push("there is a next page", !!next);
        next?.click();
        window.__PICKER_STEP = { first, after: null };
        setTimeout(() => {
            const after = names()[0];
            push("next shows different tracks", !!after && after !== first);
            window.__PICKER = { done: true, pass: results.every((r) => r.ok), results };
        }, 60);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    return (
        <div className="container-fluid py-3" style={{ maxWidth: 1100 }}>
            <h5>Timeline fixture <small className="text-muted">— dev only, no auth, no network</small></h5>
            <div className="bg-dark rounded d-flex justify-content-center mb-2">
                <canvas ref={canvasRef} style={{ maxWidth: "100%", maxHeight: "46vh", display: "block" }} />
            </div>
            {plan && (
                <div className="d-flex align-items-center gap-2 mb-1">
                    <input type="range" className="form-range flex-grow-1" min={0} max={plan.duration} step={0.05}
                        value={Math.min(previewTime, plan.duration)} onChange={(e) => setPreviewTime(Number(e.target.value))} />
                    <small className="text-muted" style={{ minWidth: 90, textAlign: "right" }}>
                        {previewTime.toFixed(2)}s / {plan.duration.toFixed(2)}s
                    </small>
                </div>
            )}
            <VideoTimeline
                plan={plan}
                previewTime={previewTime}
                busy={false}
                selectedLayerId={selectedLayerId}
                appendedIds={appendedIds}
                extraLanes={EXTRA_LANES}
                onSelect={setSelectedLayerId}
                onScrub={setPreviewTime}
                onPatch={upsertPatch}
                onRemove={(id) => { removePatchLayer(id); if (selectedLayerId === id) setSelectedLayerId(null); }}
                onDuplicate={duplicateLayer}
            />
            {/* The rail's rows, mounted so the probe above can prove they render
                as well as that their callbacks write the right thing. */}
            {plan && (
                <div className="row g-2 mt-2" style={{ maxWidth: 700 }}>
                    <div className="col-6" data-rows-probe="pace">
                        <TimingRows layer={plan.layers.find((l) => l.id === "sound-1") || plan.layers[0]}
                            duration={plan.duration} busy={false} onPatch={upsertPatch} />
                    </div>
                    <div className="col-6" data-rows-probe="look">
                        <LookRows layer={plan.layers.find((l) => l.id === "sticker-1") || plan.layers[0]}
                            busy={false} onPatch={(p) => upsertPatch({ id: "sticker-1", ...p })} />
                    </div>
                    <div className="col-6" data-rows-probe="tracks">
                        <TrackBrowser tracks={FIXTURE_TRACKS} busy={false} pageSize={5}
                            onPick={() => {}} onAdd={() => {}} onAudition={() => {}} />
                    </div>
                </div>
            )}
            <div className="mt-3">
                <h6>Retime probe {probe ? (probe.pass ? <span className="text-success">PASS</span> : <span className="text-danger">FAIL</span>) : <span className="text-muted">running…</span>}</h6>
                {probe && (
                    <ul className="small mb-0" style={{ columns: 2 }}>
                        {probe.results.map((r) => (
                            <li key={r.label} className={r.ok ? "text-success" : "text-danger fw-bold"}>{r.ok ? "ok" : "FAIL"} — {r.label}</li>
                        ))}
                    </ul>
                )}
            </div>
            <pre className="small text-muted mt-3 mb-0">
                Current patches:{"\n"}{JSON.stringify(layerPatches, null, 1)}
            </pre>
        </div>
    );
}
