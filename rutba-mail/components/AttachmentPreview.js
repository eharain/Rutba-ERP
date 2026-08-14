import { useEffect } from "react";

// Inline preview for the two things people actually open before deciding
// whether to save them: images and PDFs. Everything else still downloads.
//
// The bytes arrive as a blob URL from a SELECTIVE part fetch (BODY[<part>]),
// not from another full download of the message — see MessageView.fetchBlob.
//
// Rendering: images go through <img>, where SVG is script-disabled by the
// browser, so hostile markup in an attachment cannot run. PDFs go through a
// plain <iframe>: a blob: URL will not load inside a sandboxed frame (it needs
// the origin that created it), and the browser's PDF viewer runs out of
// process rather than as page script. This is the same posture as opening the
// file from the download bar, and strictly less exposure than the message body
// — which is why THAT stays in a fully sandboxed frame.

const IMAGE_RE = /^image\//i;
const PDF_RE = /^application\/(pdf|x-pdf)$/i;

export function isPreviewable(contentType) {
    const type = String(contentType || "").toLowerCase().split(";")[0].trim();
    return IMAGE_RE.test(type) || PDF_RE.test(type);
}

export default function AttachmentPreview({ file, onClose }) {
    const type = String(file?.contentType || "").toLowerCase().split(";")[0].trim();
    const isImage = IMAGE_RE.test(type);

    // Escape closes the preview, not the composer behind it — this listener
    // is only mounted while the overlay is up.
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            onClose();
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [onClose]);

    if (!file) return null;

    return (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
            style={{ background: "rgba(0,0,0,.6)", zIndex: 1070 }} role="dialog" onClick={onClose}>
            <div className="card shadow-lg" style={{ width: "min(60rem, 94vw)", height: "min(46rem, 92vh)" }}
                onClick={(e) => e.stopPropagation()}>
                <div className="card-header d-flex justify-content-between align-items-center py-2 gap-2">
                    <strong className="text-truncate">
                        <i className="fa-solid fa-paperclip me-2"></i>{file.filename}
                    </strong>
                    <span className="d-flex align-items-center gap-2 flex-shrink-0">
                        <a className="btn btn-sm btn-outline-secondary" href={file.url} download={file.filename}>
                            <i className="fa-solid fa-download me-1"></i>Download
                        </a>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </span>
                </div>
                <div className="card-body p-0 d-flex align-items-center justify-content-center overflow-auto bg-light">
                    {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.url} alt={file.filename}
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    ) : (
                        <iframe src={file.url} title={file.filename} style={{ width: "100%", height: "100%", border: 0 }} />
                    )}
                </div>
            </div>
        </div>
    );
}
