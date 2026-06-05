import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CmsPagesEndpoints, CmsPageGroupsEndpoints } from "@rutba/api-provider/endpoints";
import FileView from "@rutba/pos-shared/components/FileView";
import MarkdownEditor from "@rutba/pos-shared/components/MarkdownEditor";
import Link from "next/link";
import { useToast } from "../../components/Toast";
import PagePickerTabs from "../../components/PagePickerTabs";
import InlineSeoPanel from "../../components/InlineSeoPanel";
import { persistSeoMeta } from "../../components/SeoMetaFields";
import { toOrderedRelation } from "../../components/orderedRelation";
import { buildPageGroupWebUrl } from "../../lib/cmsPageWebUrl";

const LAYOUT_OPTIONS = [
    { value: "flip-grid", label: "Flip Cards (grid)" },
    { value: "grid", label: "Static Grid" },
    { value: "carousel", label: "Carousel" },
];

export default function CmsPageGroupDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [group, setGroup] = useState(null);
    const [isPublished, setIsPublished] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();
    const isNew = !documentId || documentId === "new";

    const [name, setName] = useState("");
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [layout, setLayout] = useState("flip-grid");
    const [columns, setColumns] = useState(3);
    const [sortOrder, setSortOrder] = useState(0);
    const [selectedPageIds, setSelectedPageIds] = useState([]);
    const [allCmsPages, setAllCmsPages] = useState([]);
    const [seoMeta, setSeoMeta] = useState(null);

    const applyGroup = (g) => {
        setName(g.name || "");
        setTitle(g.title || "");
        setSlug(g.slug || "");
        setExcerpt(g.excerpt || "");
        setLayout(g.layout || "flip-grid");
        setColumns(g.columns ?? 3);
        setSortOrder(g.sort_order ?? 0);
        setSelectedPageIds((g.pages || []).map(p => p.documentId));
    };

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        Promise.all([
            CmsPageGroupsEndpoints.byIdDraft(documentId, {
                populate: {
                    cover_image: true,
                    pages: true,
                    seo_meta: { populate: { og_image: true } },
                },
            }),
            CmsPageGroupsEndpoints.byIdPublished(documentId, { fields: ["documentId"] }).catch(() => ({ data: null })),
        ])
            .then(([draftRes, pubRes]) => {
                const g = draftRes.data || draftRes;
                setGroup(g);
                setIsPublished(!!(pubRes.data));
                applyGroup(g);
                setSeoMeta(g.seo_meta || null);
            })
            .catch(err => console.error("Failed to load page group", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    // Load CMS pages for the picker.
    useEffect(() => {
        if (!jwt) return;
        CmsPagesEndpoints.listDraft({ sort: ["title:asc"] })
            .then(res => setAllCmsPages(res?.data || res || []))
            .catch(err => console.error("Failed to load CMS pages", err));
    }, [jwt]);

    const saveSeoMeta = (entityDocumentId) =>
        persistSeoMeta({
            seoMeta,
            setSeoMeta,
            entityType: "cms-page-group",
            entityDocumentId,
            onError: () => toast("Group saved, but SEO meta failed.", "warning"),
        });

    const buildData = () => ({
        name,
        title,
        excerpt,
        layout,
        columns,
        sort_order: sortOrder,
        pages: toOrderedRelation(selectedPageIds),
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            const data = buildData();
            if (isNew) {
                data.slug = slug || name.toLowerCase().replace(/\s+/g, "-");
                const res = await CmsPageGroupsEndpoints.create(data);
                const created = res.data || res;
                router.push(`/${created.documentId}/cms-page-group`);
            } else {
                await CmsPageGroupsEndpoints.updateDraft(documentId, data);
                await saveSeoMeta(documentId);
                toast("Draft saved!", "success");
            }
        } catch (err) {
            console.error("Failed to save page group", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        setSaving(true);
        try {
            await CmsPageGroupsEndpoints.updateDraft(documentId, buildData());
            await saveSeoMeta(documentId);
            await CmsPageGroupsEndpoints.publish(documentId);
            setIsPublished(true);
            toast("Page group saved & published!", "success");
        } catch (err) {
            console.error("Failed to publish page group", err);
            toast("Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setSaving(true);
        try {
            await CmsPageGroupsEndpoints.unpublish(documentId);
            setIsPublished(false);
            toast("Page group unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish page group", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this page group?")) return;
        try {
            await CmsPageGroupsEndpoints.del(documentId);
            router.push("/cms-page-groups");
        } catch (err) {
            console.error("Failed to delete page group", err);
            toast("Failed to delete.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/cms-page-groups">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Page Group" : "Edit Page Group"}</h2>
                    {!isNew && isPublished && <span className="badge bg-success ms-2 align-self-center">Published</span>}
                    {!isNew && group && !isPublished && <span className="badge bg-secondary ms-2 align-self-center">Draft</span>}
                    <div className="ms-auto d-flex gap-2">
                        {!isNew && (
                            <button className="btn btn-sm btn-outline-danger" onClick={handleDelete}>
                                <i className="fas fa-trash me-1"></i>Delete
                            </button>
                        )}
                        {!isNew && isPublished && (
                            <button className="btn btn-sm btn-outline-secondary" onClick={handleUnpublish} disabled={saving}>
                                <i className="fas fa-eye-slash me-1"></i>Unpublish
                            </button>
                        )}
                        {!isNew && group?.slug && buildPageGroupWebUrl(group) && (
                            <a className="btn btn-sm btn-outline-info" href={buildPageGroupWebUrl(group)} target="_blank" rel="noopener noreferrer" title="Open on the storefront">
                                <i className="fas fa-eye me-1"></i>View
                            </a>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving…" : isNew ? "Create Group" : "Save Draft"}
                        </button>
                        {!isNew && (
                            <button className="btn btn-sm btn-success" onClick={handlePublish} disabled={saving}>
                                <i className="fas fa-upload me-1"></i>{saving ? "Publishing…" : "Save & Publish"}
                            </button>
                        )}
                    </div>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !isNew && !group && (
                    <div className="alert alert-warning">Page group not found.</div>
                )}

                {!loading && (isNew || group) && (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Name</label>
                                        <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Group name" />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Title</label>
                                        <input type="text" className="form-control" value={title} onChange={e => setTitle(e.target.value)} placeholder="Display title (optional)" />
                                    </div>
                                    {isNew && (
                                        <div className="mb-3">
                                            <label className="form-label">Slug</label>
                                            <input type="text" className="form-control" value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto-generated from name" />
                                        </div>
                                    )}
                                    <div className="mb-3">
                                        <label className="form-label">Excerpt (Markdown)</label>
                                        <MarkdownEditor value={excerpt} onChange={e => setExcerpt(e.target.value)} name="excerpt" rows={3} placeholder="Short intro shown above the cards..." />
                                    </div>
                                </div>
                            </div>

                            <PagePickerTabs
                                allPages={allCmsPages}
                                selectedPageIds={selectedPageIds}
                                onToggle={(docId) => setSelectedPageIds(prev =>
                                    prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
                                )}
                                onReorder={setSelectedPageIds}
                                onRemoveAll={() => setSelectedPageIds([])}
                                title="Pages in this Group"
                                icon="fas fa-clone"
                                description="These pages render as flip cards (front: featured image + title, back: excerpt + open link)."
                            />
                        </div>

                        <div className="col-md-4">
                            <InlineSeoPanel
                                seoMeta={seoMeta}
                                onChange={(patch) => setSeoMeta((prev) => ({ ...(prev || {}), ...patch }))}
                                parentTitle={title || name}
                                parentIsNew={isNew}
                            />
                            <div className="card mb-3">
                                <div className="card-header">Display</div>
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Layout</label>
                                        <select className="form-select" value={layout} onChange={e => setLayout(e.target.value)}>
                                            {LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Columns</label>
                                        <input type="number" className="form-control" value={columns} min={2} max={6} onChange={e => setColumns(parseInt(e.target.value) || 3)} />
                                        <small className="text-muted">Cards per row on desktop (2–6).</small>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Sort Order</label>
                                        <input type="number" className="form-control" value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value) || 0)} />
                                        <small className="text-muted">Lower = listed first.</small>
                                    </div>
                                </div>
                            </div>

                            {!isNew && group && (
                                <>
                                    <div className="card mb-3">
                                        <div className="card-header">Cover Image</div>
                                        <div className="card-body">
                                            <FileView
                                                single={group.cover_image}
                                                refName="cms-page-group"
                                                refId={group.id}
                                                refDocumentId={documentId}
                                                refDraft
                                                field="cover_image"
                                                name={name}
                                            />
                                        </div>
                                    </div>
                                    <div className="card mb-3">
                                        <div className="card-header">Info</div>
                                        <div className="card-body">
                                            {group.slug && (
                                                <div className="mb-2">
                                                    <label className="form-label mb-0">Slug</label>
                                                    <code className="d-block">{group.slug}</code>
                                                </div>
                                            )}
                                            {isPublished ? <span className="badge bg-success">Published</span> : <span className="badge bg-secondary">Draft</span>}
                                        </div>
                                    </div>
                                </>
                            )}
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
