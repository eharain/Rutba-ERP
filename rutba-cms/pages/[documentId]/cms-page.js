import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { BrandGroupsEndpoints, CategoryGroupsEndpoints, CmsFootersEndpoints, CmsPagesEndpoints, MediaUtilsEndpoints, ProductGroupsEndpoints, SeoMetasEndpoints } from "@rutba/api-provider/endpoints";
import MarkdownEditor from "@rutba/pos-shared/components/MarkdownEditor";
import FileView from "@rutba/pos-shared/components/FileView";
import Link from "next/link";
import { useToast } from "../../components/Toast";
import GroupPickerTabs from "../../components/GroupPickerTabs";
import PagePickerTabs from "../../components/PagePickerTabs";
import RelationPickerTabs from "../../components/RelationPickerTabs";
import EnumSelect from "../../components/EnumSelect";
import InlineSeoPanel from "../../components/InlineSeoPanel";
import SectionOrderList from "../../components/SectionOrderList";
import { persistSeoMeta } from "../../components/SeoMetaFields";
import { toOrderedRelation } from "../../components/orderedRelation";

// Sections in their default top-to-bottom order. The numeric priority
// stored on the cms-page record is just the index of the key in this
// (post-reorder) array, so the public renderer can sort by priority.
const DEFAULT_SECTION_ORDER = [
    "featured_image",
    "excerpt",
    "content",
    "product_groups",
    "gallery",
    "related_pages",
];

const SECTION_LABELS = {
    featured_image: "Featured Image",
    excerpt: "Excerpt",
    content: "Content",
    product_groups: "Product Groups",
    gallery: "Gallery",
    related_pages: "Related Pages",
};

// Read the stored priority fields off the loaded page and produce the
// section keys in ascending-priority order. Missing priorities fall back
// to the position in DEFAULT_SECTION_ORDER.
function deriveSectionOrder(page) {
    if (!page) return DEFAULT_SECTION_ORDER.slice();
    const rank = (key, fallback) => {
        const field = `${key}_priority`;
        const v = page[field];
        return typeof v === "number" ? v : fallback;
    };
    return DEFAULT_SECTION_ORDER
        .map((key, idx) => ({ key, rank: rank(key, idx) }))
        .sort((a, b) => a.rank - b.rank)
        .map(s => s.key);
}

// Inverse of deriveSectionOrder: map an ordered section-key array back to
// the individual *_priority fields the schema stores.
function sectionOrderToPriorities(order) {
    const out = {};
    order.forEach((key, idx) => { out[`${key}_priority`] = idx; });
    return out;
}

export default function CmsPageDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const isNew = documentId === "new";

    const [page, setPage] = useState(null);
    const [isPublished, setIsPublished] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();

    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [content, setContent] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [pageType, setPageType] = useState("shop");
    const [sortOrder, setSortOrder] = useState(0);
    const [enableContactForm, setEnableContactForm] = useState(false);

    const [selectedBrandGroupIds, setSelectedBrandGroupIds] = useState([]);
    const [selectedCategoryGroupIds, setSelectedCategoryGroupIds] = useState([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [selectedRelatedIds, setSelectedRelatedIds] = useState([]);
    const [footerId, setFooterId] = useState("");

    const [sectionOrder, setSectionOrder] = useState(DEFAULT_SECTION_ORDER);

    const [featuredImageId, setFeaturedImageId] = useState(null);
    const [backgroundImageId, setBackgroundImageId] = useState(null);
    const [galleryIds, setGalleryIds] = useState([]);

    // SEO — lives in the related seo-meta record (cms-page has only the relation now)
    const [seoMeta, setSeoMeta] = useState(null);

    const [allGroups, setAllGroups] = useState([]);
    const [allBrandGroups, setAllBrandGroups] = useState([]);
    const [allCategoryGroups, setAllCategoryGroups] = useState([]);
    const [allPages, setAllPages] = useState([]);
    const [allFooters, setAllFooters] = useState([]);

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        Promise.all([
            CmsPagesEndpoints.byIdDraft(documentId, {
                populate: {
                    featured_image: true, gallery: true, background_image: true,
                    hero_product_groups: true, brand_groups: true, category_groups: true,
                    product_groups: true, related_pages: true, footer: true,
                    seo_meta: { populate: { og_image: true } },
                },
            }),
            CmsPagesEndpoints.byIdPublished(documentId, { fields: ["documentId"] }).catch(() => ({ data: null })),
        ])
            .then(([draftRes, pubRes]) => {
                const p = draftRes.data || draftRes;
                setPage(p);
                setIsPublished(!!(pubRes.data));
                setTitle(p.title || "");
                setSlug(p.slug || "");
                setContent(p.content || "");
                setExcerpt(p.excerpt || "");
                setPageType(p.page_type || "shop");
                setSortOrder(p.sort_order ?? 0);
                setEnableContactForm(!!p.enable_contact_form);
                setSelectedBrandGroupIds((p.brand_groups || []).map(bg => bg.documentId));
                setSelectedCategoryGroupIds((p.category_groups || []).map(cg => cg.documentId));
                setSelectedGroupIds((p.product_groups || []).map(g => g.documentId));
                setSelectedRelatedIds((p.related_pages || []).map(rp => rp.documentId));
                setFooterId(p.footer?.documentId || "");
                setSectionOrder(deriveSectionOrder(p));
                setFeaturedImageId(p.featured_image?.id || null);
                setBackgroundImageId(p.background_image?.id || null);
                setSeoMeta(p.seo_meta || null);
                setGalleryIds((p.gallery || []).map(g => g.id));
            })
            .catch(err => console.error("Failed to load page", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const loadPickers = useCallback(async () => {
        if (!jwt) return;
        try {
            const [groupsRes, brandGroupsRes, categoryGroupsRes, pagesRes, footersRes] = await Promise.all([
                ProductGroupsEndpoints.listDraft({ pagination: { pageSize: 100 }, sort: ["name:asc"] }),
                BrandGroupsEndpoints.listDraft({ pagination: { pageSize: 100 }, sort: ["sort_order:asc", "name:asc"] }),
                CategoryGroupsEndpoints.listDraft({ pagination: { pageSize: 100 }, sort: ["sort_order:asc", "name:asc"] }),
                CmsPagesEndpoints.listDraft({ pageSize: 100, sort: ["title:asc"] }),
                CmsFootersEndpoints.listDraft({ pagination: { pageSize: 100 }, sort: ["name:asc"] }),
            ]);
            setAllGroups(groupsRes.data || []);
            setAllBrandGroups(brandGroupsRes.data || []);
            setAllCategoryGroups(categoryGroupsRes.data || []);
            setAllPages((pagesRes.data || []).filter(p => p.documentId !== documentId));
            setAllFooters(footersRes.data || []);
        } catch (err) {
            console.error("Failed to load picker data", err);
        }
    }, [jwt, documentId]);

    useEffect(() => { loadPickers(); }, [loadPickers]);

    const toggleBrandGroup = (docId) => {
        setSelectedBrandGroupIds(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const toggleCategoryGroup = (docId) => {
        setSelectedCategoryGroupIds(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const toggleGroup = (docId) => {
        setSelectedGroupIds(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const toggleRelated = (docId) => {
        setSelectedRelatedIds(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const saveSeoMeta = (entityDocumentId) =>
        persistSeoMeta({
            seoMeta,
            setSeoMeta,
            entityType: "cms-page",
            entityDocumentId,
            onError: () => toast("Page saved, but SEO meta failed.", "warning"),
        });

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                data: {
                    title,
                    content,
                    excerpt,
                    page_type: pageType,
                    sort_order: sortOrder,
                    enable_contact_form: !!enableContactForm,
                    brand_groups: toOrderedRelation(selectedBrandGroupIds),
                    category_groups: toOrderedRelation(selectedCategoryGroupIds),
                    product_groups: toOrderedRelation(selectedGroupIds),
                    related_pages: toOrderedRelation(selectedRelatedIds),
                    footer: footerId || null,
                    ...sectionOrderToPriorities(sectionOrder),
                },
            };
            // Only include media when adding/keeping; omit when null to avoid affecting published
            if (featuredImageId) payload.data.featured_image = featuredImageId;
            if (backgroundImageId) payload.data.background_image = backgroundImageId;
            if (galleryIds.length > 0) payload.data.gallery = galleryIds;
            if (isNew) {
                payload.data.slug = slug || title.toLowerCase().replace(/\s+/g, "-");
                const res = await CmsPagesEndpoints.create(payload.data);
                const created = res.data || res;
                // afterCreate lifecycle creates the seo-meta sidecar; redirect, the edit
                // screen will then pick up + persist any in-form seo edits separately.
                router.push(`/${created.documentId}/cms-page`);
            } else {
                await CmsPagesEndpoints.updateDraft(documentId, payload.data);
                await saveSeoMeta(documentId);
                toast("Draft saved!", "success");
            }
        } catch (err) {
            console.error("Failed to save page", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        setSaving(true);
        try {
            // Save draft first, then publish
            const payload = {
                data: {
                    title,
                    content,
                    excerpt,
                    page_type: pageType,
                    sort_order: sortOrder,
                    enable_contact_form: !!enableContactForm,
                    brand_groups: toOrderedRelation(selectedBrandGroupIds),
                    category_groups: toOrderedRelation(selectedCategoryGroupIds),
                    product_groups: toOrderedRelation(selectedGroupIds),
                    related_pages: toOrderedRelation(selectedRelatedIds),
                    footer: footerId || null,
                    ...sectionOrderToPriorities(sectionOrder),
                    featured_image: featuredImageId || null,
                    background_image: backgroundImageId || null,
                    gallery: galleryIds.length > 0 ? galleryIds : null,
                },
            };
            await CmsPagesEndpoints.updateDraft(documentId, payload.data);
            await saveSeoMeta(documentId);
            await CmsPagesEndpoints.publish(documentId);
            setIsPublished(true);
            toast("Page saved & published!", "success");
        } catch (err) {
            console.error("Failed to publish page", err);
            toast("Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setSaving(true);
        try {
            await CmsPagesEndpoints.unpublish(documentId);
            setIsPublished(false);
            toast("Page unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish page", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDiscardDraft = async () => {
        if (!confirm("Save current draft and load the published version into the editor?")) return;
        setSaving(true);
        try {
            // Save current form state as draft so nothing is lost
            const discardPayload = {
                data: {
                    title, content, excerpt,
                    page_type: pageType, sort_order: sortOrder,
                    enable_contact_form: !!enableContactForm,
                    brand_groups: toOrderedRelation(selectedBrandGroupIds),
                    category_groups: toOrderedRelation(selectedCategoryGroupIds),
                    product_groups: toOrderedRelation(selectedGroupIds),
                    related_pages: toOrderedRelation(selectedRelatedIds),
                    footer: footerId || null,
                },
            };
            if (featuredImageId) discardPayload.data.featured_image = featuredImageId;
            if (backgroundImageId) discardPayload.data.background_image = backgroundImageId;
            if (galleryIds.length > 0) discardPayload.data.gallery = galleryIds;
            await CmsPagesEndpoints.updateDraft(documentId, discardPayload.data);
            // Load the published version into the form
            const res = await CmsPagesEndpoints.byIdPublished(documentId, {
                populate: ["featured_image", "gallery", "background_image", "hero_product_groups", "brand_groups", "category_groups", "product_groups", "related_pages", "footer"],
            });
            const p = res.data || res;
            if (!p) { toast("No published version found.", "warning"); return; }
            setTitle(p.title || "");
            setContent(p.content || "");
            setExcerpt(p.excerpt || "");
            setPageType(p.page_type || "shop");
            setSortOrder(p.sort_order ?? 0);
            setEnableContactForm(!!p.enable_contact_form);
            setSelectedBrandGroupIds((p.brand_groups || []).map(bg => bg.documentId));
            setSelectedCategoryGroupIds((p.category_groups || []).map(cg => cg.documentId));
            setSelectedGroupIds((p.product_groups || []).map(g => g.documentId));
            setSelectedRelatedIds((p.related_pages || []).map(rp => rp.documentId));
            setFooterId(p.footer?.documentId || "");
            setSectionOrder(deriveSectionOrder(p));
            setFeaturedImageId(p.featured_image?.id || null);
            setBackgroundImageId(p.background_image?.id || null);
            setGalleryIds((p.gallery || []).map(g => g.id));
            setPage(p);
            toast("Draft saved. Showing published version — click Save Draft to overwrite.", "success");
        } catch (err) {
            console.error("Failed to load published version", err);
            toast("Failed to load published version.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this page?")) return;
        try {
            await CmsPagesEndpoints.del(documentId);
            router.push("/pages");
        } catch (err) {
            console.error("Failed to delete page", err);
            toast("Failed to delete.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/pages">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Page" : "Edit Page"}</h2>
                    {!isNew && isPublished && <span className="badge bg-success ms-2 align-self-center">Published</span>}
                    {!isNew && page && !isPublished && <span className="badge bg-secondary ms-2 align-self-center">Draft</span>}
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
                        {!isNew && isPublished && (
                            <button className="btn btn-sm btn-outline-warning" onClick={handleDiscardDraft} disabled={saving}>
                                <i className="fas fa-undo me-1"></i>Load Published
                            </button>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving..." : isNew ? "Create Page" : "Save Draft"}
                        </button>
                        {!isNew && (
                            <button className="btn btn-sm btn-success" onClick={handlePublish} disabled={saving}>
                                <i className="fas fa-upload me-1"></i>{saving ? "Publishing..." : "Save & Publish"}
                            </button>
                        )}
                    </div>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !isNew && !page && (
                    <div className="alert alert-warning">Page not found.</div>
                )}

                {!loading && (isNew || page) && (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Title</label>
                                        <input type="text" className="form-control" value={title} onChange={e => setTitle(e.target.value)} />
                                    </div>
                                    {isNew && (
                                        <div className="mb-3">
                                            <label className="form-label">Slug</label>
                                            <input type="text" className="form-control" value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto-generated from title" />
                                            <div className="form-text">Use <code>index</code> for the home page.</div>
                                        </div>
                                    )}
                                    <div className="mb-3">
                                        <label className="form-label">Excerpt (Markdown)</label>
                                        <MarkdownEditor value={excerpt} onChange={e => setExcerpt(e.target.value)} name="excerpt" rows={3} placeholder="Short summary..." />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Content (Markdown)</label>
                                        <MarkdownEditor value={content} onChange={e => setContent(e.target.value)} name="content" rows={12} />
                                        <div className="form-text mt-2">
                                            Tip for FAQ pages: use <code>### Q:</code> for questions and <code>A:</code> for answers, or insert FAQ blocks from the editor toolbar.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Category Groups — hidden for shop pages (use product groups with layouts instead) */}
                            {pageType !== "shop" && (
                                <RelationPickerTabs
                                    title="Category Groups"
                                    icon="fas fa-folder"
                                    description="Each group renders as a section using the group name as the heading."
                                    selectedIds={selectedCategoryGroupIds}
                                    allItems={allCategoryGroups}
                                    onToggle={toggleCategoryGroup}
                                    onReorder={setSelectedCategoryGroupIds}
                                    onRemoveAll={() => setSelectedCategoryGroupIds([])}
                                    getEditHref={(cg) => `/${cg.documentId}/category-group`}
                                />
                            )}

                            {/* Product Groups */}
                            <GroupPickerTabs
                                allGroups={allGroups}
                                selectedGroupIds={selectedGroupIds}
                                onToggle={toggleGroup}
                                onReorder={setSelectedGroupIds}
                                onRemoveAll={() => setSelectedGroupIds([])}
                            />

                            {/* Related Pages */}
                            <PagePickerTabs
                                allPages={allPages}
                                selectedPageIds={selectedRelatedIds}
                                onToggle={toggleRelated}
                                onReorder={setSelectedRelatedIds}
                                onRemoveAll={() => setSelectedRelatedIds([])}
                            />
                        </div>

                        <div className="col-md-4">
                            <InlineSeoPanel
                                seoMeta={seoMeta}
                                onChange={(patch) => setSeoMeta((prev) => ({ ...(prev || {}), ...patch }))}
                                parentTitle={title}
                                parentIsNew={isNew}
                            />

                            <div className="card mb-3">
                                <div className="card-header">Settings</div>
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Page Type</label>
                                        <EnumSelect
                                            name="cms-page"
                                            field="page_type"
                                            value={pageType}
                                            onChange={e => setPageType(e.target.value)}
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Sort Order</label>
                                        <input type="number" className="form-control" value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value) || 0)} />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label" htmlFor="enable-contact-form">Contact Form</label>
                                        <select
                                            id="enable-contact-form"
                                            className="form-select"
                                            value={enableContactForm ? "true" : "false"}
                                            onChange={(e) => setEnableContactForm(e.target.value === "true")}
                                        >
                                            <option value="false">Disabled</option>
                                            <option value="true">Enabled</option>
                                        </select>
                                        <div className="form-text">Useful for contact-us pages and support landing pages.</div>
                                    </div>
                                    <hr />
                                    <p className="text-muted small mb-2">
                                        <i className="fas fa-sort me-1"></i>Section Order
                                        <span className="text-muted ms-1">(drag to reorder — top renders first on the page)</span>
                                    </p>
                                    <SectionOrderList
                                        sections={sectionOrder.map(key => ({
                                            key,
                                            label: SECTION_LABELS[key] || key,
                                            present: key === "featured_image" ? !!featuredImageId
                                                : key === "excerpt" ? !!excerpt
                                                : key === "content" ? !!content
                                                : key === "product_groups" ? selectedGroupIds.length > 0
                                                : key === "gallery" ? galleryIds.length > 0
                                                : key === "related_pages" ? selectedRelatedIds.length > 0
                                                : true,
                                        }))}
                                        onReorder={setSectionOrder}
                                    />
                                    {!isNew && page?.slug && (
                                        <div className="mb-3">
                                            <label className="form-label">Slug</label>
                                            <code className="d-block">{page.slug}</code>
                                        </div>
                                    )}
                                    {!isNew && isPublished && <span className="badge bg-success">Published</span>}
                                    {!isNew && page && !isPublished && <span className="badge bg-secondary">Draft</span>}
                                                </div>
                                            </div>
                                            <div className="card mb-3">
                                                <div className="card-header"><i className="fas fa-shoe-prints me-2"></i>Footer</div>
                                                <div className="card-body">
                                                    <select className="form-select" value={footerId} onChange={e => setFooterId(e.target.value)}>
                                                        <option value="">-- No footer --</option>
                                                        {allFooters.map(f => (
                                                            <option key={f.documentId} value={f.documentId}>{f.name}</option>
                                                        ))}
                                                    </select>
                                                    <div className="form-text">Attach a footer to display contact, social links and pinned pages.</div>
                                                </div>
                                            </div>
                            {!isNew && page && (
                                <>
                                    <div className="card mb-3">
                                        <div className="card-header"><i className="fas fa-image me-2"></i>Featured Image</div>
                                        <div className="card-body">
                                            <FileView
                                                single={page.featured_image}
                                                refName="cms-page"
                                                refId={page.id}
                                                refDocumentId={documentId}
                                                refDraft
                                                field="featured_image"
                                                name={title}
                                                onFileChange={(f, file) => setFeaturedImageId(file?.id || null)}
                                            />
                                        </div>
                                    </div>
                                    <div className="card mb-3">
                                        <div className="card-header"><i className="fas fa-image me-2"></i>Background Image</div>
                                        <div className="card-body">
                                            <FileView
                                                single={page.background_image}
                                                refName="cms-page"
                                                refId={page.id}
                                                refDocumentId={documentId}
                                                refDraft
                                                field="background_image"
                                                name={title}
                                                onFileChange={(f, file) => setBackgroundImageId(file?.id || null)}
                                            />
                                            <div className="form-text">Full-page background image rendered behind the page content.</div>
                                        </div>
                                    </div>
                                    <div className="card mb-3">
                                        <div className="card-header"><i className="fas fa-images me-2"></i>Gallery</div>
                                        <div className="card-body">
                                            <FileView
                                                gallery={page.gallery || []}
                                                multiple
                                                refName="cms-page"
                                                refId={page.id}
                                                refDocumentId={documentId}
                                                refDraft
                                                field="gallery"
                                                name={title}
                                                onFileChange={(f, files) => setGalleryIds((files || []).map(g => g.id).filter(Boolean))}
                                            />
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