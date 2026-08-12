import React, { useMemo, useState } from "react";

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
export function TrackBrowser({ tracks, busy, pickedId, onPick, pickLabel = "Use", onAdd, previewingId, onAudition, maxHeight = 190 }) {
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
