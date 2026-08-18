import { useEffect, useState } from "react";
import { printStorage } from "@rutba/shared/lib/printStorage";
import { QrExportSource, QrImage, useQrDownload } from "./QrCode";
import {
    QR_KINDS,
    QR_LABEL_SIZES,
    buildQrUrl,
    qrCodeFor,
    qrCodeSource,
    useStorefrontBaseUrl,
} from "../lib/qrCode";

/**
 * "QR code" dialog for a single entity, opened from a detail page's action bar.
 *
 * Shows exactly what will be printed — the resolved storefront URL and the
 * symbol that encodes it — before anything reaches paper, because the cost of
 * a wrong QR is a reprint of the whole run.
 *
 * Hand-rolled Bootstrap markup rather than the bootstrap.bundle Modal API: the
 * CMS has no other modal, and a controlled component avoids reconciling React
 * state with Bootstrap's own show/hide lifecycle.
 */

export default function QrCodeModal({ open, onClose, kind, entity, unsavedWarning = false }) {
    const base = useStorefrontBaseUrl();
    const [copies, setCopies] = useState(1);
    const [sizeKey, setSizeKey] = useState("md");
    const [showCaption, setShowCaption] = useState(true);
    const [copied, setCopied] = useState(false);

    const meta = QR_KINDS[kind];
    const code = qrCodeFor(kind, entity);
    const source = qrCodeSource(kind, entity);
    const title = meta?.titleOf(entity) || "";
    const url = buildQrUrl(base, kind, entity);

    const { exportRef, downloadPng, downloadSvg } = useQrDownload({
        value: url,
        title,
        code,
    });

    useEffect(() => {
        if (!copied) return;
        const t = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(t);
    }, [copied]);

    // Escape closes, matching every other dialog the team uses.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    };

    const handlePrint = () => {
        const size = QR_LABEL_SIZES.find((s) => s.key === sizeKey) || QR_LABEL_SIZES[1];
        const key = printStorage.storePrintData({
            heading: title,
            size,
            showCaption,
            labels: Array.from({ length: Math.max(1, Number(copies) || 1) }, () => ({
                url,
                code,
                title,
                subtitle: meta?.label || "",
            })),
        });
        if (!key) return;
        window.open(`/print/qr-labels?key=${encodeURIComponent(key)}`, "_blank", "width=1000,height=800");
    };

    const isLocalBase = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(base || "");

    return (
        <>
            <div className="modal-backdrop fade show" onClick={onClose} />
            <div className="modal fade show d-block" role="dialog" tabIndex="-1">
                <div className="modal-dialog modal-lg modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">
                                <i className="fas fa-qrcode me-2" />
                                QR code — {meta?.label || kind}
                            </h5>
                            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
                        </div>

                        <div className="modal-body">
                            {!code && (
                                <div className="alert alert-warning">
                                    This record has no slug yet, so there is nothing to encode. Save it
                                    with a slug first.
                                </div>
                            )}

                            {code && (
                                <div className="row g-4">
                                    <div className="col-md-5 text-center" ref={exportRef}>
                                        <div className="border rounded p-3 d-inline-block bg-white">
                                            <QrImage value={url} size={200} />
                                            {showCaption && (
                                                <div className="mt-2 small">
                                                    <div className="fw-semibold text-truncate" style={{ maxWidth: 200 }}>{title}</div>
                                                    <div className="text-muted font-monospace">{code}</div>
                                                </div>
                                            )}
                                        </div>
                                        <QrExportSource value={url} />
                                    </div>

                                    <div className="col-md-7">
                                        <label className="form-label small text-muted mb-1">Encoded URL</label>
                                        <div className="input-group input-group-sm mb-1">
                                            <input className="form-control font-monospace" value={url} readOnly />
                                            <button className="btn btn-outline-secondary" onClick={handleCopy} type="button">
                                                <i className={`fas ${copied ? "fa-check" : "fa-copy"}`} />
                                            </button>
                                        </div>
                                        <p className="small text-muted">
                                            The storefront resolves <code>{code}</code> when the code is
                                            scanned, so this stays valid if the {meta?.label?.toLowerCase() || "record"} moves.
                                            {source === "qr_code" && " Using the product's custom QR code field."}
                                            {source === "documentId" && " This product has no slug, so its internal id is encoded — add a slug for a friendlier code."}
                                        </p>

                                        {isLocalBase && (
                                            <div className="alert alert-warning py-2 small">
                                                The storefront URL is a localhost address. Set{" "}
                                                <strong>site_url</strong> in Site Settings before printing.
                                            </div>
                                        )}

                                        {unsavedWarning && (
                                            <div className="alert alert-warning py-2 small">
                                                This code isn&apos;t saved yet. Save the record first —
                                                a printed label can&apos;t be corrected later.
                                            </div>
                                        )}

                                        <div className="row g-2 align-items-end">
                                            <div className="col-6">
                                                <label className="form-label small text-muted mb-1">Label size</label>
                                                <select
                                                    className="form-select form-select-sm"
                                                    value={sizeKey}
                                                    onChange={(e) => setSizeKey(e.target.value)}
                                                >
                                                    {QR_LABEL_SIZES.map((s) => (
                                                        <option key={s.key} value={s.key}>{s.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-6">
                                                <label className="form-label small text-muted mb-1">Copies</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="500"
                                                    className="form-control form-control-sm"
                                                    value={copies}
                                                    onChange={(e) => setCopies(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="form-check mt-3">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id="qr-caption"
                                                checked={showCaption}
                                                onChange={(e) => setShowCaption(e.target.checked)}
                                            />
                                            <label className="form-check-label small" htmlFor="qr-caption">
                                                Print the title and code under the QR
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            {code && (
                                <>
                                    <button className="btn btn-sm btn-outline-secondary" onClick={downloadSvg} type="button">
                                        <i className="fas fa-download me-1" />SVG
                                    </button>
                                    <button className="btn btn-sm btn-outline-secondary" onClick={downloadPng} type="button">
                                        <i className="fas fa-download me-1" />PNG
                                    </button>
                                    <button className="btn btn-sm btn-primary" onClick={handlePrint} type="button">
                                        <i className="fas fa-print me-1" />Print labels
                                    </button>
                                </>
                            )}
                            <button className="btn btn-sm btn-outline-secondary" onClick={onClose} type="button">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
