import React, { useMemo, useRef, useState } from "react";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The inspector rail's reusable rows. Presentational and prop-only: no
 * closure over the studio, which is what lets pages/dev/timeline-fixture.js
 * mount them and probe their behaviour without a session.
 */


export function RangeRow({ label, value, min, max, step, suffix, disabled, onChange }) {
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
export function TrackBrowser({
    tracks, busy, pickedId, onPick, pickLabel = "Use", onAdd, previewingId, onAudition,
    maxHeight = 190, pageSize = 8,
}) {
    const [q, setQ] = useState("");
    const [tagsOn, setTagsOn] = useState([]);
    const [showAllTags, setShowAllTags] = useState(false);
    const [page, setPage] = useState(0);
    const norm = (s) => String(s || "").toLowerCase();

    // Tags are ranked by how many tracks carry them, not alphabetically, and
    // the one-offs are held back. A library imported from files tends to tag
    // every track with its own filename, so "every unique tag" is a wall of
    // chips that filter one row each — the useful ones are the shared ones.
    const tagCounts = useMemo(() => {
        const m = new Map();
        for (const t of tracks) {
            for (const x of (Array.isArray(t.tags) ? t.tags : [])) {
                const k = String(x);
                m.set(k, (m.get(k) || 0) + 1);
            }
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [tracks]);
    const sharedTags = useMemo(() => tagCounts.filter(([, n]) => n > 1), [tagCounts]);
    const chipTags = showAllTags ? tagCounts : sharedTags.slice(0, 8);
    const restTags = useMemo(
        () => tagCounts.filter(([k]) => !chipTags.some(([c]) => c === k)),
        [tagCounts, chipTags],
    );

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

    // Narrowing always lands you on the first page: staying on page 9 of a
    // result set that now has two pages shows an empty list and reads as a bug.
    const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
    const current = Math.min(page, pageCount - 1);
    const slice = shown.slice(current * pageSize, current * pageSize + pageSize);
    const narrow = (fn) => { fn(); setPage(0); };
    const toggleTag = (x) => narrow(() => setTagsOn((on) => (on.includes(x) ? on.filter((y) => y !== x) : [...on, x])));

    return (
        <>
            {(tracks.length > 5 || tagCounts.length > 0) && (
                <div className="input-group input-group-sm mb-1">
                    <input className="form-control" placeholder="Search tracks…" value={q}
                        onChange={(e) => narrow(() => setQ(e.target.value))} disabled={busy} />
                    {q && (
                        <button className="btn btn-outline-secondary" type="button" disabled={busy}
                            title="Clear the search" onClick={() => narrow(() => setQ(""))}>
                            <i className="fas fa-xmark" />
                        </button>
                    )}
                </div>
            )}
            {chipTags.length > 0 && (
                <div className="d-flex flex-wrap gap-1 mb-1 align-items-center">
                    {chipTags.map(([x, n]) => (
                        <button key={x} type="button" disabled={busy}
                            className={`btn btn-sm py-0 px-2 ${tagsOn.includes(x) ? "btn-primary" : "btn-outline-secondary"}`}
                            style={{ fontSize: 11 }} title={`${n} track${n === 1 ? "" : "s"}`}
                            onClick={() => toggleTag(x)}>{x} <span className="text-muted">{n}</span></button>
                    ))}
                    {restTags.length > 0 && (
                        <button type="button" className="btn btn-sm btn-link py-0 px-1" style={{ fontSize: 11 }}
                            title={showAllTags ? "Only the tags more than one track shares" : "Every tag in the library, including the one-offs"}
                            onClick={() => setShowAllTags((v) => !v)}>
                            {showAllTags ? "fewer tags" : `+${restTags.length} more`}
                        </button>
                    )}
                    {tagsOn.length > 0 && (
                        <button type="button" className="btn btn-sm btn-link py-0 px-1" style={{ fontSize: 11 }}
                            onClick={() => narrow(() => setTagsOn([]))}>clear</button>
                    )}
                </div>
            )}
            <div className="list-group list-group-flush" style={{ maxHeight, overflowY: "auto" }}>
                {shown.length === 0 && (
                    <div className="text-muted small py-2 px-2">No track matches — clear the search or the tags.</div>
                )}
                {slice.map((t) => {
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
                                {/* Only tags that MEAN something across the library — a row
                                    wearing its own filename as a badge is just noise. */}
                                {(Array.isArray(t.tags) ? t.tags : [])
                                    .filter((x) => sharedTags.some(([k]) => k === String(x)))
                                    .slice(0, 2)
                                    .map((x) => (
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
            {/* The count is always shown once a library outgrows one page: with
                a filter on, "8 of 114" is the only thing that says whether the
                track you want is behind a Next or behind a better search. */}
            {shown.length > 0 && (shown.length > pageSize || shown.length !== tracks.length) && (
                <div className="d-flex align-items-center gap-1 mt-1 mb-2">
                    <small className="text-muted flex-grow-1">
                        {shown.length === tracks.length
                            ? `${shown.length} tracks`
                            : `${shown.length} of ${tracks.length}`}
                        {pageCount > 1 ? ` · page ${current + 1}/${pageCount}` : ""}
                    </small>
                    {pageCount > 1 && (
                        <div className="btn-group btn-group-sm">
                            <button type="button" className="btn btn-outline-secondary py-0 px-2"
                                disabled={busy || current === 0} onClick={() => setPage(current - 1)}>
                                <i className="fas fa-chevron-left" style={{ fontSize: 10 }} />
                            </button>
                            <button type="button" className="btn btn-outline-secondary py-0 px-2"
                                disabled={busy || current >= pageCount - 1} onClick={() => setPage(current + 1)}>
                                <i className="fas fa-chevron-right" style={{ fontSize: 10 }} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

/**
 * Per-layer pace: the window this layer occupies and how it opens and closes.
 * The same numbers the lane's bar and its wedges show — typed, for when a
 * drag is not precise enough.
 *
 * `timing: null` means "the whole video", which is a real state (the caption
 * and the logo start there), not an unset one — so it takes a button to leave
 * it rather than a number appearing from nowhere. The enter/exit KIND is
 * preserved when its seconds change: a photo entering on a slide keeps
 * sliding, it just slides for longer.
 */
export function TimingRows({ layer, duration, busy, onPatch }) {
    const win = layer.timing || null;
    const start = win ? win.start : 0;
    const end = win ? win.end : duration;
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const setWin = (s, e) => onPatch({
        timing: {
            start: +Math.max(0, Math.min(duration - 0.2, s)).toFixed(3),
            end: +Math.max(s + 0.2, Math.min(duration, e)).toFixed(3),
        },
    });
    const ramp = (which, seconds) => {
        const cur = which === "enter" ? layer.enter : layer.exit;
        const kind = cur?.kind && cur.kind !== "none" ? cur.kind : "fade";
        onPatch({ [which]: { kind, seconds } });
    };
    return (
        <div className="border rounded p-2 mt-2">
            <div className="d-flex align-items-center">
                <strong className="small">Pace</strong>
                <span className="badge bg-secondary ms-2">
                    {win ? `${start.toFixed(1)}–${end.toFixed(1)}s` : "whole video"}
                </span>
                {win && (
                    <button className="btn btn-sm btn-link p-0 ms-auto" disabled={busy}
                        title="Back to running for the whole video"
                        onClick={() => onPatch({ timing: null })}>Whole video</button>
                )}
                {!win && (
                    <button className="btn btn-sm btn-link p-0 ms-auto" disabled={busy}
                        title="Give this layer a window on the timeline"
                        onClick={() => setWin(0, Math.min(duration, Math.max(1, duration / 2)))}>Give it a window</button>
                )}
            </div>
            {win && (
                <div className="d-flex align-items-center gap-2 mt-2">
                    <label className="small text-muted mb-0">Start</label>
                    <input type="number" className="form-control form-control-sm" style={{ width: 74 }}
                        min={0} max={duration} step={0.1} value={start} disabled={busy}
                        onChange={(e) => setWin(num(e.target.value), end)} />
                    <label className="small text-muted mb-0">End</label>
                    <input type="number" className="form-control form-control-sm" style={{ width: 74 }}
                        min={0} max={duration} step={0.1} value={end} disabled={busy}
                        onChange={(e) => setWin(start, num(e.target.value))} />
                    <small className="text-muted ms-auto">{(end - start).toFixed(1)}s</small>
                </div>
            )}
            <RangeRow label="Fade in" value={layer.enter?.seconds || 0} min={0} max={4} step={0.1}
                suffix="s" disabled={busy} onChange={(v) => ramp("enter", v)} />
            <RangeRow label="Fade out" value={layer.exit?.seconds || 0} min={0} max={4} step={0.1}
                suffix="s" disabled={busy} onChange={(v) => ramp("exit", v)} />
            <p className="text-muted mb-0" style={{ fontSize: 11 }}>
                The same window the lane shows — drag the bar to move it, its ends to trim.
            </p>
        </div>
    );
}

/**
 * Which part of a picture a layer uses, and how far into it we push.
 *
 * Two controls, because they answer different questions and the renderer
 * keeps them apart for the same reason:
 *
 *   the CROP is a still decision — this layer is about that corner of the
 *   photo — and is edited as four edge trims, which is how people describe
 *   it ("take 10% off the left") and what a drag on the thumbnail writes;
 *   ZOOM and PAN push in WITHIN that crop, and are keyable, so the same
 *   pair of controls also authors a slow push across a window.
 *
 * The thumbnail draws the crop as a solid box and, when zoomed, the visible
 * region as a dashed one inside it — the nesting is the whole model, so it
 * is worth being able to see.
 */
export function FrameRows({ layer, busy, onPatch, thumb, cropMode, onCropMode }) {
    const boxRef = useRef(null);
    const c = layer.crop || { x: 0, y: 0, w: 1, h: 1 };
    const zoom = Number(layer.zoom) || 1;
    const panX = layer.panX == null ? 0.5 : layer.panX;
    const panY = layer.panY == null ? 0.5 : layer.panY;
    const isDefault = !layer.crop && zoom === 1 && layer.panX == null && layer.panY == null;
    const pct = (v) => Math.round(v * 100);

    // Edge trims read and write the same rect the renderer stores; the
    // opposite edge holds still, which is what "trim this side" means.
    const setCrop = (next) => {
        const x = clamp01(next.x);
        const y = clamp01(next.y);
        const w = Math.max(0.05, Math.min(next.w, 1 - x));
        const h = Math.max(0.05, Math.min(next.h, 1 - y));
        const whole = x === 0 && y === 0 && w === 1 && h === 1;
        onPatch({ crop: whole ? null : { x: +x.toFixed(4), y: +y.toFixed(4), w: +w.toFixed(4), h: +h.toFixed(4) } });
    };
    const trim = (edge, pctValue) => {
        const v = clamp01((Number(pctValue) || 0) / 100);
        if (edge === "left") setCrop({ x: v, y: c.y, w: c.x + c.w - v, h: c.h });
        if (edge === "right") setCrop({ x: c.x, y: c.y, w: 1 - v - c.x, h: c.h });
        if (edge === "top") setCrop({ x: c.x, y: v, w: c.w, h: c.y + c.h - v });
        if (edge === "bottom") setCrop({ x: c.x, y: c.y, w: c.w, h: 1 - v - c.y });
    };

    // Dragging on the thumbnail: the body moves the crop, the corner resizes
    // it. Both stay inside the picture — a crop that ran off the edge would
    // only be clamped by the renderer anyway, and silently.
    const drag = useRef(null);
    const onDown = (e, mode) => {
        if (busy || !boxRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        const r = boxRef.current.getBoundingClientRect();
        drag.current = { mode, x0: e.clientX, y0: e.clientY, rect: r, orig: { ...c } };
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
        const d = drag.current;
        if (!d) return;
        const dx = (e.clientX - d.x0) / d.rect.width;
        const dy = (e.clientY - d.y0) / d.rect.height;
        if (d.mode === "move") {
            setCrop({
                x: Math.max(0, Math.min(1 - d.orig.w, d.orig.x + dx)),
                y: Math.max(0, Math.min(1 - d.orig.h, d.orig.y + dy)),
                w: d.orig.w, h: d.orig.h,
            });
        } else {
            setCrop({ x: d.orig.x, y: d.orig.y, w: d.orig.w + dx, h: d.orig.h + dy });
        }
    };
    const onUp = () => { drag.current = null; };

    // What the zoom actually shows, in the crop's own coordinates.
    const zw = c.w / zoom;
    const zh = c.h / zoom;
    const zx = c.x + Math.max(0, Math.min(c.w - zw, c.w * panX - zw / 2));
    const zy = c.y + Math.max(0, Math.min(c.h - zh, c.h * panY - zh / 2));

    return (
        <div className="border rounded p-2 mt-2">
            <div className="d-flex align-items-center">
                <strong className="small">Frame</strong>
                {!isDefault && (
                    <span className="badge bg-secondary ms-2">{pct(c.w)}×{pct(c.h)}%{zoom > 1 ? ` · ${zoom.toFixed(1)}×` : ""}</span>
                )}
                {!isDefault && (
                    <button className="btn btn-sm btn-link py-0 ms-auto" style={{ fontSize: 11 }} disabled={busy}
                        title="The whole picture again, no push-in"
                        onClick={() => onPatch({ crop: null, zoom: null, panX: null, panY: null })}>Reset</button>
                )}
            </div>

            {onCropMode && (
                <button type="button" disabled={busy}
                    className={`btn btn-sm w-100 mt-2 ${cropMode ? "btn-warning" : "btn-outline-secondary"}`}
                    title="Drag the picture on the preview to reframe it; the wheel zooms the region"
                    onClick={() => onCropMode(!cropMode)}>
                    <i className={`fas ${cropMode ? "fa-check" : "fa-crop-simple"} me-1`} />
                    {cropMode ? "Done reframing" : "Reframe on the preview"}
                </button>
            )}
            {cropMode && (
                <p className="text-muted mb-0 mt-1" style={{ fontSize: 11 }}>
                    Drag the picture to move the crop, wheel to zoom it. Selection and handles
                    are off while this is on.
                </p>
            )}

            {thumb && (
                <div ref={boxRef} className="position-relative mt-2 mb-2 bg-dark rounded"
                    style={{ overflow: "hidden", touchAction: "none", userSelect: "none" }}
                    onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                    <img src={thumb} alt="" draggable={false}
                        style={{ width: "100%", height: 96, objectFit: "contain", display: "block", opacity: 0.55 }} />
                    <div className="position-absolute" title="Drag to move the crop; the corner resizes it"
                        style={{
                            left: `${c.x * 100}%`, top: `${c.y * 100}%`,
                            width: `${c.w * 100}%`, height: `${c.h * 100}%`,
                            outline: "2px solid #0d6efd", cursor: "move",
                            boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                        }}
                        onPointerDown={(e) => onDown(e, "move")} onPointerMove={onMove} onPointerUp={onUp}>
                        {zoom > 1 && (
                            <div className="position-absolute" style={{
                                left: `${((zx - c.x) / c.w) * 100}%`, top: `${((zy - c.y) / c.h) * 100}%`,
                                width: `${(zw / c.w) * 100}%`, height: `${(zh / c.h) * 100}%`,
                                outline: "1px dashed #ffc107", pointerEvents: "none",
                            }} />
                        )}
                        <div className="position-absolute" title="Resize the crop"
                            style={{ right: -5, bottom: -5, width: 12, height: 12, background: "#0d6efd", cursor: "nwse-resize" }}
                            onPointerDown={(e) => onDown(e, "resize")} onPointerMove={onMove} onPointerUp={onUp} />
                    </div>
                </div>
            )}

            <RangeRow label="Zoom" value={zoom} min={1} max={4} step={0.05} suffix="×" disabled={busy}
                onChange={(v) => onPatch({ zoom: v === 1 ? null : v })} />
            {zoom > 1 && (
                <>
                    <RangeRow label="Pan across" value={panX} min={0} max={1} step={0.01} suffix="" disabled={busy}
                        onChange={(v) => onPatch({ panX: v === 0.5 ? null : v })} />
                    <RangeRow label="Pan down" value={panY} min={0} max={1} step={0.01} suffix="" disabled={busy}
                        onChange={(v) => onPatch({ panY: v === 0.5 ? null : v })} />
                </>
            )}

            <label className="form-label small mb-1">Trim the edges</label>
            <div className="row g-1">
                {[
                    ["left", "L", c.x],
                    ["right", "R", 1 - (c.x + c.w)],
                    ["top", "T", c.y],
                    ["bottom", "B", 1 - (c.y + c.h)],
                ].map(([edge, label, value]) => (
                    <div className="col-3" key={edge}>
                        <div className="input-group input-group-sm">
                            <span className="input-group-text px-1" style={{ fontSize: 10 }}>{label}</span>
                            <input type="number" className="form-control px-1" min={0} max={95} step={1} disabled={busy}
                                style={{ fontSize: 11 }} value={pct(value)}
                                onChange={(e) => trim(edge, e.target.value)} />
                        </div>
                    </div>
                ))}
            </div>
            <p className="text-muted mb-0 mt-1" style={{ fontSize: 11 }}>
                Zoom and pan are keyable — key them at two instants and the shot pushes in.
            </p>
        </div>
    );
}

/**
 * Per-layer look: opacity plus the picture filters (the renderer's
 * layer.filter). Defaults write as null so an untouched layer stays exactly
 * the pre-filter patch it was.
 */
export function LookRows({ layer, busy, onPatch, withFilters = true }) {
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
