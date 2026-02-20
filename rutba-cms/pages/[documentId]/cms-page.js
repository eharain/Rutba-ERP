import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

const PAGE_TYPES = ["page", "blog", "announcement"];

export default function CmsPageDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const isNew = documentId === "new";

    const [page, setPage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [content, setContent] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [pageType, setPageType] = useState("page");
    const [sortOrder, setSortOrder] = useState(0);

    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [selectedRelatedIds, setSelectedRelatedIds] = useState([]);

    const [allGroups, setAllGroups] = useState([]);
    const [allPages, setAllPages] = useState([]);

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        authApi.get(`/cms-pages/${documentId}`, {
            populate: ["featured_image", "gallery", "product_groups", "related_pages"],
        })
            .then(res => {
                const p = res.data || res;
                setPage(p);
                setTitle(p.title || "");
                setSlug(p.slug || "");
                setContent(p.content || "");
                setExcerpt(p.excerpt || "");
                setPageType(p.page_type || "page");
                setSortOrder(p.sort_order ?? 0);
                setSelectedGroupIds((p.product_groups || []).map(g => g.documentId));
                setSelectedRelatedIds((p.related_pages || []).map(rp => rp.documentId));
            })
            .catch(err => console.error("Failed to load page", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const loadPickers = useCallback(async () => {
        if (!jwt) return;
        try {
            const [groupsRes, pagesRes] = await Promise.all([
                authApi.get("/product-groups", { pagination: { pageSize: 100 }, sort: ["name:asc"] }),
                authApi.get("/cms-pages", { pagination: { pageSize: 100 }, sort: ["title:asc"] }),
            ]);
            setAllGroups(groupsRes.data || []);
            setAllPages((pagesRes.data || []).filter(p => p.documentId !== documentId));
        } catch (err) {
            console.error("Failed to load picker data", err);
        }
    }, [jwt, documentId]);

    useEffect(() => { loadPickers(); }, [loadPickers]);

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
                    product_groups: { set: selectedGroupIds },
                    related_pages: { set: selectedRelatedIds },
                },
            };
            if (isNew) {
                payload.data.slug = slug || title.toLowerCase().replace(/\s+/g, "-");
                const res = await authApi.post("/cms-pages", payload);
                const created = res.data || res;
                router.push(`/${created.documentId}/cms-page`);
            } else {
                await authApi.put(`/cms-pages/${documentId}`, payload);
                alert("Page updated!");
            }
        } catch (err) {
            console.error("Failed to save page", err);
            alert("Failed to save.");
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
            alert("Failed to delete.");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/pages">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Page" : "Edit Page"}</h2>
                    {!isNew && (
                        <button className="btn btn-sm btn-outline-danger ms-auto" onClick={handleDelete}>
                            <i className="fas fa-trash me-1"></i>Delete
                        </button>
                    )}
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
                                        </div>
                                    )}
                                    <div className="mb-3">
                                        <label className="form-label">Excerpt</label>
                                        <textarea className="form-control" rows={2} value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Short summary..." />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Content</label>
                                        <textarea className="form-control" rows={12} value={content} onChange={e => setContent(e.target.value)} />
                                    </div>
                                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                        {saving ? "Saving..." : isNew ? "Create Page" : "Save Changes"}
                                    </button>
                                </div>
                            </div>

                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-layer-group me-2"></i>
                                    <strong>Product Groups</strong>
                                    <span className="badge bg-primary ms-2">{selectedGroupIds.length}</span>
                                </div>
                                <div className="card-body">
                                    <p className="text-muted small mb-2">Select product groups to display alongside this page on the website.</p>
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
                                    {!isNew && page?.publishedAt && <span className="badge bg-success">Published</span>}
                                    {!isNew && !page?.publishedAt && <span className="badge bg-secondary">Draft</span>}
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