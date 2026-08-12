/**
 * Drop-off area for the media libraries.
 *
 * Two ways in, one handler out: drop files on the card (or anywhere on the page
 * when `global` is set), or click it to browse. The caller gets a plain
 * `File[]` — already filtered to the types it asked for — and owns the upload,
 * because "what happens to an audio file" and "what happens to a video" are
 * genuinely different jobs.
 *
 * Two details that are easy to get wrong and annoying to live with:
 *   - drag events fire per element, so moving over a child fires dragleave on
 *     the parent and the highlight strobes. A depth counter, not a boolean.
 *   - the browser navigates away and *plays the file* if a drop lands outside a
 *     handler. `global` exists so the whole page catches it instead.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

/** Files matching the wanted mime prefix, with directories and junk dropped. */
function filesFrom(dataTransfer, prefix) {
    const all = Array.from(dataTransfer?.files || []);
    // A dropped folder shows up as a zero-byte, type-less entry; there is no way
    // to read it from `files` alone, so it is simply not a file we can upload.
    const files = all.filter((f) => f && f.type);
    const wanted = files.filter((f) => f.type.startsWith(prefix));
    return { wanted, skipped: all.length - wanted.length };
}

export default function DropZone({
    accept = "video/",            // mime prefix, e.g. "audio/" | "video/"
    label = "Drop files here",
    hint = "",
    onFiles,
    busy = false,
    progress = null,              // free text shown while busy, e.g. "2 of 5 — clip.mp4"
    global: watchWindow = true,   // also catch drops anywhere on the page
    onSkipped,                    // (n) => void — told when non-matching files were ignored
}) {
    const [over, setOver] = useState(false);
    const depth = useRef(0);
    const inputRef = useRef(null);

    const take = useCallback((dt) => {
        const { wanted, skipped } = filesFrom(dt, accept);
        if (skipped && onSkipped) onSkipped(skipped);
        if (wanted.length) onFiles(wanted);
    }, [accept, onFiles, onSkipped]);

    // ── window-wide catch ───────────────────────────────────
    // Without this, a near-miss drop makes the browser leave the app and open
    // the file. With it, anywhere on the page is the drop-off place.
    useEffect(() => {
        if (!watchWindow) return undefined;
        const onDragOver = (e) => { e.preventDefault(); };
        const onDragEnter = (e) => {
            if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
            depth.current += 1;
            setOver(true);
        };
        const onDragLeave = () => {
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setOver(false);
        };
        const onDrop = (e) => {
            e.preventDefault();
            depth.current = 0;
            setOver(false);
            if (!busy) take(e.dataTransfer);
        };
        window.addEventListener("dragover", onDragOver);
        window.addEventListener("dragenter", onDragEnter);
        window.addEventListener("dragleave", onDragLeave);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragover", onDragOver);
            window.removeEventListener("dragenter", onDragEnter);
            window.removeEventListener("dragleave", onDragLeave);
            window.removeEventListener("drop", onDrop);
        };
    }, [watchWindow, busy, take]);

    // Local handlers still matter with the window watcher on: they keep the
    // card highlighted on its own, and they work when `global` is off.
    const localDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        depth.current = 0;
        setOver(false);
        if (!busy) take(e.dataTransfer);
    };

    return (
        <>
            <input ref={inputRef} type="file" multiple className="d-none"
                accept={`${accept}*`}
                onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = ""; // same file twice in a row must still fire
                    if (files.length) onFiles(files);
                }} />

            <div
                role="button"
                tabIndex={0}
                onClick={() => !busy && inputRef.current?.click()}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) inputRef.current?.click(); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={localDrop}
                className={`border rounded text-center py-4 px-3 mb-3 ${over ? "border-primary bg-primary bg-opacity-10" : "border-2 bg-light"}`}
                style={{
                    borderStyle: "dashed", cursor: busy ? "progress" : "pointer",
                    transition: "background-color .15s, border-color .15s",
                }}
            >
                {busy ? (
                    <>
                        <span className="spinner-border spinner-border-sm me-2" />
                        <strong>Uploading…</strong>
                        {progress && <div className="text-muted small mt-1 text-truncate">{progress}</div>}
                    </>
                ) : (
                    <>
                        <i className={`fas ${over ? "fa-download" : "fa-cloud-arrow-up"} fa-2x d-block mb-2 ${over ? "text-primary" : "text-secondary"}`} />
                        <strong>{over ? "Drop to upload" : label}</strong>
                        <div className="text-muted small mt-1">
                            {hint || "Drop files anywhere on this page, or click to browse."}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
