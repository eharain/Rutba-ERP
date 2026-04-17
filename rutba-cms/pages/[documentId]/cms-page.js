import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import MarkdownEditor from "@rutba/pos-shared/components/MarkdownEditor";
import FileView from "@rutba/pos-shared/components/FileView";
import Link from "next/link";
import { useToast } from "../../components/Toast";
import GroupPickerTabs from "../../components/GroupPickerTabs";
import PagePickerTabs from "../../components/PagePickerTabs";

const PAGE_TYPES = ["shop", "blog", "news", "info"];

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

    const [selectedBrandGroupIds, setSelectedBrandGroupIds] = useState([]);
    const [selectedCategoryGroupIds, setSelectedCategoryGroupIds] = useState([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [selectedRelatedIds, setSelectedRelatedIds] = useState([]);
    const [footerId, setFooterId] = useState("");

    const [excerptPriority, setExcerptPriority] = useState(2);
    const [featuredImagePriority, setFeaturedImagePriority] = useState(0);
    const [contentPriority, setContentPriority] = useState(98);
    const [galleryPriority, setGalleryPriority] = useState(100);
    const [relatedPagesPriority, setRelatedPagesPriority] = useState(102);

    const [featuredImageId, setFeaturedImageId] = useState(null);
    const [backgroundImageId, setBackgroundImageId] = useState(null);
    const [galleryIds, setGalleryIds] = useState([]);

    const [allGroups, setAllGroups] = useState([]);
    const [allBrandGroups, setAllBrandGroups] = useState([]);
    const [allCategoryGroups, setAllCategoryGroups] = useState([]);
    const [allPages, setAllPages] = useState([]);
    const [allFooters, setAllFooters] = useState([]);

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        Promise.all([
            authApi.get(`/cms-pages/${documentId}`, {
                status: 'draft',
                populate: ["featured_image", "gallery", "background_image", "hero_product_groups", "brand_groups", "category_groups", "product_groups", "related_pages", "footer"],
            }),
            authApi.get(`/cms-pages/${documentId}`, { status: 'published', fields: ["documentId"] }).catch(() => ({ data: null })),
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
                setSelectedBrandGroupIds((p.brand_groups || []).map(bg => bg.documentId));
                setSelectedCategoryGroupIds((p.category_groups || []).map(cg => cg.documentId));
                setSelectedGroupIds((p.product_groups || []).map(g => g.documentId));
                setSelectedRelatedIds((p.related_pages || []).map(rp => rp.documentId));
                setFooterId(p.footer?.documentId || "");
                setExcerptPriority(p.excerpt_priority ?? 2);
                setFeaturedImagePriority(p.featured_image_priority ?? 0);
                setContentPriority(p.content_priority ?? 98);
                setGalleryPriority(p.gallery_priority ?? 100);
                setRelatedPagesPriority(p.related_pages_priority ?? 102);
                setFeaturedImageId(p.featured_image?.id || null);
                setBackgroundImageId(p.background_image?.id || null);
                setGalleryIds((p.gallery || []).map(g => g.id));
            })
            .catch(err => console.error("Failed to load page", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const loadPickers = useCallback(async () => {
        if (!jwt) return;
        try {
            const [groupsRes, brandGroupsRes, categoryGroupsRes, pagesRes, footersRes] = await Promise.all([
                authApi.get("/product-groups", { status: 'draft', pagination: { pageSize: 100 }, sort: ["name:asc"] }),
                authApi.get("/brand-groups", { status: 'draft', pagination: { pageSize: 100 }, sort: ["sort_order:asc", "name:asc"] }),
                authApi.get("/category-groups", { status: 'draft', pagination: { pageSize: 100 }, sort: ["sort_order:asc", "name:asc"] }),
                authApi.get("/cms-pages", { status: 'draft', pagination: { pageSize: 100 }, sort: ["title:asc"] }),
                authApi.get("/cms-footers", { status: 'draft', pagination: { pageSize: 100 }, sort: ["name:asc"] }),
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
                    brand_groups: { set: selectedBrandGroupIds },
                    category_groups: { set: selectedCategoryGroupIds },
                    product_groups: { set: selectedGroupIds },
                    related_pages: { set: selectedRelatedIds },
                    footer: footerId || null,
                    excerpt_priority: excerptPriority,
                    featured_image_priority: featuredImagePriority,
                    content_priority: contentPriority,
                    gallery_priority: galleryPriority,
                    related_pages_priority: relatedPagesPriority,
                },
            };
            // Only include media when adding/keeping; omit when null to avoid affecting published
            if (featuredImageId) payload.data.featured_image = featuredImageId;
            if (backgroundImageId) payload.data.background_image = backgroundImageId;
            if (galleryIds.length > 0) payload.data.gallery = galleryIds;
            if (isNew) {
                payload.data.slug = slug || title.toLowerCase().replace(/\s+/g, "-");
                const res = await authApi.post("/cms-pages", payload);
                const created = res.data || res;
                router.push(`/${created.documentId}/cms-page`);
            } else {
                await authApi.put(`/cms-pages/${documentId}?status=draft`, payload);
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
                    brand_groups: { set: selectedBrandGroupIds },
                    category_groups: { set: selectedCategoryGroupIds },
                    product_groups: { set: selectedGroupIds },
                    related_pages: { set: selectedRelatedIds },
                    footer: footerId || null,
                    excerpt_priority: excerptPriority,
                    featured_image_priority: featuredImagePriority,
                    content_priority: contentPriority,
                    gallery_priority: galleryPriority,
                    related_pages_priority: relatedPagesPriority,
                    featured_image: featuredImageId || null,
                    background_image: backgroundImageId || null,
                    gallery: galleryIds.length > 0 ? galleryIds : null,
                },
            };
            await authApi.put(`/cms-pages/${documentId}?status=draft`, payload);
            await authApi.post(`/cms-pages/${documentId}/publish`, {});
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
            await authApi.post(`/cms-pages/${documentId}/unpublish`, {});
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
                    brand_groups: { set: selectedBrandGroupIds },
                    category_groups: { set: selectedCategoryGroupIds },
                    product_groups: { set: selectedGroupIds },
                    related_pages: { set: selectedRelatedIds },
                    footer: footerId || null,
                },
            };
            if (featuredImageId) discardPayload.data.featured_image = featuredImageId;
            if (backgroundImageId) discardPayload.data.background_image = backgroundImageId;
            if (galleryIds.length > 0) discardPayload.data.gallery = galleryIds;
            await authApi.put(`/cms-pages/${documentId}?status=draft`, discardPayload);
            // Load the published version into the form
            const res = await authApi.get(`/cms-pages/${documentId}`, {
                status: 'published',
                populate: ["featured_image", "gallery", "background_image", "hero_product_groups", "brand_groups", "category_groups", "product_groups", "related_pages", "footer"],
            });
            const p = res.data || res;
            if (!p) { toast("No published version found.", "warning"); return; }
            setTitle(p.title || "");
            setContent(p.content || "");
            setExcerpt(p.excerpt || "");
            setPageType(p.page_type || "shop");
            setSortOrder(p.sort_order ?? 0);
            setSelectedBrandGroupIds((p.brand_groups || []).map(bg => bg.documentId));
            setSelectedCategoryGroupIds((p.category_groups || []).map(cg => cg.documentId));
            setSelectedGroupIds((p.product_groups || []).map(g => g.documentId));
            setSelectedRelatedIds((p.related_pages || []).map(rp => rp.documentId));
            setFooterId(p.footer?.documentId || "");
            setExcerptPriority(p.excerpt_priority ?? 2);
            setFeaturedImagePriority(p.featured_image_priority ?? 0);
            setContentPriority(p.content_priority ?? 98);
            setGalleryPriority(p.gallery_priority ?? 100);
            setRelatedPagesPriority(p.related_pages_priority ?? 102);
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
            await authApi.del(`/cms-pages/${documentId}`);
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
                                    </div>
                                </div>
                            </div>

                            {/* Brand Groups
                            {pageType !== 'shop' && (
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-tags me-2"></i>
                                    <strong>Brand Groups</strong>
                                    <span className="badge bg-primary ms-2">{selectedBrandGroupIds.length}</span>
                                </div>
                                <div className="card-body">
                                    <p className="text-muted small mb-2">Select brand groups to display. Each group renders as a section using the group name as the heading.</p>
                                    {allBrandGroups.length === 0 ? (
                                        <p className="text-muted small">No brand groups available. <Link href="/new/brand-group">Create one</Link>.</p>
                                    ) : (
                                        <div className="d-flex flex-wrap gap-2">
                                            {allBrandGroups.map(bg => {
                                                const selected = selectedBrandGroupIds.includes(bg.documentId);
                                                return (
                                                    <button key={bg.documentId} type="button" className={`btn btn-sm ${selected ? "btn-warning" : "btn-outline-secondary"}`} onClick={() => toggleBrandGroup(bg.documentId)}>
                                                        {selected && <i className="fas fa-check me-1"></i>}{bg.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            )}

                            {/* Category Groups (hidden for shop pages — use product groups with layouts instead) */}
                            {pageType !== 'shop' && (
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-folder me-2"></i>
                                    <strong>Category Groups</strong>
                                    <span className="badge bg-primary ms-2">{selectedCategoryGroupIds.length}</span>
                                </div>
                                <div className="card-body">
                                    <p className="text-muted small mb-2">Select category groups to display. Each group renders as a section using the group name as the heading.</p>
                                    {allCategoryGroups.length === 0 ? (
                                        <p className="text-muted small">No category groups available. <Link href="/new/category-group">Create one</Link>.</p>
                                    ) : (
                                        <div className="d-flex flex-wrap gap-2">
                                            {allCategoryGroups.map(cg => {
                                                const selected = selectedCategoryGroupIds.includes(cg.documentId);
                                                return (
                                                    <button key={cg.documentId} type="button" className={`btn btn-sm ${selected ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => toggleCategoryGroup(cg.documentId)}>
                                                        {selected && <i className="fas fa-check me-1"></i>}{cg.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            )}

                            {/* Product Groups */}
                            <GroupPickerTabs
                                allGroups={allGroups}
                                selectedGroupIds={selectedGroupIds}
                                onToggle={toggleGroup}
                                onRemoveAll={() => setSelectedGroupIds([])}
                            />

                            {/* Related Pages */}
                            <PagePickerTabs
                                allPages={allPages}
                                selectedPageIds={selectedRelatedIds}
                                onToggle={toggleRelated}
                                onRemoveAll={() => setSelectedRelatedIds([])}
                            />
                        </div>

                        <div className="col-md-4">
                            <div className="card mb-3">
                                <div className="card-header">Settings</div>
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Page Type</label>
                                        <select className="form-select" value={pageType} onChange={e => setPageType(e.target.value)}>
                                            {PAGE_TYPES.map(t => (
                                                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Sort Order</label>
                                        <input type="number" className="form-control" value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value) || 0)} />
                                    </div>
                                    <hr />
                                    <p className="text-muted small mb-2"><i className="fas fa-sort-numeric-down me-1"></i>Section Priorities <span className="text-muted">(lower = higher on page)</span></p>
                                    <div className="row g-2 mb-2">
                                        <div className="col-8"><small>Featured Image</small></div>
                                        <div className="col-4"><input type="number" className="form-control form-control-sm" value={featuredImagePriority} onChange={e => setFeaturedImagePriority(parseInt(e.target.value) || 0)} /></div>
                                    </div>
                                    <div className="row g-2 mb-2">
                                        <div className="col-8"><small>Excerpt</small></div>
                                        <div className="col-4"><input type="number" className="form-control form-control-sm" value={excerptPriority} onChange={e => setExcerptPriority(parseInt(e.target.value) || 0)} /></div>
                                    </div>
                                    <div className="row g-2 mb-2">
                                        <div className="col-8"><small>Content</small></div>
                                        <div className="col-4"><input type="number" className="form-control form-control-sm" value={contentPriority} onChange={e => setContentPriority(parseInt(e.target.value) || 0)} /></div>
                                    </div>
                                    <div className="row g-2 mb-2">
                                        <div className="col-8"><small>Gallery</small></div>
                                        <div className="col-4"><input type="number" className="form-control form-control-sm" value={galleryPriority} onChange={e => setGalleryPriority(parseInt(e.target.value) || 0)} /></div>
                                    </div>
                                    <div className="row g-2 mb-2">
                                        <div className="col-8"><small>Related Pages</small></div>
                                        <div className="col-4"><input type="number" className="form-control form-control-sm" value={relatedPagesPriority} onChange={e => setRelatedPagesPriority(parseInt(e.target.value) || 0)} /></div>
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