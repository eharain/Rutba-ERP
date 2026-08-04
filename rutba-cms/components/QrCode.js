import { useMemo, useRef } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";

/**
 * QR rendering + export primitives shared by the entity modal, the builder
 * page and the print sheet.
 *
 * Everything is client-side: the SVG on screen is the artwork, and PNG export
 * re-renders the same value onto an offscreen canvas at print resolution. No
 * server round-trip, so nothing to keep in sync and nothing to authorise —
 * the same reason label printing elsewhere in the ERP stays in the browser.
 */

// Error-correction level. "M" (~15%) is the usual default; "H" (~30%) survives
// a logo overlay and ink spread on cheap thermal stock at the cost of a denser
// symbol. Print material gets H because a reprint costs more than a few dots.
export const QR_LEVEL = "H";

/** On-screen/printable QR. `size` is CSS pixels. */
export function QrImage({ value, size = 160, className, includeMargin = true }) {
    if (!value) {
        return (
            <div
                className={`d-flex align-items-center justify-content-center border border-dashed rounded text-muted small ${className || ""}`}
                style={{ width: size, height: size }}
            >
                No code
            </div>
        );
    }
    return (
        <QRCodeSVG
            value={value}
            size={size}
            level={QR_LEVEL}
            marginSize={includeMargin ? 2 : 0}
            className={className}
        />
    );
}

function downloadBlob(blob, filename) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
}

/** Slug-safe filename stem from an entity title, so downloads are findable. */
export function qrFileStem(title, code) {
    const base = String(title || code || "qr")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return base || "qr";
}

/**
 * Hook returning { exportRef, downloadPng, downloadSvg }. Mount `exportRef` on
 * a container holding both an offscreen <QRCodeCanvas> and the visible SVG —
 * `<QrExportSource>` renders the canvas half.
 */
export function useQrDownload({ value, title, code }) {
    const exportRef = useRef(null);
    const stem = useMemo(() => qrFileStem(title, code), [title, code]);

    const downloadPng = () => {
        const canvas = exportRef.current?.querySelector("canvas");
        if (!canvas) return;
        canvas.toBlob((blob) => {
            if (blob) downloadBlob(blob, `${stem}-qr.png`);
        }, "image/png");
    };

    const downloadSvg = () => {
        const svg = exportRef.current?.querySelector("svg");
        if (!svg) return;
        const source = new XMLSerializer().serializeToString(svg);
        // Standalone files need the xml prolog; the inline DOM copy doesn't
        // carry one because React renders it inside an HTML document.
        const doc = `<?xml version="1.0" standalone="no"?>\n${source}`;
        downloadBlob(new Blob([doc], { type: "image/svg+xml;charset=utf-8" }), `${stem}-qr.svg`);
    };

    return { exportRef, downloadPng, downloadSvg };
}

/**
 * Offscreen high-resolution canvas that backs PNG export. Kept out of the
 * layout rather than hidden with `display:none`, because a display:none canvas
 * still rasterises but some browsers skip layout for it.
 */
export function QrExportSource({ value, size = 1024 }) {
    if (!value) return null;
    return (
        <div style={{ position: "absolute", left: -99999, top: 0, width: size, height: size }} aria-hidden>
            <QRCodeCanvas value={value} size={size} level={QR_LEVEL} marginSize={2} />
        </div>
    );
}
