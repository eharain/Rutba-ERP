import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import FileView from "@rutba/pos-shared/components/FileView";
import MarkdownEditor from "@rutba/pos-shared/components/MarkdownEditor";
import Link from "next/link";
import { useToast } from "../../components/Toast";
import ProductPickerTabs from "../../components/ProductPickerTabs";

export default function ProductGroupDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [group, setGroup] = useState(null);
    const [isPublished, setIsPublished] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();
    const isNew = documentId === "new";

    const [name, setName] = useState("");
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [content, setContent] = useState("");
    const [layout, setLayout] = useState("grid-4");
    const [priority, setPriority] = useState(0);
    const [defaultSort, setDefaultSort] = useState("default");
    const [enableSortDropdown, setEnableSortDropdown] = useState(true);
    const [enableViewToggle, setEnableViewToggle] = useState(true);
    const [maxInlineProducts, setMaxInlineProducts] = useState(12);
    const [showBrand, setShowBrand] = useState(true);
    const [showCategory, setShowCategory] = useState(true);
    const [selectedProductIds, setSelectedProductIds] = useState([]);
    const [connectedProducts, setConnectedProducts] = useState([]);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        Promise.all([
            authApi.get(`/product-groups/${documentId}`, { status: 'draft', populate: ["gallery", "cover_image", "products.logo", "products.brands", "products.categories"] }),
            authApi.get(`/product-groups/${documentId}`, { status: 'published', fields: ["documentId"] }).catch(() => ({ data: null })),
        ])
            .then(([draftRes, pubRes]) => {
                const g = draftRes.data || draftRes;
                setGroup(g);
                setIsPublished(!!(pubRes.data));
                setName(g.name || "");
                setTitle(g.title || "");
                setSlug(g.slug || "");
                setExcerpt(g.excerpt || "");
                setContent(g.content || "");
                setLayout(g.layout || "grid-4");
                setPriority(g.priority ?? 0);
                setDefaultSort(g.default_sort || "default");
                setEnableSortDropdown(g.enable_sort_dropdown !== false);
                setEnableViewToggle(g.enable_view_toggle !== false);
                setMaxInlineProducts(g.max_inline_products ?? 12);
                setShowBrand(g.show_brand !== false);
                setShowCategory(g.show_category !== false);
                const products = g.products || [];
                setConnectedProducts(products);
                setSelectedProductIds(products.map(p => p.documentId));
            })
            .catch(err => console.error("Failed to load product group", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const toggleProduct = (docId) => {
        setSelectedProductIds(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const bulkAddProducts = (docIds) => {
        setSelectedProductIds(prev => {
            const set = new Set(prev);
            docIds.forEach(id => set.add(id));
            return [...set];
        });
    };

    const removeAllProducts = () => {
        setSelectedProductIds([]);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                data: {
                    name,
                    title,
                    excerpt,
                    content,
                    layout,
                    priority,
                    default_sort: defaultSort,
                    enable_sort_dropdown: enableSortDropdown,
                    enable_view_toggle: enableViewToggle,
                    max_inline_products: maxInlineProducts,
                    show_brand: showBrand,
                    show_category: showCategory,
                    products: { set: selectedProductIds },
                },
            };
            if (isNew) {
                payload.data.slug = slug || name.toLowerCase().replace(/\s+/g, "-");
                const res = await authApi.post("/product-groups", payload);
                const created = res.data || res;
                router.push(`/${created.documentId}/product-group`);
            } else {
                await authApi.put(`/product-groups/${documentId}?status=draft`, payload);
                toast("Draft saved!", "success");
            }
        } catch (err) {
            console.error("Failed to save product group", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        setSaving(true);
        try {
            const payload = {
                data: {
                    name,
                    title,
                    excerpt,
                    content,
                    layout,
                    priority,
                    default_sort: defaultSort,
                    enable_sort_dropdown: enableSortDropdown,
                    enable_view_toggle: enableViewToggle,
                    max_inline_products: maxInlineProducts,
                    show_brand: showBrand,
                    show_category: showCategory,
                    products: { set: selectedProductIds },
                },
            };
            await authApi.put(`/product-groups/${documentId}?status=draft`, payload);
            await authApi.post(`/product-groups/${documentId}/publish`, {});
            setIsPublished(true);
            toast("Product group saved & published!", "success");
        } catch (err) {
            console.error("Failed to publish product group", err);
            toast("Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setSaving(true);
        try {
            await authApi.post(`/product-groups/${documentId}/unpublish`, {});
            setIsPublished(false);
            toast("Product group unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish product group", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDiscardDraft = async () => {
        if (!confirm("Save current draft and load the published version into the editor?")) return;
        setSaving(true);
        try {
            await authApi.put(`/product-groups/${documentId}?status=draft`, {
                data: { name, title, excerpt, content, layout, priority, default_sort: defaultSort, enable_sort_dropdown: enableSortDropdown, enable_view_toggle: enableViewToggle, max_inline_products: maxInlineProducts, products: { set: selectedProductIds } },
            });
            const res = await authApi.get(`/product-groups/${documentId}`, { status: 'published', populate: ["gallery", "cover_image", "products.logo", "products.brands", "products.categories"] });
            const g = res.data || res;
            if (!g) { toast("No published version found.", "warning"); return; }
            setName(g.name || "");
            setTitle(g.title || "");
            setSlug(g.slug || "");
            setExcerpt(g.excerpt || "");
            setContent(g.content || "");
            setLayout(g.layout || "grid-4");
            setPriority(g.priority ?? 0);
            setDefaultSort(g.default_sort || "default");
            setEnableSortDropdown(g.enable_sort_dropdown !== false);
            setEnableViewToggle(g.enable_view_toggle !== false);
            setMaxInlineProducts(g.max_inline_products ?? 12);
            const pubProducts = g.products || [];
            setConnectedProducts(pubProducts);
            setSelectedProductIds(pubProducts.map(p => p.documentId));
            toast("Draft saved. Showing published version — click Save Draft to overwrite.", "success");
        } catch (err) {
            console.error("Failed to load published version", err);
            toast("Failed to load published version.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this product group?")) return;
        try {
            await authApi.del(`/product-groups/${documentId}`);
            router.push("/product-groups");
        } catch (err) {
            console.error("Failed to delete product group", err);
            toast("Failed to delete.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/product-groups">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Product Group" : "Edit Product Group"}</h2>
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
                        {!isNew && isPublished && (
                            <button className="btn btn-sm btn-outline-warning" onClick={handleDiscardDraft} disabled={saving}>
                                <i className="fas fa-undo me-1"></i>Load Published
                            </button>
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
                    <div className="alert alert-warning">Product group not found.</div>
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
                                        <MarkdownEditor value={excerpt} onChange={e => setExcerpt(e.target.value)} name="excerpt" rows={3} placeholder="Short summary..." />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Content</label>
                                        <MarkdownEditor value={content} onChange={e => setContent(e.target.value)} name="content" rows={8} />
                                    </div>
                                </div>
                            </div>

                            <ProductPickerTabs
                                selectedProductIds={selectedProductIds}
                                connectedProducts={connectedProducts}
                                onToggle={toggleProduct}
                                onBulkAdd={bulkAddProducts}
                                onRemoveAll={removeAllProducts}
                            />
                        </div>

                        <div className="col-md-4">
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center justify-content-between" style={{ cursor: "pointer" }} onClick={() => setAdvancedOpen(v => !v)}>
                                    <span><i className={`fas fa-chevron-${advancedOpen ? "down" : "right"} me-2`}></i>Advanced Settings</span>
                                </div>
                                {advancedOpen && (
                                    <div className="card-body">
                                        <div className="mb-3">
                                            <label className="form-label">Layout</label>
                                            <select className="form-select" value={layout} onChange={e => setLayout(e.target.value)}>
                                                <option value="grid-4">Grid 4 Columns</option>
                                                <option value="grid-6">Grid 6 Columns</option>
                                                <option value="carousel">Carousel</option>
                                                <option value="hero-slider">Hero Slider</option>
                                                <option value="banner-single">Banner (Single Product)</option>
                                                <option value="list">List</option>
                                            </select>
                                            <small className="text-muted">Choose how products display</small>
                                        </div>
                                        <div className="mb-3">
                                            <label className="form-label">Priority</label>
                                            <input type="number" className="form-control" value={priority} onChange={e => setPriority(parseInt(e.target.value) || 0)} placeholder="0 = highest" />
                                            <small className="text-muted">Lower = appears first on page</small>
                                        </div>
                                        <div className="mb-3">
                                            <label className="form-label">Default Sort</label>
                                            <select className="form-select" value={defaultSort} onChange={e => setDefaultSort(e.target.value)}>
                                                <option value="default">Default</option>
                                                <option value="newest">Newest</option>
                                                <option value="price_asc">Price: Low → High</option>
                                                <option value="price_desc">Price: High → Low</option>
                                            </select>
                                        </div>
                                        <div className="mb-3">
                                            <label className="form-label">Max Inline Products</label>
                                            <input type="number" className="form-control" value={maxInlineProducts} onChange={e => setMaxInlineProducts(parseInt(e.target.value) || 0)} min={0} placeholder="12" />
                                            <small className="text-muted">0 = show all</small>
                                        </div>
                                        <div className="form-check mb-2">
                                            <input className="form-check-input" type="checkbox" id="enableSort" checked={enableSortDropdown} onChange={e => setEnableSortDropdown(e.target.checked)} />
                                            <label className="form-check-label" htmlFor="enableSort">Show Sort Dropdown</label>
                                        </div>
                                        <div className="form-check mb-2">
                                            <input className="form-check-input" type="checkbox" id="enableView" checked={enableViewToggle} onChange={e => setEnableViewToggle(e.target.checked)} />
                                            <label className="form-check-label" htmlFor="enableView">Show View Toggle</label>
                                        </div>
                                        <div className="form-check mb-2">
                                            <input className="form-check-input" type="checkbox" id="showBrand" checked={showBrand} onChange={e => setShowBrand(e.target.checked)} />
                                            <label className="form-check-label" htmlFor="showBrand">Show Product Brand</label>
                                        </div>
                                        <div className="form-check mb-3">
                                            <input className="form-check-input" type="checkbox" id="showCategory" checked={showCategory} onChange={e => setShowCategory(e.target.checked)} />
                                            <label className="form-check-label" htmlFor="showCategory">Show Product Category</label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {!isNew && group && (
                                <>
                                    <div className="card mb-3">
                                        <div className="card-header">Cover Image</div>
                                        <div className="card-body">
                                            <FileView
                                                single={group.cover_image}
                                                refName="product-group"
                                                refId={group.id}
                                                field="cover_image"
                                                name={name}
                                            />
                                        </div>
                                    </div>
                                    <div className="card mb-3">
                                        <div className="card-header">Gallery Image</div>
                                        <div className="card-body">
                                            <FileView
                                                single={group.gallery}
                                                refName="product-group"
                                                refId={group.id}
                                                field="gallery"
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
                                            {isPublished && <span className="badge bg-success">Published</span>}
                                            {!isPublished && <span className="badge bg-secondary">Draft</span>}
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
