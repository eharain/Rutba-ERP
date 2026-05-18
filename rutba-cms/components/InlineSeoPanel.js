import { useState } from "react";
import Link from "next/link";
import SeoMetaFields from "./SeoMetaFields";

/**
 * InlineSeoPanel — collapsible SEO & Social card, identical look across every
 * entity edit page (cms-page, product, category, brand, …). Renders the shared
 * SeoMetaFields inside; surfaces a "customised" badge and a deep-link to the
 * standalone /[documentId]/seo-meta editor.
 *
 * Props:
 *   seoMeta        — populated seo-meta record or null/undefined.
 *   onChange       — (patch) => void; applied on top of seoMeta.
 *   parentTitle    — string, used as Meta Title placeholder.
 *   parentIsNew    — when true, the entity hasn't been created yet — show a
 *                    "save first" hint instead of the form (no sidecar yet).
 *   defaultOpen    — open on mount. Default false.
 */
export default function InlineSeoPanel({
    seoMeta,
    onChange,
    parentTitle = "",
    parentIsNew = false,
    defaultOpen = false,
}) {
    const [open, setOpen] = useState(defaultOpen);
    const customised = !!(
        seoMeta?.meta_title ||
        seoMeta?.meta_description ||
        (seoMeta?.keywords?.length > 0) ||
        seoMeta?.og_image ||
        seoMeta?.noindex
    );

    return (
        <div className="card mb-3">
            <div
                className="card-header d-flex align-items-center justify-content-between"
                style={{ cursor: "pointer" }}
                onClick={() => setOpen((v) => !v)}
            >
                <span>
                    <i className={`fas fa-chevron-${open ? "down" : "right"} me-2`}></i>
                    SEO &amp; Social
                </span>
                <span className="d-inline-flex gap-2 align-items-center">
                    {customised && <span className="badge bg-success">customised</span>}
                    {seoMeta?.documentId && (
                        <Link
                            href={`/${seoMeta.documentId}/seo-meta`}
                            onClick={(e) => e.stopPropagation()}
                            className="btn btn-sm btn-outline-secondary"
                            title="Open standalone editor"
                        >
                            <i className="fas fa-external-link-alt"></i>
                        </Link>
                    )}
                </span>
            </div>
            {open && (
                <div className="card-body">
                    {parentIsNew ? (
                        <div className="text-muted small fst-italic">
                            Save this record first — its SEO meta is created automatically and editable here.
                        </div>
                    ) : (
                        <SeoMetaFields
                            value={seoMeta || { keywords: [] }}
                            onChange={onChange}
                            parentTitle={parentTitle}
                            refId={seoMeta?.id}
                            refDocumentId={seoMeta?.documentId}
                            readOnlyOgImage={!seoMeta?.documentId}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
