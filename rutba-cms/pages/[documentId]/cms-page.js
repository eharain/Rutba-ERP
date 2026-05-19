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
import PageLayoutEditor from "../../components/PageLayoutEditor";
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

const FIXED_SECTIONS = ["featured_image", "excerpt", "content", "gallery", "related_pages"];

const SECTION_LABELS = {
    featured_image: "Featured Image",
    excerpt: "Excerpt",
    content: "Content",
    gallery: "Gallery",
    related_pages: "Related Pages",
};

const DEFAULT_PRIORITIES = {
    featured_image: 0,
    excerpt: 10,
    content: 20,
    product_groups: 30,
    gallery: 40,
    related_pages: 50,
};

// Reconstruct the visual flat layout from the stored *_priority fields
// and the connected product groups. Sections sit on their priority
// slot; group rows fill the integer indices >= product_groups_priority
// that no section has claimed, in relation _ord order. Matches the
// public renderer in rutba-web exactly so the editor preview never lies.
function buildLayoutRows(priorities, groupIds, groupsByDocId) {
    const slots = FIXED_SECTIONS.map(key => ({
        kind: "section",
        key,
        priority: priorities[key] ?? DEFAULT_PRIORITIES[key],
    })).sort((a, b) => a.priority - b.priority);

    const groupsStart = priorities.product_groups ?? DEFAULT_PRIORITIES.product_groups;
    const queue = (groupIds || []).map((id) => ({
        kind: "group",
        documentId: id,
        data: groupsByDocId?.[id],
    }));

    const sectionAt = new Map(slots.map(s => [s.priority, s]));
    const maxSectionPriority = slots.length > 0 ? slots[slots.length - 1].priority : -1;
    const upper = Math.max(maxSectionPriority, groupsStart + queue.length - 1);

    const rows = [];
    for (let i = 0; i <= upper; i++) {
        const sec = sectionAt.get(i);
        if (sec) { rows.push(sec); continue; }
        if (i >= groupsStart && queue.length > 0) rows.push(queue.shift());
    }
    rows.push(...queue);
    return rows;
}

// Inverse of buildLayoutRows: walk the flat rows the editor produced
// and project each row's index onto the stored fields. Sections get
// *_priority = their index in the row list; the product_groups_priority
// becomes the index of the FIRST group row so the renderer recovers
// the same interleaving from the priorities + relation _ord alone.
function projectRowsToFields(rows) {
    const priorities = {};
    const groupOrder = [];
    let firstGroupAt = -1;
    rows.forEach((row, idx) => {
        if (row.kind === "group") {
            if (firstGroupAt === -1) firstGroupAt = idx;
            groupOrder.push(row.documentId);
            return;
        }
        priorities[`${row.key}_priority`] = idx;
    });
    priorities.product_groups_priority = firstGroupAt === -1 ? rows.length : firstGroupAt;
    return { priorities, groupOrder };
}

// Read the stored priorities off a loaded page into the editor's
// in-memory `priorities` shape (section key → integer, plus a
// `product_groups` entry for the group block's start index).
function readPriorities(page) {
    return {
        featured_image: typeof page?.featured_image_priority === "number" ? page.featured_image_priority : DEFAULT_PRIORITIES.featured_image,
        excerpt: typeof page?.excerpt_priority === "number" ? page.excerpt_priority : DEFAULT_PRIORITIES.excerpt,
        content: typeof page?.content_priority === "number" ? page.content_priority : DEFAULT_PRIORITIES.content,
        product_groups: typeof page?.product_groups_priority === "number" ? page.product_groups_priority : DEFAULT_PRIORITIES.product_groups,
        gallery: typeof page?.gallery_priority === "number" ? page.gallery_priority : DEFAULT_PRIORITIES.gallery,
        related_pages: typeof page?.related_pages_priority === "number" ? page.related_pages_priority : DEFAULT_PRIORITIES.related_pages,
    };
}

export default function CmsPageDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const isNew = !documentId || documentId === "new";

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

    const [priorities, setPriorities] = useState(() => ({ ...DEFAULT_PRIORITIES }));

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
                setPriorities(readPriorities(p));
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
                    featured_image_priority: priorities.featured_image,
                    excerpt_priority: priorities.excerpt,
                    content_priority: priorities.content,
                    product_groups_priority: priorities.product_groups,
                    gallery_priority: priorities.gallery,
                    related_pages_priority: priorities.related_pages,
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
                    featured_image_priority: priorities.featured_image,
                    excerpt_priority: priorities.excerpt,
                    content_priority: priorities.content,
                    product_groups_priority: priorities.product_groups,
                    gallery_priority: priorities.gallery,
                    related_pages_priority: priorities.related_pages,
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
            setPriorities(readPriorities(p));
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

                            {/* Page Layout — flat drag-sort over sections + each connected product group */}
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-sort me-2"></i>
                                    <strong>Page Layout</strong>
                                    <span className="text-muted small ms-2">drag to reorder — top renders first on the page</span>
                                </div>
                                <div className="card-body">
                                    <PageLayoutEditor
                                        rows={buildLayoutRows(
                                            priorities,
                                            selectedGroupIds,
                                            Object.fromEntries(allGroups.map(g => [g.documentId, g])),
                                        )}
                                        onReorder={(newRows) => {
                                            const { priorities: newP, groupOrder } = projectRowsToFields(newRows);
                                            setPriorities({
                                                featured_image: newP.featured_image_priority ?? priorities.featured_image,
                                                excerpt: newP.excerpt_priority ?? priorities.excerpt,
                                                content: newP.content_priority ?? priorities.content,
                                                product_groups: newP.product_groups_priority,
                                                gallery: newP.gallery_priority ?? priorities.gallery,
                                                related_pages: newP.related_pages_priority ?? priorities.related_pages,
                                            });
                                            setSelectedGroupIds(groupOrder);
                                        }}
                                        sectionLabels={SECTION_LABELS}
                                        sectionPresence={{
                                            featured_image: !!featuredImageId,
                                            excerpt: !!excerpt,
                                            content: !!content,
                                            gallery: galleryIds.length > 0,
                                            related_pages: selectedRelatedIds.length > 0,
                                        }}
                                        onRemoveGroup={toggleGroup}
                                    />
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

                            {/* Product Groups — Browse to connect; ordering lives in Page Layout above */}
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