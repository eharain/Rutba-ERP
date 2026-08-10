/**
 * Audio Library — the music beds that go under generated social videos.
 *
 * A track is EITHER a foreign URL (a CDN, a royalty-free library) or a file
 * uploaded to the media server. Both end up with a playable `url`, so nothing
 * downstream has to care which it is; `audio_file` is set only for uploads, and
 * is what lets this page offer to delete the file along with the track.
 *
 * Read by the Video Studio here and by the Rutba Social Poster desktop app,
 * which draws a random active track when it renders a video unattended — so an
 * inactive track is genuinely off everywhere, not just hidden in this list.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    SocialAudioTracksEndpoints, UploadEndpoints, MediaUtilsEndpoints,
} from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";
import { isAudioFile } from "../lib/video-maker";

const BLANK = { name: "", url: "", credit: "", tags: "", volume: "" };

// Pages that merely host a player are the classic mistake here — the renderer
// needs bytes it can decode, and a YouTube or Spotify link gives it HTML.
const PLAYER_PAGE_RE = /(youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|vimeo\.com)/i;

const fmtDuration = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

export default function AudioLibraryPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(BLANK);
    const [editing, setEditing] = useState(null); // documentId being edited
    const [playingId, setPlayingId] = useState(null);
    const [uploading, setUploading] = useState(false);
    const audioRef = useRef(null);
    const fileRef = useRef(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await SocialAudioTracksEndpoints.list({
                sort: ["name:asc"], populate: ["audio_file"], pageSize: 200,
            });
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
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const playable = (t) => MediaUtilsEndpoints.strapiImageUrl(t.audio_file || t.url);

    // Track length, read off a metadata-only <audio> load. Media elements read
    // duration cross-origin without CORS, so this works for foreign URLs too.
    // Null on anything that will not load within the timeout — the field is
    // cosmetic and must never block adding a track.
    const probeDuration = (src) => new Promise((resolve) => {
        const a = document.createElement("audio");
        const finish = (v) => { a.src = ""; resolve(v); };
        const timer = setTimeout(() => finish(null), 5000);
        a.onloadedmetadata = () => {
            clearTimeout(timer);
            finish(Number.isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration * 100) / 100 : null);
        };
        a.onerror = () => { clearTimeout(timer); finish(null); };
        a.preload = "metadata";
        a.src = src;
    });

    const preview = (t) => {
        const el = audioRef.current;
        if (!el) return;
        if (playingId === t.documentId) { el.pause(); setPlayingId(null); return; }
        el.src = playable(t);
        // Self-heal: rows created before duration was recorded (or whose URL
        // could not be probed at add time) pick it up the first time anyone
        // listens. Cosmetic — failures are swallowed.
        el.onloadedmetadata = async () => {
            const d = el.duration;
            if (t.duration_seconds || !Number.isFinite(d) || d <= 0) return;
            const rounded = Math.round(d * 100) / 100;
            try {
                await SocialAudioTracksEndpoints.update(t.documentId, { duration_seconds: rounded });
                setTracks((list) => list.map((x) => (x.documentId === t.documentId ? { ...x, duration_seconds: rounded } : x)));
            } catch { /* next listen retries */ }
        };
        el.play().then(() => setPlayingId(t.documentId))
            .catch(() => toast("That URL would not play — check it is a direct link to an audio file.", "warning"));
    };

    const parseTags = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

    const submit = async (e) => {
        e?.preventDefault?.();
        if (!form.name.trim()) { toast("Give the track a name.", "warning"); return; }
        if (!form.url.trim()) { toast("A track needs a URL — paste one, or upload a file.", "warning"); return; }
        const url = form.url.trim();
        if (PLAYER_PAGE_RE.test(url)) {
            toast("That is a page with a player on it, not an audio file — the video maker needs a direct link it can decode.", "danger");
            return;
        }
        if (!form.audioFileId && !isAudioFile({ url })) {
            const ok = confirm(
                "That URL does not look like an audio file (no .mp3 / .m4a / .wav / .ogg ending).\n\n"
                + "It may still work if the server returns audio. Add it anyway?",
            );
            if (!ok) return;
        }
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                url: form.url.trim(),
                credit: form.credit.trim() || null,
                tags: parseTags(form.tags),
                // A blank trim means "use the studio setting"; anything
                // unparseable is treated the same rather than stored as NaN,
                // which would come back as a null volume no one can explain.
                volume: Number.isFinite(Number(form.volume)) && form.volume !== ""
                    ? Math.max(0, Math.min(1, Number(form.volume)))
                    : null,
                ...(form.audioFileId ? { audio_file: form.audioFileId } : {}),
            };
            if (!editing) {
                const duration = await probeDuration(url);
                if (duration) payload.duration_seconds = duration;
            }
            if (editing) {
                await SocialAudioTracksEndpoints.update(editing, payload);
                toast("Track updated.", "success");
            } else {
                await SocialAudioTracksEndpoints.create({ ...payload, is_active: true });
                toast("Track added.", "success");
            }
            setForm(BLANK);
            setEditing(null);
            await load();
        } catch (err) {
            console.error("Failed to save the track", err);
            toast(err?.response?.data?.error?.message || "Failed to save the track.", "danger");
        } finally {
            setSaving(false);
        }
    };

    // Upload goes through the normal /upload route, so the bytes land wherever
    // this instance's provider sends them — the media file server on a
    // configured instance. The track then just points at the resulting file.
    const uploadFiles = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";
        if (!files.length) return;
        setUploading(true);
        let added = 0;
        try {
            for (const file of files) {
                const uploaded = await UploadEndpoints.uploadFiles([file], null, null, null, {
                    name: file.name, alt: null, caption: null,
                });
                const rec = (Array.isArray(uploaded) ? uploaded : [uploaded])[0];
                if (!rec?.id || !rec?.url) continue;
                // Probe the local bytes, not the uploaded URL — no round trip,
                // and it works before the media host has the file visible.
                const blobUrl = URL.createObjectURL(file);
                const duration = await probeDuration(blobUrl);
                URL.revokeObjectURL(blobUrl);
                await SocialAudioTracksEndpoints.create({
                    name: file.name.replace(/\.[^.]+$/, ""),
                    url: rec.url,
                    audio_file: rec.id,
                    is_active: true,
                    tags: [],
                    ...(duration ? { duration_seconds: duration } : {}),
                });
                added++;
            }
            toast(added ? `Added ${added} track(s).` : "Nothing was added.", added ? "success" : "warning");
            await load();
        } catch (err) {
            console.error("Failed to upload tracks", err);
            toast("Upload failed.", "danger");
        } finally {
            setUploading(false);
        }
    };

    const toggleActive = async (t) => {
        try {
            await SocialAudioTracksEndpoints.update(t.documentId, { is_active: !t.is_active });
            setTracks((list) => list.map((x) => (x.documentId === t.documentId ? { ...x, is_active: !x.is_active } : x)));
        } catch (err) {
            console.error("Failed to toggle the track", err);
            toast("Failed to change that track.", "danger");
        }
    };

    const remove = async (t) => {
        const isUpload = !!t.audio_file?.id;
        if (!confirm(`Remove “${t.name}” from the library?`)) return;
        // An uploaded file outlives its track unless we say otherwise, and a
        // silently orphaned upload is worse than an explicit question.
        const alsoFile = isUpload && confirm("Also delete the uploaded audio file from the media server?");
        try {
            await SocialAudioTracksEndpoints.del(t.documentId);
            if (alsoFile) {
                try { await UploadEndpoints.deleteFile(t.audio_file.id); }
                catch { toast("Track removed, but the file could not be deleted.", "warning"); }
            }
            toast("Track removed.", "success");
            await load();
        } catch (err) {
            console.error("Failed to delete the track", err);
            toast("Failed to remove the track.", "danger");
        }
    };

    const startEdit = (t) => {
        setEditing(t.documentId);
        setForm({
            name: t.name || "",
            url: t.url || "",
            credit: t.credit || "",
            tags: Array.isArray(t.tags) ? t.tags.join(", ") : "",
            volume: t.volume ?? "",
            audioFileId: t.audio_file?.id || null,
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const activeCount = tracks.filter((t) => t.is_active).length;

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center flex-wrap gap-2 mb-3">
                    <h2 className="mb-0"><i className="fas fa-music me-2" />Audio Library</h2>
                    <span className="badge bg-secondary align-self-center">{tracks.length} track(s)</span>
                    <span className="badge bg-success align-self-center">{activeCount} in rotation</span>
                    <div className="ms-auto d-flex gap-2">
                        <Link className="btn btn-sm btn-outline-primary" href="/posts/video-studio">
                            <i className="fas fa-film me-1" />Video Studio
                        </Link>
                        <button className="btn btn-sm btn-outline-secondary" onClick={load} disabled={loading}>
                            <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                <p className="text-muted small">
                    These are the music beds laid under generated videos. Anything marked <strong>in rotation</strong> can be
                    picked at random — including by the Social Poster when it makes a video unattended — so switch a track off
                    here to take it out of circulation everywhere.
                </p>

                <div className="card mb-3">
                    <div className="card-header py-2">
                        <i className={`fas ${editing ? "fa-pen" : "fa-plus"} me-2`} />
                        {editing ? "Edit track" : "Add a track by URL"}
                    </div>
                    <div className="card-body">
                        <form onSubmit={submit}>
                            <div className="row g-2">
                                <div className="col-md-4">
                                    <label className="form-label small mb-1">Name</label>
                                    <input className="form-control form-control-sm" value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Soft acoustic loop" />
                                </div>
                                <div className="col-md-8">
                                    <label className="form-label small mb-1">Direct URL to the audio file</label>
                                    <input className="form-control form-control-sm" value={form.url}
                                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                                        placeholder="https://…/track.mp3" />
                                </div>
                                <div className="col-md-5">
                                    <label className="form-label small mb-1">Credit / licence</label>
                                    <input className="form-control form-control-sm" value={form.credit}
                                        onChange={(e) => setForm({ ...form, credit: e.target.value })}
                                        placeholder="Artist — CC BY 4.0" />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label small mb-1">Tags (comma-separated)</label>
                                    <input className="form-control form-control-sm" value={form.tags}
                                        onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="upbeat, retail" />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label small mb-1">Volume trim</label>
                                    <input className="form-control form-control-sm" type="number" min="0" max="1" step="0.05"
                                        value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })}
                                        placeholder="leave blank for default" />
                                </div>
                            </div>
                            <div className="d-flex flex-wrap gap-2 mt-3 align-items-center">
                                <button className="btn btn-sm btn-primary" type="submit" disabled={saving}>
                                    {saving ? "Saving…" : editing ? "Save changes" : "Add track"}
                                </button>
                                {editing && (
                                    <button className="btn btn-sm btn-outline-secondary" type="button"
                                        onClick={() => { setEditing(null); setForm(BLANK); }}>Cancel</button>
                                )}
                                <span className="text-muted small ms-2">or</span>
                                <input ref={fileRef} type="file" accept="audio/*" multiple className="d-none" onChange={uploadFiles} />
                                <button className="btn btn-sm btn-outline-primary" type="button"
                                    disabled={uploading} onClick={() => fileRef.current?.click()}>
                                    <i className={`fas ${uploading ? "fa-spinner fa-spin" : "fa-cloud-upload-alt"} me-1`} />
                                    Upload audio files
                                </button>
                                <span className="text-muted small">
                                    Uploads go to the media server and are added to the library automatically.
                                </span>
                            </div>
                            <div className="form-text mt-2">
                                The URL has to point straight at an audio file the browser can play (mp3, m4a, wav, ogg). A page
                                that merely <em>contains</em> a player — a YouTube or Spotify link — will not work.
                            </div>
                        </form>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header py-2"><i className="fas fa-list me-2" />Tracks</div>
                    <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle mb-0">
                            <thead>
                                <tr>
                                    <th style={{ width: 44 }}></th>
                                    <th>Name</th>
                                    <th>Source</th>
                                    <th>Credit</th>
                                    <th>Tags</th>
                                    <th style={{ width: 90 }}>In rotation</th>
                                    <th style={{ width: 110 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && tracks.length === 0 && (
                                    <tr><td colSpan={7} className="text-center py-4"><span className="spinner-border spinner-border-sm" /></td></tr>
                                )}
                                {!loading && tracks.length === 0 && (
                                    <tr><td colSpan={7} className="text-center text-muted py-4">
                                        No tracks yet. Paste a URL above, or upload a file.
                                    </td></tr>
                                )}
                                {tracks.map((t) => (
                                    <tr key={t.documentId} className={t.is_active ? "" : "text-muted"}>
                                        <td>
                                            <button className="btn btn-sm btn-link p-0" title="Listen" onClick={() => preview(t)}>
                                                <i className={`fas ${playingId === t.documentId ? "fa-pause" : "fa-play"}`} />
                                            </button>
                                        </td>
                                        <td>
                                            <span className="fw-semibold">{t.name}</span>
                                            {t.duration_seconds ? <span className="text-muted small ms-2">{fmtDuration(t.duration_seconds)}</span> : null}
                                            <span className="d-block text-muted text-truncate" style={{ maxWidth: 420, fontSize: "0.75rem" }} title={t.url}>{t.url}</span>
                                        </td>
                                        <td>
                                            {t.audio_file?.id
                                                ? <span className="badge bg-info text-dark"><i className="fas fa-cloud-upload-alt me-1" />uploaded</span>
                                                : <span className="badge bg-light text-dark border"><i className="fas fa-link me-1" />link</span>}
                                        </td>
                                        <td className="small">{t.credit || <span className="text-muted">—</span>}</td>
                                        <td className="small">
                                            {(t.tags || []).map((x) => <span key={x} className="badge bg-light text-dark border me-1">{x}</span>)}
                                        </td>
                                        <td>
                                            <div className="form-check form-switch mb-0">
                                                <input className="form-check-input" type="checkbox"
                                                    checked={!!t.is_active} onChange={() => toggleActive(t)} />
                                            </div>
                                        </td>
                                        <td className="text-end">
                                            <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => startEdit(t)} title="Edit">
                                                <i className="fas fa-pen" />
                                            </button>
                                            <button className="btn btn-sm btn-outline-danger" onClick={() => remove(t)} title="Remove">
                                                <i className="fas fa-trash" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <audio ref={audioRef} className="d-none" onEnded={() => setPlayingId(null)} />
            </Layout>
        </ProtectedRoute>
    );
}
