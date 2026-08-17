/**
 * AudioEditorDialog — trim and tidy one track, then hand the result back as a
 * File. The host owns what happens next (a new library row, or replacing the
 * one being edited); this component knows nothing about either.
 *
 * The edit is arithmetic over the decoded buffer, not a graph rendered offline
 * (see lib/audio-edit.js), which is what lets the preview be the same call that
 * writes the file — what you hear is exactly what gets uploaded, every time.
 *
 * The waveform is the control surface. Dragging inside it moves the in and out
 * points; everything else is a number you can also type, because "start at 12.4
 * seconds" is a thing people know and should not have to find by eye.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    decodeBlob, editBuffer, editContext, encodeWav, peaksOf,
} from "../lib/audio-edit";
import { fetchMediaBytes, fmtBytes, fmtPrecise, safeStem } from "../lib/media-encode";

// Enough detail for a strip a few hundred pixels wide, and cheap enough that
// repainting it under a moving playhead costs nothing.
const BINS = 400;
const HANDLE_PX = 9;

export default function AudioEditorDialog({
    show = false,
    name = "",                 // the track's current name, seeds the file name
    src,                       // url to fetch and decode
    fetchMedia,                // (url) => Promise<Blob> — the app's media transport
    allowReplace = false,      // offer "replace this track" as well as "save a copy"
    onClose,
    onSave,                    // (file, meta) => void | Promise<void>
    zIndex = 10600,
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [buffer, setBuffer] = useState(null);
    const [peaks, setPeaks] = useState(null);

    const [range, setRange] = useState({ start: 0, end: 0 });
    const [fadeIn, setFadeIn] = useState(0);
    const [fadeOut, setFadeOut] = useState(0);
    const [gain, setGain] = useState(1);
    const [normalize, setNormalize] = useState(false);
    const [mono, setMono] = useState(false);

    const [playing, setPlaying] = useState(false);
    const [head, setHead] = useState(0);       // playhead, in SOURCE seconds
    const [outName, setOutName] = useState("");
    const [mode, setMode] = useState("copy");  // copy | replace
    const [saving, setSaving] = useState(false);

    const canvasRef = useRef(null);
    const dragRef = useRef(null);              // 'start' | 'end' | 'new'
    const srcNodeRef = useRef(null);
    const rafRef = useRef(0);
    const playFromRef = useRef({ at: 0, from: 0 });

    // ── load ────────────────────────────────────────────────
    useEffect(() => {
        if (!show || !src) return undefined;
        let dead = false;
        setLoading(true);
        setError(null);
        setBuffer(null);
        setPeaks(null);
        (async () => {
            try {
                const blob = await fetchMediaBytes(src, fetchMedia);
                const buf = await decodeBlob(blob);
                if (dead) return;
                setBuffer(buf);
                setPeaks(peaksOf(buf, BINS));
                setRange({ start: 0, end: buf.duration });
                setHead(0);
            } catch (err) {
                if (dead) return;
                console.error("Failed to decode for editing", err);
                setError(
                    "Could not decode that track for editing. A foreign URL has to be reachable through the media proxy, "
                    + "and the browser has to understand its format.",
                );
            } finally {
                if (!dead) setLoading(false);
            }
        })();
        return () => { dead = true; };
    }, [show, src, fetchMedia]);

    useEffect(() => {
        if (show) { setOutName(`${name || "track"} (edit)`); setMode("copy"); }
    }, [show, name]);

    // ── preview ─────────────────────────────────────────────
    const stop = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        const n = srcNodeRef.current;
        srcNodeRef.current = null;
        if (n) { try { n.onended = null; n.stop(); } catch { /* already finished */ } }
        setPlaying(false);
    }, []);

    useEffect(() => () => stop(), [stop]);
    useEffect(() => { if (!show) stop(); }, [show, stop]);

    // The edited buffer, rebuilt whenever any control moves. Cheap enough to do
    // eagerly — it is a few array passes — and it means Play and Save can never
    // disagree about what the edit is.
    const edited = useMemo(() => {
        if (!buffer) return null;
        try {
            return editBuffer(buffer, {
                start: range.start, end: range.end, fadeIn, fadeOut, gain, normalize, mono,
            });
        } catch (err) {
            console.error("Failed to apply the edit", err);
            return null;
        }
    }, [buffer, range.start, range.end, fadeIn, fadeOut, gain, normalize, mono]);

    const play = () => {
        if (!edited) return;
        stop();
        const ctx = editContext();
        if (!ctx) return;
        if (ctx.state === "suspended") ctx.resume().catch(() => { /* a gesture already happened */ });
        const node = ctx.createBufferSource();
        node.buffer = edited;
        node.connect(ctx.destination);
        node.onended = () => { if (srcNodeRef.current === node) stop(); };
        node.start();
        srcNodeRef.current = node;
        playFromRef.current = { at: ctx.currentTime, from: range.start };
        setPlaying(true);
        const step = () => {
            const { at, from } = playFromRef.current;
            setHead(from + (ctx.currentTime - at));
            rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
    };

    // ── waveform ────────────────────────────────────────────
    const paint = useCallback(() => {
        const c = canvasRef.current;
        if (!c || !peaks || !buffer) return;
        const W = c.clientWidth || 640;
        const H = 96;
        if (c.width !== W) c.width = W;
        if (c.height !== H) c.height = H;
        const ctx = c.getContext("2d");
        const x = (t) => (buffer.duration > 0 ? (t / buffer.duration) * W : 0);

        ctx.fillStyle = "#f8f9fa";
        ctx.fillRect(0, 0, W, H);
        const x0 = x(range.start);
        const x1 = x(range.end);
        // outside the selection is what the edit throws away — shade it
        ctx.fillStyle = "#e9ecef";
        ctx.fillRect(0, 0, x0, H);
        ctx.fillRect(x1, 0, W - x1, H);

        const bw = W / peaks.length;
        for (let i = 0; i < peaks.length; i++) {
            const px = i * bw;
            const h = Math.max(2, peaks[i] * (H - 10));
            ctx.fillStyle = px >= x0 && px <= x1 ? "#0d6efd" : "#adb5bd";
            ctx.fillRect(px, (H - h) / 2, Math.max(1, bw - 0.5), h);
        }

        // fades, drawn as the ramps they are
        ctx.fillStyle = "rgba(13,110,253,0.18)";
        if (fadeIn > 0) {
            const w = Math.min(x1 - x0, x(fadeIn) - x(0));
            ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + w, 0); ctx.lineTo(x0, H); ctx.fill();
        }
        if (fadeOut > 0) {
            const w = Math.min(x1 - x0, x(fadeOut) - x(0));
            ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1 - w, 0); ctx.lineTo(x1, H); ctx.fill();
        }

        for (const [px, colour] of [[x0, "#198754"], [x1, "#dc3545"]]) {
            ctx.fillStyle = colour;
            ctx.fillRect(px - 1, 0, 2, H);
            ctx.fillRect(px - HANDLE_PX / 2, 0, HANDLE_PX, 10);
        }
        if (playing && head >= range.start && head <= range.end) {
            ctx.fillStyle = "#212529";
            ctx.fillRect(x(head), 0, 1, H);
        }
    }, [peaks, buffer, range.start, range.end, fadeIn, fadeOut, playing, head]);

    useEffect(() => { paint(); }, [paint]);
    useEffect(() => {
        const on = () => paint();
        window.addEventListener("resize", on);
        return () => window.removeEventListener("resize", on);
    }, [paint]);

    const timeAt = (e) => {
        const c = canvasRef.current;
        if (!c || !buffer) return 0;
        const r = c.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        return Math.round(frac * buffer.duration * 100) / 100;
    };

    const onDown = (e) => {
        if (!buffer) return;
        const c = canvasRef.current;
        const r = c.getBoundingClientRect();
        const px = e.clientX - r.left;
        const at = (t) => (t / buffer.duration) * r.width;
        const t = timeAt(e);
        if (Math.abs(px - at(range.start)) <= HANDLE_PX) dragRef.current = "start";
        else if (Math.abs(px - at(range.end)) <= HANDLE_PX) dragRef.current = "end";
        else { dragRef.current = "new"; setRange({ start: t, end: t }); }
        onMove(e);
    };

    const onMove = (e) => {
        const d = dragRef.current;
        if (!d || !buffer) return;
        const t = timeAt(e);
        const r2 = (n) => Math.round(n * 100) / 100;
        setRange((r) => {
            if (d === "start") return { ...r, start: r2(Math.min(t, r.end - 0.05)) };
            if (d === "end") return { ...r, end: r2(Math.max(t, r.start + 0.05)) };
            // a fresh drag: whichever way it goes, the smaller value is the start
            return t < r.start
                ? { start: r2(t), end: r2(r.start) }
                : { start: r2(r.start), end: r2(Math.max(t, r.start + 0.05)) };
        });
    };

    // The drag has to survive leaving the canvas — a handle dragged to the very
    // start or end is dragged PAST the edge, and a mouseup out there must still
    // finish the gesture rather than leave it stuck to the pointer.
    useEffect(() => {
        const move = (e) => { if (dragRef.current) onMove(e); };
        const up = () => { dragRef.current = null; };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        return () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buffer]);

    // ── save ────────────────────────────────────────────────
    const save = async () => {
        if (!edited) return;
        setSaving(true);
        setError(null);
        try {
            const blob = encodeWav(edited);
            const file = new File([blob], `${safeStem(outName, "track-edit")}.wav`, { type: "audio/wav" });
            await onSave?.(file, {
                seconds: edited.duration,
                replace: mode === "replace",
                trimmed: range.start > 0.01 || range.end < (buffer?.duration || 0) - 0.01,
            });
            onClose?.();
        } catch (err) {
            console.error("Failed to save the edit", err);
            setError(err?.response?.data?.error?.message || err?.message || "Could not save that edit.");
        } finally {
            setSaving(false);
        }
    };

    if (!show) return null;

    const len = Math.max(0, range.end - range.start);
    const estBytes = edited ? 44 + edited.length * (edited.numberOfChannels > 1 ? 2 : 1) * 2 : 0;
    const num = (v, set, step, min, max) => (
        <input type="number" className="form-control form-control-sm" value={v} step={step} min={min} max={max}
            disabled={!buffer || saving}
            onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) set(n); }} />
    );

    // No click-the-backdrop-to-close here, unlike the pickers: a drag that ends
    // outside the canvas lands its click on the backdrop, and losing an edit to
    // a stray mouseup is a bad trade for a shortcut.
    return (
        <div className="modal d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.55)", zIndex }}>
            <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                <div className="modal-content">
                    <div className="modal-header py-2">
                        <h6 className="modal-title mb-0 text-truncate">
                            <i className="fas fa-scissors me-2" />Edit “{name}”
                        </h6>
                        <button type="button" className="btn-close" onClick={() => onClose?.()} disabled={saving} />
                    </div>

                    <div className="modal-body py-2">
                        {loading && (
                            <div className="text-center py-4">
                                <span className="spinner-border spinner-border-sm me-2" />Fetching and decoding…
                            </div>
                        )}
                        {error && <div className="alert alert-danger py-2 small">{error}</div>}

                        {buffer && (
                            <>
                                <canvas ref={canvasRef} onMouseDown={onDown}
                                    style={{ width: "100%", height: 96, display: "block", cursor: "col-resize", borderRadius: 4 }} />
                                <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                                    <button className="btn btn-sm btn-outline-primary" onClick={playing ? stop : play} disabled={!edited || saving}>
                                        <i className={`fas ${playing ? "fa-stop" : "fa-play"} me-1`} />
                                        {playing ? "Stop" : "Play the edit"}
                                    </button>
                                    <button className="btn btn-sm btn-outline-secondary" disabled={saving}
                                        onClick={() => { stop(); setRange({ start: 0, end: buffer.duration }); }}>
                                        Whole track
                                    </button>
                                    <span className="text-muted small">
                                        Drag inside the wave to choose what to keep; the green and red bars are the in and out points.
                                    </span>
                                </div>

                                <div className="row g-2 mt-1">
                                    <div className="col-6 col-md-3">
                                        <label className="form-label small mb-1">In (seconds)</label>
                                        {num(Number(range.start.toFixed(2)), (n) => setRange((r) => ({ ...r, start: Math.min(Math.max(0, n), r.end - 0.05) })), 0.1, 0, buffer.duration)}
                                    </div>
                                    <div className="col-6 col-md-3">
                                        <label className="form-label small mb-1">Out (seconds)</label>
                                        {num(Number(range.end.toFixed(2)), (n) => setRange((r) => ({ ...r, end: Math.max(Math.min(buffer.duration, n), r.start + 0.05) })), 0.1, 0, buffer.duration)}
                                    </div>
                                    <div className="col-6 col-md-3">
                                        <label className="form-label small mb-1">Fade in (s)</label>
                                        {num(fadeIn, setFadeIn, 0.1, 0, 10)}
                                    </div>
                                    <div className="col-6 col-md-3">
                                        <label className="form-label small mb-1">Fade out (s)</label>
                                        {num(fadeOut, setFadeOut, 0.1, 0, 10)}
                                    </div>
                                </div>

                                <div className="d-flex flex-wrap align-items-center gap-3 mt-2">
                                    <div className="d-flex align-items-center gap-2" style={{ minWidth: 220 }}>
                                        <label className="form-label small mb-0" style={{ whiteSpace: "nowrap" }}>
                                            Volume ×{gain.toFixed(2)}
                                        </label>
                                        <input type="range" className="form-range" min={0.1} max={3} step={0.05} value={gain}
                                            disabled={normalize || saving} onChange={(e) => setGain(Number(e.target.value))} />
                                    </div>
                                    <div className="form-check form-switch mb-0">
                                        <input className="form-check-input" type="checkbox" id="ae-normalize" checked={normalize}
                                            disabled={saving} onChange={(e) => setNormalize(e.target.checked)} />
                                        <label className="form-check-label small" htmlFor="ae-normalize"
                                            title="Lift (or hold back) the whole take so its loudest moment sits just under full scale">
                                            Normalise
                                        </label>
                                    </div>
                                    <div className="form-check form-switch mb-0">
                                        <input className="form-check-input" type="checkbox" id="ae-mono" checked={mono}
                                            disabled={saving || buffer.numberOfChannels < 2} onChange={(e) => setMono(e.target.checked)} />
                                        <label className="form-check-label small" htmlFor="ae-mono"
                                            title={buffer.numberOfChannels < 2 ? "This track is already mono" : "Fold both channels into one — halves the file, and right for a voice"}>
                                            Mono
                                        </label>
                                    </div>
                                    <span className="badge bg-light text-dark border ms-auto">
                                        {fmtPrecise(len)} of {fmtPrecise(buffer.duration)} · ~{fmtBytes(estBytes)}
                                    </span>
                                </div>

                                <hr className="my-2" />

                                <div className="row g-2 align-items-end">
                                    <div className="col-md-7">
                                        <label className="form-label small mb-1">Save as</label>
                                        <input className="form-control form-control-sm" value={outName} disabled={saving}
                                            onChange={(e) => setOutName(e.target.value)} />
                                    </div>
                                    {allowReplace && (
                                        <div className="col-md-5">
                                            <select className="form-select form-select-sm" value={mode} disabled={saving}
                                                onChange={(e) => setMode(e.target.value)}>
                                                <option value="copy">Add as a new track</option>
                                                <option value="replace">Replace this track&apos;s audio</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                                {mode === "replace" && (
                                    <p className="text-muted small mb-0 mt-1">
                                        Everything already pointing at this track — a video recipe, the Poster&apos;s rotation — picks up
                                        the edit. The old file stays on the media server.
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    <div className="modal-footer py-2">
                        <span className="text-muted small me-auto">Saved as WAV — exact, and unambiguous everywhere.</span>
                        <button className="btn btn-sm btn-secondary" onClick={() => onClose?.()} disabled={saving}>Cancel</button>
                        <button className="btn btn-sm btn-primary" onClick={save} disabled={!edited || saving}>
                            {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="fas fa-check me-1" />}
                            {mode === "replace" ? "Replace" : "Save a copy"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
