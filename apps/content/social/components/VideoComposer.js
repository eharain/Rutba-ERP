/**
 * New-video composer — the Video Studio's front door.
 *
 * The editor works on a POST: it reads that post's photos, types its words over
 * them, and attaches the render back to it. That is the right model once a post
 * exists, but it left "I just want to make a video" with nowhere to start.
 *
 * This gathers the ingredients first — photos, words, music, look — and hands
 * the editor a subject that already has them. It deliberately does NOT invent a
 * second kind of subject: on Open, the ingredients are written to a post (a new
 * draft, or one you pick), so everything downstream — the recipe in
 * video_settings, Attach, the desktop poster, the publish path — keeps working
 * against the one thing it always worked against.
 */
import React, { useState, useMemo } from "react";
import Link from "next/link";
import StrapiMediaLibrary from "@rutba/pos-shared/components/StrapiMediaLibrary";
import { MediaUtilsEndpoints } from "@rutba/api-provider/endpoints";
import { imageItems, ASPECTS } from "../lib/video-maker";

const thumbOf = (f) => MediaUtilsEndpoints.strapiImageUrl(f?.formats?.thumbnail || f?.formats?.small || f);

export default function VideoComposer({
    posts = [], templates = [], tracks = [], busy = false, opening = false,
    options, onOptionChange, onApplyTemplate, onOpen,
}) {
    const [photos, setPhotos] = useState([]);       // media-library file rows
    const [showPicker, setShowPicker] = useState(false);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [dest, setDest] = useState("new");         // 'new' | 'existing'
    const [destPostId, setDestPostId] = useState("");
    const [borrowFrom, setBorrowFrom] = useState("");

    const disabled = busy || opening;

    const addPhotos = (files) => setPhotos((cur) => {
        const have = new Set(cur.map((f) => f.id));
        return [...cur, ...(files || []).filter((f) => f && !have.has(f.id))];
    });
    const removePhoto = (id) => setPhotos((cur) => cur.filter((f) => f.id !== id));
    const movePhoto = (idx, dir) => setPhotos((cur) => {
        const next = [...cur];
        const j = idx + dir;
        if (j < 0 || j >= next.length) return cur;
        [next[idx], next[j]] = [next[j], next[idx]];
        return next;
    });

    // "Use another post's photos": the fastest real start, because the photos
    // that suit a video are usually the ones already gathered for a post.
    const borrowPost = (documentId) => {
        setBorrowFrom(documentId);
        const post = posts.find((p) => p.documentId === documentId);
        if (!post) return;
        const imgs = imageItems(post);
        if (!imgs.length) return;
        addPhotos(imgs);
        // Only pre-fill words that are still untouched — never clobber typing.
        setTitle((t) => t || post.title || "");
        setBody((b) => b || post.body || "");
    };

    const destPost = useMemo(
        () => posts.find((p) => p.documentId === destPostId) || null,
        [posts, destPostId],
    );

    const ready = photos.length > 0 && (dest === "new" ? title.trim().length > 0 : !!destPostId);

    const submit = () => {
        if (!ready || disabled) return;
        onOpen({
            photoIds: photos.map((f) => f.id),
            title: title.trim(),
            body,
            destination: dest,
            postDocumentId: dest === "existing" ? destPostId : null,
        });
    };

    return (
        <div className="row g-3">
            <StrapiMediaLibrary
                show={showPicker}
                onClose={() => setShowPicker(false)}
                onSelect={(files) => addPhotos(files)}
                multiple
                accept="image"
            />

            {/* ── the ingredients ── */}
            <div className="col-lg-8">
                <div className="card mb-3">
                    <div className="card-header py-2 d-flex align-items-center">
                        <i className="fas fa-images me-2" /><strong>Photos</strong>
                        <span className="badge bg-secondary ms-2">{photos.length}</span>
                        <span className="text-muted small ms-auto">The slideshow, in this order.</span>
                    </div>
                    <div className="card-body">
                        <div className="d-flex flex-wrap gap-2 mb-3">
                            <button className="btn btn-sm btn-primary" onClick={() => setShowPicker(true)} disabled={disabled}>
                                <i className="fas fa-photo-film me-1" />Add from media library
                            </button>
                            <select className="form-select form-select-sm" style={{ width: "auto" }} disabled={disabled}
                                value={borrowFrom} onChange={(e) => borrowPost(e.target.value)}>
                                <option value="">Use another post&apos;s photos…</option>
                                {posts.filter((p) => imageItems(p).length > 0).slice(0, 100).map((p) => (
                                    <option key={p.documentId} value={p.documentId}>
                                        {p.title || "(untitled)"} — {imageItems(p).length} photo(s)
                                    </option>
                                ))}
                            </select>
                            {photos.length > 0 && (
                                <button className="btn btn-sm btn-link text-danger" onClick={() => setPhotos([])} disabled={disabled}>
                                    Clear all
                                </button>
                            )}
                        </div>

                        {photos.length === 0 ? (
                            <div className="text-center text-muted py-4 border rounded">
                                <i className="fas fa-image fa-2x mb-2 d-block" />
                                Add at least one photo — the video is built from these.
                            </div>
                        ) : (
                            <div className="d-flex flex-wrap gap-2">
                                {photos.map((f, idx) => (
                                    <div key={f.id} className="text-center" style={{ width: 104 }}>
                                        <div className="position-relative">
                                            <img src={thumbOf(f)} alt="" className="rounded"
                                                style={{ width: 104, height: 78, objectFit: "cover" }} />
                                            <button className="btn btn-sm btn-danger position-absolute p-0"
                                                style={{ top: 2, right: 2, width: 20, height: 20, lineHeight: 1 }}
                                                onClick={() => removePhoto(f.id)} disabled={disabled} title="Remove">
                                                <i className="fas fa-xmark" style={{ fontSize: 11 }} />
                                            </button>
                                            <span className="badge bg-dark position-absolute" style={{ bottom: 2, left: 2, fontSize: 9 }}>
                                                {idx + 1}
                                            </span>
                                        </div>
                                        <div className="d-flex justify-content-center gap-1 mt-1">
                                            <button className="btn btn-sm btn-outline-secondary p-0 px-1" style={{ fontSize: 10 }}
                                                disabled={disabled || idx === 0} onClick={() => movePhoto(idx, -1)} title="Earlier">
                                                <i className="fas fa-chevron-left" />
                                            </button>
                                            <button className="btn btn-sm btn-outline-secondary p-0 px-1" style={{ fontSize: 10 }}
                                                disabled={disabled || idx === photos.length - 1} onClick={() => movePhoto(idx, 1)} title="Later">
                                                <i className="fas fa-chevron-right" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="card mb-3">
                    <div className="card-header py-2">
                        <i className="fas fa-keyboard me-2" /><strong>Words</strong>
                    </div>
                    <div className="card-body">
                        <label className="form-label small mb-1">Title</label>
                        <input className="form-control form-control-sm mb-3" value={title} disabled={disabled}
                            placeholder="Shown on the title card, and the post's name"
                            onChange={(e) => setTitle(e.target.value)} />
                        <label className="form-label small mb-1">Caption</label>
                        <textarea className="form-control form-control-sm" rows={5} value={body} disabled={disabled}
                            placeholder="Types out over the photos — and becomes the post's body."
                            onChange={(e) => setBody(e.target.value)} />
                        <div className="form-text">{body.length} characters. Both stay editable in the editor.</div>
                    </div>
                </div>
            </div>

            {/* ── look, music, destination ── */}
            <div className="col-lg-4">
                <div className="card mb-3">
                    <div className="card-header py-2"><i className="fas fa-sliders me-2" /><strong>Look</strong></div>
                    <div className="card-body">
                        <label className="form-label small mb-1">Template</label>
                        <select className="form-select form-select-sm mb-3" disabled={disabled}
                            onChange={(e) => onApplyTemplate(templates.find((t) => t.documentId === e.target.value) || null)}>
                            <option value="">Current look (no template)</option>
                            {templates.map((t) => (
                                <option key={t.documentId} value={t.documentId}>
                                    {t.name}{t.is_default ? " (default)" : ""}
                                </option>
                            ))}
                        </select>
                        <label className="form-label small mb-1">Shape</label>
                        <div className="btn-group btn-group-sm w-100">
                            {Object.values(ASPECTS).map((a) => (
                                <button key={a.key} type="button" title={a.hint} disabled={disabled}
                                    className={`btn ${options.aspect === a.key ? "btn-primary" : "btn-outline-secondary"}`}
                                    onClick={() => onOptionChange({ aspect: a.key })}>{a.label}</button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="card mb-3">
                    <div className="card-header py-2 d-flex align-items-center">
                        <i className="fas fa-music me-2" /><strong>Music</strong>
                        <Link className="btn btn-sm btn-link ms-auto p-0" href="/audio">Library →</Link>
                    </div>
                    <div className="card-body">
                        <div className="btn-group btn-group-sm w-100 mb-2">
                            {[{ k: "none", label: "None" }, { k: "pick", label: "Chosen" }, { k: "random", label: "Random" }].map((m) => (
                                <button key={m.k} type="button" disabled={disabled}
                                    className={`btn ${options.audioMode === m.k ? "btn-primary" : "btn-outline-secondary"}`}
                                    onClick={() => onOptionChange({ audioMode: m.k })}>{m.label}</button>
                            ))}
                        </div>
                        {options.audioMode === "pick" && (
                            <select className="form-select form-select-sm" disabled={disabled}
                                value={options.audioTrackId || ""}
                                onChange={(e) => onOptionChange({ audioTrackId: e.target.value })}>
                                <option value="">Pick a track…</option>
                                {tracks.map((t) => <option key={t.documentId} value={t.documentId}>{t.name}</option>)}
                            </select>
                        )}
                        {options.audioMode === "random" && (
                            <p className="text-muted small mb-0">A different track is drawn for every render.</p>
                        )}
                    </div>
                </div>

                <div className="card mb-3">
                    <div className="card-header py-2"><i className="fas fa-bullseye me-2" /><strong>Where it goes</strong></div>
                    <div className="card-body">
                        <div className="form-check mb-2">
                            <input className="form-check-input" type="radio" id="dest-new" checked={dest === "new"}
                                onChange={() => setDest("new")} disabled={disabled} />
                            <label className="form-check-label small" htmlFor="dest-new">
                                A new draft post<br />
                                <span className="text-muted">Created now so the editor has something to save the recipe to. Nothing is published.</span>
                            </label>
                        </div>
                        <div className="form-check">
                            <input className="form-check-input" type="radio" id="dest-existing" checked={dest === "existing"}
                                onChange={() => setDest("existing")} disabled={disabled} />
                            <label className="form-check-label small" htmlFor="dest-existing">
                                An existing post<br />
                                <span className="text-muted">The chosen photos are added to it.</span>
                            </label>
                        </div>
                        {dest === "existing" && (
                            <select className="form-select form-select-sm mt-2" disabled={disabled}
                                value={destPostId} onChange={(e) => setDestPostId(e.target.value)}>
                                <option value="">Choose a post…</option>
                                {posts.slice(0, 200).map((p) => (
                                    <option key={p.documentId} value={p.documentId}>{p.title || "(untitled)"}</option>
                                ))}
                            </select>
                        )}
                        {dest === "existing" && destPost && (
                            <p className="text-muted small mb-0 mt-2">
                                {imageItems(destPost).length} photo(s) already on it — yours are appended.
                            </p>
                        )}
                    </div>
                </div>

                <div className="d-grid">
                    <button className="btn btn-primary" onClick={submit} disabled={!ready || disabled}>
                        {opening
                            ? <><span className="spinner-border spinner-border-sm me-1" />Preparing…</>
                            : <><i className="fas fa-clapperboard me-1" />Open in the editor</>}
                    </button>
                    {!ready && (
                        <small className="text-muted text-center mt-1">
                            {photos.length === 0
                                ? "Add at least one photo."
                                : dest === "new" ? "Give it a title." : "Choose the post it belongs to."}
                        </small>
                    )}
                </div>
            </div>
        </div>
    );
}
