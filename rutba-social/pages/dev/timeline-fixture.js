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

        window.__GEO = { done: true, pass: results.every((r) => r.ok), results };
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
                onSelect={setSelectedLayerId}
                onScrub={setPreviewTime}
                onPatch={upsertPatch}
                onRemove={(id) => { removePatchLayer(id); if (selectedLayerId === id) setSelectedLayerId(null); }}
                onDuplicate={duplicateLayer}
            />
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
