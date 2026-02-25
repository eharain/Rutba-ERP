import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import MarkdownEditor from "@rutba/pos-shared/components/MarkdownEditor";
import Link from "next/link";
import { useToast } from "../../components/Toast";

const PAGE_TYPES = ["page", "blog", "announcement"];

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
    const [pageType, setPageType] = useState("page");
    const [sortOrder, setSortOrder] = useState(0);

    const [selectedHeroGroupIds, setSelectedHeroGroupIds] = useState([]);
    const [selectedBrandGroupIds, setSelectedBrandGroupIds] = useState([]);
    const [selectedCategoryGroupIds, setSelectedCategoryGroupIds] = useState([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [selectedRelatedIds, setSelectedRelatedIds] = useState([]);
    const [footerId, setFooterId] = useState("");

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
                populate: ["featured_image", "gallery", "hero_product_groups", "brand_groups", "category_groups", "product_groups", "related_pages", "footer"],
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
                setPageType(p.page_type || "page");
                setSortOrder(p.sort_order ?? 0);
                setSelectedHeroGroupIds((p.hero_product_groups || []).map(g => g.documentId));
                setSelectedBrandGroupIds((p.brand_groups || []).map(bg => bg.documentId));
                setSelectedCategoryGroupIds((p.category_groups || []).map(cg => cg.documentId));
                setSelectedGroupIds((p.product_groups || []).map(g => g.documentId));
                setSelectedRelatedIds((p.related_pages || []).map(rp => rp.documentId));
                setFooterId(p.footer?.documentId || "");
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
                    hero_product_groups: { set: selectedHeroGroupIds },
                    brand_groups: { set: selectedBrandGroupIds },
                    category_groups: { set: selectedCategoryGroupIds },
                    product_groups: { set: selectedGroupIds },
                    related_pages: { set: selectedRelatedIds },
                    footer: footerId || null,
                },
            };
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
                    hero_product_groups: { set: selectedHeroGroupIds },
                    brand_groups: { set: selectedBrandGroupIds },
                    category_groups: { set: selectedCategoryGroupIds },
                    product_groups: { set: selectedGroupIds },
                    related_pages: { set: selectedRelatedIds },
                    footer: footerId || null,
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
                                        <label className="form-label">Excerpt</label>
                                        <textarea className="form-control" rows={2} value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Short summary..." />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Content</label>
                                        <MarkdownEditor value={content} onChange={e => setContent(e.target.value)} name="content" rows={12} />
                                    </div>
                                </div>
                            </div>

                            {/* Hero Product Groups */}
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-image me-2"></i>
                                    <strong>Hero Slider</strong>
                                    <span className="badge bg-primary ms-2">{selectedHeroGroupIds.length}</span>
                                </div>
                                <div className="card-body">
                                    <p className="text-muted small mb-2">Select product groups whose products will appear as the full-width hero banner slider.</p>
                                    {allGroups.length === 0 ? (
                                        <p className="text-muted small">No product groups available.</p>
                                    ) : (
                                        <div className="d-flex flex-wrap gap-2">
                                            {allGroups.map(g => {
                                                const selected = selectedHeroGroupIds.includes(g.documentId);
                                                return (
                                                    <button key={g.documentId} type="button" className={`btn btn-sm ${selected ? "btn-danger" : "btn-outline-secondary"}`} onClick={() => setSelectedHeroGroupIds(prev => prev.includes(g.documentId) ? prev.filter(id => id !== g.documentId) : [...prev, g.documentId])}>
                                                        {selected && <i className="fas fa-check me-1"></i>}{g.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Brand Groups */}
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

                            {/* Category Groups */}
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

                            {/* Product Groups */}
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-layer-group me-2"></i>
                                    <strong>Product Groups</strong>
                                    <span className="badge bg-primary ms-2">{selectedGroupIds.length}</span>
                                </div>
                                <div className="card-body">
                                    <p className="text-muted small mb-2">Select product groups to display. Each group renders as a section using the group name as the heading.</p>
                                    {allGroups.length === 0 ? (
                                        <p className="text-muted small">No product groups available.</p>
                                    ) : (
                                        <div className="d-flex flex-wrap gap-2">
                                            {allGroups.map(g => {
                                                const selected = selectedGroupIds.includes(g.documentId);
                                                return (
                                                    <button key={g.documentId} type="button" className={`btn btn-sm ${selected ? "btn-success" : "btn-outline-secondary"}`} onClick={() => toggleGroup(g.documentId)}>
                                                        {selected && <i className="fas fa-check me-1"></i>}{g.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Related Pages */}
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-link me-2"></i>
                                    <strong>Related Pages</strong>
                                    <span className="badge bg-primary ms-2">{selectedRelatedIds.length}</span>
                                </div>
                                <div className="card-body">
                                    <p className="text-muted small mb-2">Link other pages that visitors may find useful.</p>
                                    {allPages.length === 0 ? (
                                        <p className="text-muted small">No other pages available.</p>
                                    ) : (
                                        <div className="d-flex flex-wrap gap-2">
                                            {allPages.map(p => {
                                                const selected = selectedRelatedIds.includes(p.documentId);
                                                return (
                                                    <button key={p.documentId} type="button" className={`btn btn-sm ${selected ? "btn-info text-white" : "btn-outline-secondary"}`} onClick={() => toggleRelated(p.documentId)}>
                                                        {selected && <i className="fas fa-check me-1"></i>}{p.title}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
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
                            {!isNew && page?.featured_image?.url && (
                                <div className="card mb-3">
                                    <div className="card-header">Featured Image</div>
                                    <div className="card-body text-center">
                                        <img src={StraipImageUrl(page.featured_image)} alt={page.title} style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain" }} />
                                    </div>
                                </div>
                            )}
                            {!isNew && page?.gallery && page.gallery.length > 0 && (
                                <div className="card mb-3">
                                    <div className="card-header">Gallery ({page.gallery.length})</div>
                                    <div className="card-body">
                                        <div className="d-flex flex-wrap gap-2">
                                            {page.gallery.map((img, i) => (
                                                <img key={i} src={StraipImageUrl(img)} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 4 }} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }