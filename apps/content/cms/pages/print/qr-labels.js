import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { printStorage } from "@rutba/shared/lib/printStorage";
import { QrImage } from "../../components/QrCode";

/**
 * QR label sheet.
 *
 * Opened in a new tab by the QR dialog / builder page, which stashes the
 * payload in localStorage first (printStorage) — the same handoff apps/inventory/stock
 * uses for barcode labels, because a batch of labels overflows a URL.
 *
 * Rendering is entirely client-side React + window.print(); there is no server
 * PDF anywhere in the ERP and this is not the place to introduce one.
 *
 * Payload shape:
 *   { heading, size: {width,height,qr}, showCaption, labels: [{url, code, title, subtitle}] }
 */
export default function QrLabelsPrintPage() {
    const router = useRouter();
    const [payload, setPayload] = useState(null);
    const [error, setError] = useState(null);
    // getPrintData clears the entry as it reads, so it must run exactly once.
    // StrictMode double-invokes effects in dev and would otherwise read the
    // now-empty key on the second pass and report the data as expired.
    const consumed = useRef(false);

    useEffect(() => {
        if (!router.isReady || consumed.current) return;
        const key = router.query.key;
        if (!key) {
            setError("No print data key in the URL.");
            return;
        }
        consumed.current = true;
        const data = printStorage.getPrintData(String(key));
        // A refresh hits this too — the key is gone by then, which is the same
        // symptom as a genuinely stale link, so say what to do about it.
        if (!data?.labels?.length) {
            setError("Print data has expired. Close this tab and generate the labels again.");
            return;
        }
        setPayload(data);
    }, [router.isReady, router.query.key]);

    // Give the browser a beat to lay out fonts and the SVG grid before the
    // print dialog snapshots the page.
    useEffect(() => {
        if (!payload) return;
        const t = setTimeout(() => window.print(), 600);
        return () => clearTimeout(t);
    }, [payload]);

    if (error) {
        return (
            <div className="d-print-none p-4">
                <div className="alert alert-danger">{error}</div>
                <button className="btn btn-outline-secondary" onClick={() => window.close()}>Close</button>
            </div>
        );
    }

    if (!payload) return <div className="d-print-none p-4 text-muted">Preparing labels…</div>;

    const size = payload.size || { width: "2in", height: "2in", qr: 130 };

    return (
        <>
            <div
                className="d-print-none position-fixed"
                style={{ top: 20, right: 20, zIndex: 1100, display: "flex", gap: 8 }}
            >
                <button type="button" className="btn btn-sm btn-success" onClick={() => window.print()}>
                    <i className="fas fa-print me-1" /> Print
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => window.close()}>
                    Close
                </button>
            </div>

            <div className="qr-sheet">
                {payload.labels.map((label, i) => (
                    <div className="qr-label" key={`${label.code}-${i}`}>
                        <QrImage value={label.url} size={size.qr} />
                        {payload.showCaption && (
                            <div className="qr-caption">
                                <div className="qr-caption-title">{label.title}</div>
                                <div className="qr-caption-code">{label.code}</div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <style jsx global>{`
                .qr-sheet {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0;
                    padding: 0.25in;
                }
                .qr-label {
                    width: ${size.width};
                    min-height: ${size.height};
                    padding: 0.08in;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    text-align: center;
                    /* page-break-inside is what print engines honour; the
                       modern alias alone is ignored by some of them. */
                    page-break-inside: avoid;
                    break-inside: avoid;
                }
                .qr-caption {
                    margin-top: 2px;
                    width: 100%;
                    line-height: 1.15;
                }
                .qr-caption-title {
                    font-size: 8pt;
                    font-weight: 600;
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                }
                .qr-caption-code {
                    font-size: 7pt;
                    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                    color: #444;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                @media print {
                    @page { margin: 0.25in; }
                    body { margin: 0; }
                    .d-print-none { display: none !important; }
                    .qr-sheet { padding: 0; }
                }
            `}</style>
        </>
    );
}
