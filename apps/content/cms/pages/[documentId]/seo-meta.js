import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { SeoMetasEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../../components/Toast";
import SeoMetaFields, { normaliseSeoMetaSavePayload } from "../../components/SeoMetaFields";

// Mirrors pos-strapi/src/utils/seo-meta-helper.js.
const ENTITY_TYPE_META = {
    "cms-page":       { route: "cms-page",       relation: "cms_page",       label: "CMS Page" },
    "product":        { route: "product",        relation: "product",        label: "Product" },
    "category":       { route: "category",       relation: "category",       label: "Category" },
    "brand":          { route: "brand",          relation: "brand",          label: "Brand" },
    "product-group":  { route: "product-group",  relation: "product_group",  label: "Product Group" },
    "brand-group":    { route: "brand-group",    relation: "brand_group",    label: "Brand Group" },
    "category-group": { route: "category-group", relation: "category_group", label: "Category Group" },
};

function getLinkedEntity(seoMeta) {
    if (!seoMeta) return null;
    const t = ENTITY_TYPE_META[seoMeta.entity_type];
    if (!t) return null;
    const rel = seoMeta[t.relation];
    if (!rel?.documentId) return null;
    return {
        documentId: rel.documentId,
        title: rel.title || rel.name || seoMeta.entity_title,
        href: `/${rel.documentId}/${t.route}`,
        label: t.label,
    };
}

export default function SeoMetaEdit() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();

    const [seoMeta, setSeoMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();

    useEffect(() => {
        if (!jwt || !documentId) return;
        SeoMetasEndpoints.byId(documentId)
            .then((res) => setSeoMeta(res.data || res))
            .catch((err) => console.error("Failed to load seo-meta", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    const linked = getLinkedEntity(seoMeta);
    const parentTitle = linked?.title || seoMeta?.entity_title || "";

    const handleSave = async () => {
        if (!seoMeta) return;
        setSaving(true);
        try {
            const payload = normaliseSeoMetaSavePayload(seoMeta, {
                entityType: seoMeta.entity_type,
                entityDocumentId: linked?.documentId,
            });
            const res = await SeoMetasEndpoints.update(documentId, payload);
            setSeoMeta(res.data || res);
            toast("Saved!", "success");
        } catch (err) {
            console.error("Failed to save", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Delete this SEO meta record? The linked entity will fall back to its title/excerpt for SEO.")) return;
        try {
            await SeoMetasEndpoints.del(documentId);
            router.push("/seo-metas");
        } catch (err) {
            console.error("Failed to delete", err);
            toast("Failed to delete.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/seo-metas">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Edit SEO Meta</h2>
                    {parentTitle && (
                        <span className="ms-3 text-muted">
                            for <strong>{parentTitle}</strong>
                            {linked?.label && <span className="ms-1 small">({linked.label})</span>}
                        </span>
                    )}
                    <div className="ms-auto d-flex gap-2">
                        {linked?.href && (
                            <Link href={linked.href} className="btn btn-sm btn-outline-info">
                                <i className="fas fa-external-link-alt me-1"></i>Open entity
                            </Link>
                        )}
                        <button className="btn btn-sm btn-outline-danger" onClick={handleDelete}>
                            <i className="fas fa-trash me-1"></i>Delete
                        </button>
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || loading}>
                            {saving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>

                {loading && <p>Loading...</p>}
                {!loading && !seoMeta && <div className="alert alert-warning">SEO meta not found.</div>}

                {!loading && seoMeta && (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-header">SEO &amp; Social</div>
                                <div className="card-body">
                                    <SeoMetaFields
                                        value={seoMeta}
                                        onChange={(patch) => setSeoMeta((prev) => ({ ...prev, ...patch }))}
                                        parentTitle={parentTitle}
                                        refId={seoMeta.id}
                                        refDocumentId={seoMeta.documentId}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="col-md-4">
                            <div className="card mb-3">
                                <div className="card-header">Linked entity</div>
                                <div className="card-body">
                                    <p className="mb-1">
                                        <span className="text-muted small">Type:</span> {linked?.label || seoMeta.entity_type || "—"}
                                    </p>
                                    <p className="mb-1">
                                        <span className="text-muted small">Title:</span> {parentTitle || "—"}
                                    </p>
                                    {linked?.href ? (
                                        <Link href={linked.href} className="btn btn-sm btn-outline-primary mt-2">
                                            <i className="fas fa-external-link-alt me-1"></i>Open linked entity
                                        </Link>
                                    ) : (
                                        <p className="text-muted small mb-0">
                                            No linked entity — this SEO meta is orphaned.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
