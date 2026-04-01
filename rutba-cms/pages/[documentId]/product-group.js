import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import FileView from "@rutba/pos-shared/components/FileView";
import MarkdownEditor from "@rutba/pos-shared/components/MarkdownEditor";
import Link from "next/link";
import { useToast } from "../../components/Toast";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import { fetchProducts } from "@rutba/pos-shared/lib/pos";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100, 150, 200];

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
    const [selectedProductIds, setSelectedProductIds] = useState([]);

    // Product picker state
    const [pickerProducts, setPickerProducts] = useState([]);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [pickerPage, setPickerPage] = useState(1);
    const [pickerPageSize, setPickerPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [pickerPageCount, setPickerPageCount] = useState(1);
    const [pickerTotal, setPickerTotal] = useState(0);
    const [goToPage, setGoToPage] = useState("");

    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [termTypes, setTermTypes] = useState([]);
    const [purchases, setPurchases] = useState([]);

    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [selectedTerm, setSelectedTerm] = useState("");
    const [selectedPurchase, setSelectedPurchase] = useState("");
    const [searchText, setSearchText] = useState("");

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
                setSelectedProductIds((g.products || []).map(p => p.documentId));
            })
            .catch(err => console.error("Failed to load product group", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const loadPickerData = useCallback(async () => {
        if (!jwt) return;
        try {
            const [brandsRes, categoriesRes, suppliersRes, termTypesRes, purchasesRes] = await Promise.all([
                authApi.getAll("/brands"),
                authApi.getAll("/categories"),
                authApi.getAll("/suppliers"),
                authApi.getAll("/term-types", { populate: ["terms"] }),
                authApi.getAll("/purchases", { sort: ["createdAt:desc"] }),
            ]);
            setBrands(brandsRes?.data || brandsRes || []);
            setCategories(categoriesRes?.data || categoriesRes || []);
            setSuppliers(suppliersRes?.data || suppliersRes || []);
            setTermTypes(termTypesRes?.data || termTypesRes || []);
            setPurchases(purchasesRes?.data || purchasesRes || []);
        } catch (err) {
            console.error("Failed to load picker data", err);
        }
    }, [jwt]);

    useEffect(() => { loadPickerData(); }, [loadPickerData]);

    useEffect(() => {
        if (!jwt) return;

        const filters = { parentOnly: true, status: "draft", searchText };
        if (selectedBrand) filters.brands = [selectedBrand];
        if (selectedCategory) filters.categories = [selectedCategory];
        if (selectedSupplier) filters.suppliers = [selectedSupplier];
        if (selectedTerm) filters.terms = [selectedTerm];
        if (selectedPurchase) filters.purchases = [selectedPurchase];

        let cancelled = false;
        setPickerLoading(true);

        fetchProducts(filters, pickerPage, pickerPageSize, "createdAt:desc")
            .then((res) => {
                if (cancelled) return;
                setPickerProducts(res.data || []);
                setPickerPageCount(res.meta?.pagination?.pageCount ?? 1);
                setPickerTotal(res.meta?.pagination?.total ?? 0);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Failed to load filtered products", err);
            })
            .finally(() => {
                if (!cancelled) setPickerLoading(false);
            });

        return () => { cancelled = true; };
    }, [jwt, pickerPage, pickerPageSize, selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, searchText]);

    const pickerFromItem = pickerTotal === 0 ? 0 : (pickerPage - 1) * pickerPageSize + 1;
    const pickerToItem = Math.min(pickerPage * pickerPageSize, pickerTotal);
    const pickerPaginationItems = (() => {
        if (pickerPageCount <= 7) return Array.from({ length: pickerPageCount }, (_, i) => i + 1);
        if (pickerPage <= 4) return [1, 2, 3, 4, 5, "…", pickerPageCount];
        if (pickerPage >= pickerPageCount - 3) return [1, "…", pickerPageCount - 4, pickerPageCount - 3, pickerPageCount - 2, pickerPageCount - 1, pickerPageCount];
        return [1, "…", pickerPage - 1, pickerPage, pickerPage + 1, "…", pickerPageCount];
    })();

    const toggleProduct = (docId) => {
        setSelectedProductIds(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
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
                data: { name, title, excerpt, content, products: { set: selectedProductIds } },
            });
            const res = await authApi.get(`/product-groups/${documentId}`, { status: 'published', populate: ["gallery", "cover_image", "products.logo", "products.brands", "products.categories"] });
            const g = res.data || res;
            if (!g) { toast("No published version found.", "warning"); return; }
            setName(g.name || "");
            setTitle(g.title || "");
            setSlug(g.slug || "");
            setExcerpt(g.excerpt || "");
            setContent(g.content || "");
            setSelectedProductIds((g.products || []).map(p => p.documentId));
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
                                        <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} />
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

                            {/* Products */}
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-box me-2"></i>
                                    <strong>Products</strong>
                                    <span className="badge bg-primary ms-2">{selectedProductIds.length}</span>
                                </div>
                                <div className="card-body">
                                    <ProductFilter
                                        brands={brands}
                                        categories={categories}
                                        suppliers={suppliers}
                                        termTypes={termTypes}
                                        purchases={purchases}
                                        selectedBrand={selectedBrand}
                                        selectedCategory={selectedCategory}
                                        selectedSupplier={selectedSupplier}
                                        selectedTerm={selectedTerm}
                                        selectedPurchase={selectedPurchase}
                                        searchText={searchText}
                                        onBrandChange={(v) => { setSelectedBrand(v || ""); setPickerPage(1); }}
                                        onCategoryChange={(v) => { setSelectedCategory(v || ""); setPickerPage(1); }}
                                        onSupplierChange={(v) => { setSelectedSupplier(v || ""); setPickerPage(1); }}
                                        onTermChange={(v) => { setSelectedTerm(v || ""); setPickerPage(1); }}
                                        onPurchaseChange={(v) => { setSelectedPurchase(v || ""); setPickerPage(1); }}
                                        onSearchTextChange={(v) => { setSearchText(v || ""); setPickerPage(1); }}
                                    />

                                    <div className="d-flex align-items-center justify-content-between my-2">
                                        <small className="text-muted">{pickerTotal} products found{pickerTotal > 0 ? ` · Showing ${pickerFromItem}-${pickerToItem}` : ""}</small>
                                        <div className="d-flex align-items-center gap-2">
                                            <label className="small text-muted mb-0">Rows:</label>
                                            <select
                                                className="form-select form-select-sm"
                                                style={{ width: 90 }}
                                                value={pickerPageSize}
                                                onChange={(e) => { setPickerPageSize(parseInt(e.target.value, 10)); setPickerPage(1); }}
                                            >
                                                {PAGE_SIZE_OPTIONS.map((size) => (
                                                    <option key={size} value={size}>{size}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {pickerLoading && <p className="text-muted small">Loading products...</p>}

                                    {!pickerLoading && pickerProducts.length === 0 ? (
                                        <p className="text-muted small">No products match the filters.</p>
                                    ) : (
                                        <div className="d-flex flex-wrap gap-2">
                                            {pickerProducts.map(p => {
                                                const selected = selectedProductIds.includes(p.documentId);
                                                return (
                                                    <div key={p.documentId} className="d-inline-flex align-items-center gap-1">
                                                        <button type="button" className={`btn btn-sm ${selected ? "btn-success" : "btn-outline-secondary"}`} onClick={() => toggleProduct(p.documentId)}>
                                                            {selected && <i className="fas fa-check me-1"></i>}
                                                            {p.logo?.url && <img src={StraipImageUrl(p.logo)} alt="" style={{ width: 16, height: 16, objectFit: "contain", marginRight: 4 }} />}
                                                            {p.name}
                                                        </button>
                                                        <Link
                                                            href={`/${p.documentId}/product`}
                                                            className="btn btn-sm btn-outline-primary"
                                                            title="Open product"
                                                        >
                                                            <i className="fas fa-external-link-alt"></i>
                                                        </Link>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {pickerPageCount > 1 && (
                                        <nav className="mt-3 d-flex align-items-center justify-content-between">
                                            <div>
                                                <button
                                                    className="btn btn-sm btn-outline-secondary me-1"
                                                    disabled={pickerPage <= 1}
                                                    onClick={() => setPickerPage(p => Math.max(1, p - 1))}
                                                >
                                                    &laquo; Prev
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-outline-secondary"
                                                    disabled={pickerPage >= pickerPageCount}
                                                    onClick={() => setPickerPage(p => Math.min(pickerPageCount, p + 1))}
                                                >
                                                    Next &raquo;
                                                </button>
                                            </div>
                                            <div className="d-flex align-items-center gap-2">
                                                <ul className="pagination pagination-sm mb-0">
                                                    {pickerPaginationItems.map((item, idx) => (
                                                        typeof item === "number" ? (
                                                            <li key={item} className={`page-item ${pickerPage === item ? "active" : ""}`}>
                                                                <button className="page-link" onClick={() => setPickerPage(item)}>{item}</button>
                                                            </li>
                                                        ) : (
                                                            <li key={`ellipsis-${idx}`} className="page-item disabled">
                                                                <span className="page-link">…</span>
                                                            </li>
                                                        )
                                                    ))}
                                                </ul>
                                                <div className="d-flex align-items-center gap-1">
                                                    <span className="small text-muted">Go to</span>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={pickerPageCount}
                                                        className="form-control form-control-sm"
                                                        style={{ width: 80 }}
                                                        value={goToPage}
                                                        onChange={(e) => setGoToPage(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key !== "Enter") return;
                                                            const target = Math.max(1, Math.min(pickerPageCount, parseInt(goToPage, 10) || 1));
                                                            setPickerPage(target);
                                                            setGoToPage("");
                                                        }}
                                                    />
                                                    <button
                                                        className="btn btn-sm btn-outline-secondary"
                                                        onClick={() => {
                                                            const target = Math.max(1, Math.min(pickerPageCount, parseInt(goToPage, 10) || 1));
                                                            setPickerPage(target);
                                                            setGoToPage("");
                                                        }}
                                                    >
                                                        Go
                                                    </button>
                                                </div>
                                            </div>
                                        </nav>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="col-md-4">
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

export async function getServerSideProps() { return { props: {} }; }
