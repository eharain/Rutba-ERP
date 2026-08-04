import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { printStorage } from "@rutba/pos-shared/lib/printStorage";
import {
    CmsPageGroupsEndpoints,
    CmsPagesEndpoints,
    ProductGroupsEndpoints,
    ProductsEndpoints,
} from "@rutba/api-provider/endpoints";
import { QrExportSource, QrImage, qrFileStem, useQrDownload } from "../components/QrCode";
import { useToast } from "../components/Toast";
import {
    QR_KINDS,
    QR_LABEL_SIZES,
    buildQrUrl,
    qrCodeFor,
    useStorefrontBaseUrl,
} from "../lib/qrCode";

/**
 * QR code builder — pick any mix of pages, page groups, collections and
 * products, then print them as one label sheet.
 *
 * Every code encodes `<storefront>/qr/<code>`; the storefront resolves the type
 * at scan time (pos-strapi src/api/qr), which is why one screen can mint codes
 * for four unrelated content types without knowing any of their URL shapes.
 *
 * Per-entity codes are also reachable from each detail page's QR button — this
 * page exists for the batch case (a print run covering a whole campaign).
 */

const PAGE_SIZE = 50;

// Each source knows how to list and search its own content type, and maps rows
// onto the {documentId, title, subtitle} shape the picker renders. Search runs
// server-side where the descriptor supports it and client-side otherwise —
// noted per source so the difference isn't mistaken for a bug.
const SOURCES = [
    {
        kind: "cms-page",
        tab: "Pages",
        icon: "fas fa-file-lines",
        // listDraft turns `search` into a title $containsi filter server-side.
        load: async (search) => {
            const res = await CmsPagesEndpoints.listDraft({
                search: search || undefined,
                pageSize: PAGE_SIZE,
                fields: ["documentId", "title", "slug", "page_type"],
                populate: [],
            });
            return res?.data || [];
        },
        subtitleOf: (e) => e.page_type || "",
    },
    {
        kind: "cms-page-group",
        tab: "Page groups",
        icon: "fas fa-layer-group",
        // No search param on this descriptor; the list is small, so filter here.
        load: async (search) => {
            const res = await CmsPageGroupsEndpoints.listDraft({
                pageSize: PAGE_SIZE,
                fields: ["documentId", "name", "title", "slug"],
                populate: [],
                ...(search ? { filters: { name: { $containsi: search } } } : {}),
            });
            return res?.data || [];
        },
        subtitleOf: () => "",
    },
    {
        kind: "product-group",
        tab: "Collections",
        icon: "fas fa-boxes-stacked",
        load: async (search) => {
            const res = await ProductGroupsEndpoints.listDraft({
                pageSize: PAGE_SIZE,
                fields: ["documentId", "name", "title", "slug"],
                populate: [],
                ...(search ? { filters: { name: { $containsi: search } } } : {}),
            });
            return res?.data || [];
        },
        subtitleOf: () => "",
    },
    {
        kind: "product",
        tab: "Products",
        icon: "fas fa-tag",
        // No `populate` here, unlike the sources above: ProductsEndpoints.list
        // treats any object-typed populate (including []) as "merge with the
        // seven-relation default", so passing [] would undo the projection.
        // Naming `fields` without `populate` is what suppresses the relations.
        load: async (search) => {
            const res = await ProductsEndpoints.list(1, PAGE_SIZE, {
                status: "draft",
                searchText: search || undefined,
                fields: ["documentId", "name", "slug", "sku", "qr_code"],
            });
            return res?.data || [];
        },
        subtitleOf: (e) => e.sku || "",
    },
];

export default function QrCodesPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const base = useStorefrontBaseUrl();

    const [activeKind, setActiveKind] = useState("product");
    const [search, setSearch] = useState("");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    // Selection is keyed "<kind>:<documentId>" so the four lists can contribute
    // to one print run without their documentIds colliding.
    const [selected, setSelected] = useState({});

    const [sizeKey, setSizeKey] = useState("md");
    const [showCaption, setShowCaption] = useState(true);

    const source = SOURCES.find((s) => s.kind === activeKind);

    const load = useCallback(async () => {
        if (!jwt || !source) return;
        setLoading(true);
        try {
            setRows(await source.load(search.trim()));
        } catch (err) {
            console.error("Failed to load records for QR codes", err);
            toast("Failed to load records.", "danger");
        } finally {
            setLoading(false);
        }
        // `toast` is recreated per render by useToast; including it would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt, activeKind, search]);

    // Debounce so typing in the search box doesn't fire a request per keystroke.
    useEffect(() => {
        const t = setTimeout(load, 250);
        return () => clearTimeout(t);
    }, [load]);

    const toggle = (kind, entity) => {
        const key = `${kind}:${entity.documentId}`;
        setSelected((prev) => {
            const next = { ...prev };
            if (next[key]) delete next[key];
            else next[key] = { kind, entity };
            return next;
        });
    };

    const selectedList = useMemo(() => Object.entries(selected).map(([key, v]) => ({ key, ...v })), [selected]);

    const labels = useMemo(
        () =>
            selectedList
                .map(({ kind, entity }) => ({
                    url: buildQrUrl(base, kind, entity),
                    code: qrCodeFor(kind, entity),
                    title: QR_KINDS[kind]?.titleOf(entity) || "",
                    subtitle: QR_KINDS[kind]?.label || "",
                }))
                // A record with no slug yet can't be encoded — drop it rather
                // than print a QR that resolves to nothing.
                .filter((l) => l.url),
        [selectedList, base],
    );

    const unprintable = selectedList.length - labels.length;

    const handlePrint = () => {
        if (!labels.length) return;
        const size = QR_LABEL_SIZES.find((s) => s.key === sizeKey) || QR_LABEL_SIZES[1];
        const key = printStorage.storePrintData({ heading: "QR codes", size, showCaption, labels });
        if (!key) {
            toast("Could not stage the print data.", "danger");
            return;
        }
        window.open(`/print/qr-labels?key=${encodeURIComponent(key)}`, "_blank", "width=1000,height=800");
    };

    const isLocalBase = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(base || "");

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <h2 className="mb-0"><i className="fas fa-qrcode me-2" />QR Codes</h2>
                    <div className="ms-auto d-flex gap-2 align-items-center">
                        {selectedList.length > 0 && (
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelected({})}>
                                Clear ({selectedList.length})
                            </button>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={handlePrint} disabled={!labels.length}>
                            <i className="fas fa-print me-1" />Print {labels.length || ""} labels
                        </button>
                    </div>
                </div>

                <p className="text-muted small">
                    Codes encode <code>{base || "…"}/qr/&lt;code&gt;</code>. The storefront
                    works out what the code refers to when it&apos;s scanned, so the same
                    printed label keeps working if a page is renamed or re-routed.
                </p>

                {isLocalBase && (
                    <div className="alert alert-warning py-2 small">
                        The storefront URL is a localhost address — set <strong>site_url</strong>{" "}
                        in <Link href="/site-settings">Site Settings</Link> before printing anything.
                    </div>
                )}

                <div className="row g-3">
                    <div className="col-lg-7">
                        <div className="card">
                            <div className="card-body">
                                <ul className="nav nav-tabs mb-3">
                                    {SOURCES.map((s) => (
                                        <li className="nav-item" key={s.kind}>
                                            <button
                                                className={`nav-link ${activeKind === s.kind ? "active" : ""}`}
                                                onClick={() => setActiveKind(s.kind)}
                                                type="button"
                                            >
                                                <i className={`${s.icon} me-1`} />{s.tab}
                                            </button>
                                        </li>
                                    ))}
                                </ul>

                                <input
                                    className="form-control form-control-sm mb-3"
                                    placeholder={`Search ${source?.tab.toLowerCase() || ""}…`}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />

                                {loading && <p className="text-muted small mb-0">Loading…</p>}
                                {!loading && rows.length === 0 && (
                                    <p className="text-muted small mb-0">No records found.</p>
                                )}

                                <div className="list-group list-group-flush">
                                    {rows.map((row) => {
                                        const key = `${activeKind}:${row.documentId}`;
                                        const code = qrCodeFor(activeKind, row);
                                        return (
                                            <label
                                                key={key}
                                                className="list-group-item d-flex align-items-center gap-2"
                                                style={{ cursor: "pointer" }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input m-0"
                                                    checked={!!selected[key]}
                                                    onChange={() => toggle(activeKind, row)}
                                                />
                                                <span className="flex-grow-1 text-truncate">
                                                    {QR_KINDS[activeKind]?.titleOf(row) || "(untitled)"}
                                                    {source?.subtitleOf(row) && (
                                                        <span className="text-muted small ms-2">{source.subtitleOf(row)}</span>
                                                    )}
                                                </span>
                                                {code ? (
                                                    <code className="small text-muted">{code}</code>
                                                ) : (
                                                    <span className="badge bg-warning text-dark">no slug</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-lg-5">
                        <div className="card">
                            <div className="card-body">
                                <div className="row g-2 mb-3">
                                    <div className="col-7">
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
                                    <div className="col-5 d-flex align-items-end">
                                        <div className="form-check">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id="qr-batch-caption"
                                                checked={showCaption}
                                                onChange={(e) => setShowCaption(e.target.checked)}
                                            />
                                            <label className="form-check-label small" htmlFor="qr-batch-caption">
                                                Captions
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {unprintable > 0 && (
                                    <div className="alert alert-warning py-2 small">
                                        {unprintable} selected record{unprintable === 1 ? " has" : "s have"} no
                                        slug and will be skipped.
                                    </div>
                                )}

                                {selectedList.length === 0 && (
                                    <p className="text-muted small mb-0">
                                        Select records on the left to preview their codes.
                                    </p>
                                )}

                                <div className="d-flex flex-wrap gap-3">
                                    {selectedList.map(({ key, kind, entity }) => (
                                        <QrPreviewCard
                                            key={key}
                                            kind={kind}
                                            entity={entity}
                                            base={base}
                                            onRemove={() => toggle(kind, entity)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

function QrPreviewCard({ kind, entity, base, onRemove }) {
    const code = qrCodeFor(kind, entity);
    const title = QR_KINDS[kind]?.titleOf(entity) || "";
    const url = buildQrUrl(base, kind, entity);
    const { exportRef, downloadPng, downloadSvg } = useQrDownload({ value: url, title, code });

    return (
        <div className="border rounded p-2 text-center" style={{ width: 150 }}>
            <div ref={exportRef}>
                <QrImage value={url} size={110} />
                <QrExportSource value={url} />
            </div>
            <div className="small text-truncate mt-1" title={title}>{title}</div>
            <div className="small text-muted font-monospace text-truncate" title={code}>{code || "—"}</div>
            <div className="btn-group btn-group-sm mt-2 w-100">
                <button className="btn btn-outline-secondary" onClick={downloadPng} disabled={!url} title={`Download ${qrFileStem(title, code)}-qr.png`}>
                    PNG
                </button>
                <button className="btn btn-outline-secondary" onClick={downloadSvg} disabled={!url}>
                    SVG
                </button>
                <button className="btn btn-outline-danger" onClick={onRemove} title="Remove">
                    <i className="fas fa-times" />
                </button>
            </div>
        </div>
    );
}
