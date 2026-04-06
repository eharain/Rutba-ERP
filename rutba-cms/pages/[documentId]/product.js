import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import FileView from "@rutba/pos-shared/components/FileView";
import ProductGalleryManager from "@rutba/pos-shared/components/ProductGalleryManager";
import ProductVariantManager from "@rutba/pos-shared/components/ProductVariantManager";
import MarkdownEditor from "@rutba/pos-shared/components/MarkdownEditor";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import Link from "next/link";
import { useToast } from "../../components/Toast";

export default function ProductDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const { currency } = useUtil();
    const [product, setProduct] = useState(null);
    const [isPublished, setIsPublished] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();
    const [activeTab, setActiveTab] = useState("details");

    // Editable fields
    const [name, setName] = useState("");
    const [summary  , setSummary] = useState("");
    const [description, setDescription] = useState("");
    const [sellingPrice, setSellingPrice] = useState("");
    const [offerPrice, setOfferPrice] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [allGroups, setAllGroups] = useState([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupBusyId, setGroupBusyId] = useState("");
    const [creatingGroup, setCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupTitle, setNewGroupTitle] = useState("");

    const loadProduct = useCallback(async () => {
        if (!jwt || !documentId) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                authApi.get(`/products/${documentId}`, {
                    status: 'draft',
                    populate: {
                        logo: true,
                        gallery: true,
                        categories: true,
                        brands: true,
                        variants: { populate: { gallery: true, logo: true, terms: true } },
                    },
                }),
                authApi.get(`/products/${documentId}`, { status: 'published', fields: ["documentId"] }).catch(() => ({ data: null })),
            ]);
            const p = draftRes.data || draftRes;
            setProduct(p);
            setIsPublished(!!(pubRes.data));
            setName(p.name || "");
            setSummary(p.summary || "");
            setDescription(p.description || "");
            setSellingPrice(p.selling_price ?? "");
            setOfferPrice(p.offer_price ?? "");
            setIsActive(p.is_active ?? true);
        } catch (err) {
            console.error("Failed to load product", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, documentId]);

    useEffect(() => { loadProduct(); }, [loadProduct]);

    const loadProductGroups = useCallback(async () => {
        if (!jwt || !documentId) return;
        setGroupsLoading(true);
        try {
            const res = await authApi.get("/product-groups", {
                status: "draft",
                sort: ["name:asc"],
                pagination: { pageSize: 500 },
                populate: ["products"],
            });
            const groups = res.data || [];
            setAllGroups(groups);
            const selected = groups
                .filter(g => (g.products || []).some(p => p.documentId === documentId))
                .map(g => g.documentId);
            setSelectedGroupIds(selected);
        } catch (err) {
            console.error("Failed to load product groups", err);
        } finally {
            setGroupsLoading(false);
        }
    }, [jwt, documentId]);

    useEffect(() => { loadProductGroups(); }, [loadProductGroups]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await authApi.put(`/products/${documentId}?status=draft`, {
                data: {
                    name,
                    summary,
                    description,
                    selling_price: parseFloat(sellingPrice) || 0,
                    offer_price: offerPrice ? parseFloat(offerPrice) : null,
                    is_active: isActive,
                },
            });
            toast("Draft saved!", "success");
        } catch (err) {
            console.error("Failed to update product", err);
            toast("Failed to save changes.", "danger");
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
                    summary,
                    description,
                    selling_price: parseFloat(sellingPrice) || 0,
                    offer_price: offerPrice ? parseFloat(offerPrice) : null,
                    is_active: isActive,
                },
            };
            await authApi.put(`/products/${documentId}?status=draft`, payload);
            await authApi.post(`/products/${documentId}/publish`, {});
            setIsPublished(true);
            toast("Product saved & published!", "success");
        } catch (err) {
            console.error("Failed to publish product", err);
            toast("Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setSaving(true);
        try {
            await authApi.post(`/products/${documentId}/unpublish`, {});
            setIsPublished(false);
            toast("Product unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish product", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDiscardDraft = async () => {
        if (!confirm("Save current draft and load the published version into the editor?")) return;
        setSaving(true);
        try {
            await authApi.put(`/products/${documentId}?status=draft`, {
                data: {
                    name,
                    summary,
                    description,
                    selling_price: parseFloat(sellingPrice) || 0,
                    offer_price: offerPrice ? parseFloat(offerPrice) : null,
                    is_active: isActive,
                },
            });
            const res = await authApi.get(`/products/${documentId}`, {
                status: 'published',
                populate: {
                    logo: true,
                    gallery: true,
                    categories: true,
                    brands: true,
                    variants: { populate: { gallery: true, logo: true, terms: true } },
                },
            });
            const p = res.data || res;
            if (!p) { toast("No published version found.", "warning"); return; }
            setName(p.name || "");
            setSummary(p.summary || "");
            setDescription(p.description || "");
            setSellingPrice(p.selling_price ?? "");
            setOfferPrice(p.offer_price ?? "");
            setIsActive(p.is_active ?? true);
            setProduct(p);
            toast("Draft saved. Showing published version — click Save Draft to overwrite.", "success");
        } catch (err) {
            console.error("Failed to load published version", err);
            toast("Failed to load published version.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const toggleGroup = async (groupDocId) => {
        const group = allGroups.find(g => g.documentId === groupDocId);
        if (!group) return;

        const currentIds = (group.products || []).map(p => p.documentId);
        const isSelected = currentIds.includes(documentId);
        const nextIds = isSelected
            ? currentIds.filter(id => id !== documentId)
            : [...currentIds, documentId];

        setGroupBusyId(groupDocId);
        try {
            await authApi.put(`/product-groups/${groupDocId}?status=draft`, {
                data: { products: { set: nextIds } },
            });
            setAllGroups(prev => prev.map(g =>
                g.documentId === groupDocId
                    ? {
                        ...g,
                        products: isSelected
                            ? (g.products || []).filter(p => p.documentId !== documentId)
                            : [...(g.products || []), { documentId }],
                    }
                    : g
            ));
            setSelectedGroupIds(prev =>
                isSelected ? prev.filter(id => id !== groupDocId) : [...prev, groupDocId]
            );
            toast(isSelected ? "Removed from group." : "Added to group.", "success");
        } catch (err) {
            console.error("Failed to update product group relation", err);
            toast("Failed to update product group.", "danger");
        } finally {
            setGroupBusyId("");
        }
    };

    const handleCreateGroup = async () => {
        const trimmedName = newGroupName.trim();
        if (!trimmedName) {
            toast("Enter a group name.", "warning");
            return;
        }

        setCreatingGroup(true);
        try {
            const generatedSlug = trimmedName.toLowerCase().trim().replace(/\s+/g, "-");
            await authApi.post("/product-groups", {
                data: {
                    name: trimmedName,
                    title: newGroupTitle.trim() || undefined,
                    slug: generatedSlug,
                    products: { set: [documentId] },
                },
            });
            setNewGroupName("");
            setNewGroupTitle("");
            toast("New group created and linked.", "success");
            await loadProductGroups();
        } catch (err) {
            console.error("Failed to create product group", err);
            toast("Failed to create product group.", "danger");
        } finally {
            setCreatingGroup(false);
        }
    };

    const variantCount = product?.variants?.length || 0;
    const galleryCount = (product?.gallery || []).length;

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/products">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Edit Product</h2>
                    {isPublished && <span className="badge bg-success ms-2 align-self-center">Published</span>}
                    {product && !isPublished && <span className="badge bg-secondary ms-2 align-self-center">Draft</span>}
                    <div className="ms-auto d-flex gap-2">
                        {isPublished && (
                            <button className="btn btn-sm btn-outline-secondary" onClick={handleUnpublish} disabled={saving}>
                                <i className="fas fa-eye-slash me-1"></i>Unpublish
                            </button>
                        )}
                        {isPublished && (
                            <button className="btn btn-sm btn-outline-warning" onClick={handleDiscardDraft} disabled={saving}>
                                <i className="fas fa-undo me-1"></i>Load Published
                            </button>
                        )}
                        {activeTab === "details" && (
                            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? "Saving…" : "Save Draft"}
                            </button>
                        )}
                        <button className="btn btn-sm btn-success" onClick={handlePublish} disabled={saving}>
                            <i className="fas fa-upload me-1"></i>{saving ? "Publishing…" : "Save & Publish"}
                        </button>
                    </div>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !product && (
                    <div className="alert alert-warning">Product not found.</div>
                )}

                {!loading && product && (
                    <>
                        {/* Tabs */}
                        <ul className="nav nav-tabs mb-3">
                            <li className="nav-item">
                                <button
                                    type="button"
                                    className={`nav-link ${activeTab === "details" ? "active" : ""}`}
                                    onClick={() => setActiveTab("details")}
                                >
                                    <i className="fas fa-edit me-1" /> Product Details
                                </button>
                            </li>
                            <li className="nav-item">
                                <button
                                    type="button"
                                    className={`nav-link ${activeTab === "gallery" ? "active" : ""}`}
                                    onClick={() => setActiveTab("gallery")}
                                >
                                    <i className="fas fa-images me-1" /> Gallery &amp; Variants
                                    {(variantCount > 0 || galleryCount > 0) && (
                                        <span className="badge bg-secondary ms-1">{galleryCount} img · {variantCount} var</span>
                                    )}
                                </button>
                            </li>
                            <li className="nav-item">
                                <button
                                    type="button"
                                    className={`nav-link ${activeTab === "variants" ? "active" : ""}`}
                                    onClick={() => setActiveTab("variants")}
                                >
                                    <i className="fas fa-layer-group me-1" /> Product &amp; Variants
                                    {variantCount > 0 && (
                                        <span className="badge bg-secondary ms-1">{variantCount}</span>
                                    )}
                                </button>
                            </li>
                        </ul>

                        {/* ---- PRODUCT DETAILS TAB ---- */}
                        {activeTab === "details" && (
                            <div className="row">
                                <div className="col-md-8">
                                    <div className="card mb-3">
                                        <div className="card-body">
                                            <div className="mb-3">
                                                <label className="form-label">Name</label>
                                                <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} />
                                            </div>
                                            <div className="mb-3">
                                                <label className="form-label">Summary (Markdown)</label>
                                                <MarkdownEditor value={summary} onChange={e => setSummary(e.target.value)} name="summary" rows={8} placeholder="Write a product summary..." />
                                            </div>
                                            <div className="mb-3">
                                                <label className="form-label">Description (Markdown)</label>
                                                <MarkdownEditor value={description} onChange={e => setDescription(e.target.value)} name="description" rows={8} placeholder="Write a product description..." />
                                            </div>
                                            <div className="row">
                                                <div className="col-md-4 mb-3">
                                                    <label className="form-label">Selling Price ({currency})</label>
                                                    <input type="number" className="form-control" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} />
                                                </div>
                                                <div className="col-md-4 mb-3">
                                                    <label className="form-label">Offer Price ({currency})</label>
                                                    <input type="number" className="form-control" value={offerPrice} onChange={e => setOfferPrice(e.target.value)} placeholder="Optional" />
                                                </div>
                                                <div className="col-md-4 mb-3 d-flex align-items-end">
                                                    <div className="form-check">
                                                        <input type="checkbox" className="form-check-input" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                                                        <label className="form-check-label" htmlFor="isActive">Active</label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-md-4">
                                    <div className="card mb-3">
                                        <div className="card-header">Logo</div>
                                        <div className="card-body">
                                            <FileView
                                                single={product.logo}
                                                refName="product"
                                                refId={product.id}
                                                field="logo"
                                                name={name}
                                            />
                                        </div>
                                    </div>
                                    <div className="card mb-3">
                                        <div className="card-header">Gallery</div>
                                        <div className="card-body">
                                            <FileView
                                                gallery={product.gallery || []}
                                                multiple
                                                refName="product"
                                                refId={product.id}
                                                field="gallery"
                                                name={name}
                                            />
                                        </div>
                                    </div>
                                    <div className="card mb-3">
                                        <div className="card-header">Info</div>
                                        <div className="card-body">
                                            <p><strong>SKU:</strong> {product.sku || "—"}</p>
                                            <p><strong>Barcode:</strong> {product.barcode || "—"}</p>
                                            <p><strong>Categories:</strong> {(product.categories || []).map(c => c.name).join(", ") || "—"}</p>
                                            <p><strong>Brands:</strong> {(product.brands || []).map(b => b.name).join(", ") || "—"}</p>
                                            <p><strong>Stock:</strong> {product.stock_quantity ?? "—"}</p>
                                        </div>
                                    </div>
                                    <div className="card mb-3">
                                        <div className="card-header d-flex align-items-center justify-content-between">
                                            <div className="d-flex align-items-center">
                                                <span>Product Groups</span>
                                                <span className="badge bg-primary ms-2">{selectedGroupIds.length}</span>
                                            </div>
                                            <Link href="/product-groups" className="btn btn-sm btn-outline-secondary">
                                                Manage
                                            </Link>
                                        </div>
                                        <div className="card-body">
                                            <div className="mb-2 small text-muted">
                                                Select existing groups or quickly create a new one.
                                            </div>

                                            <div className="mb-3">
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm mb-2"
                                                    placeholder="New group name"
                                                    value={newGroupName}
                                                    onChange={e => setNewGroupName(e.target.value)}
                                                />
                                                <div className="d-flex gap-2">
                                                    <input
                                                        type="text"
                                                        className="form-control form-control-sm"
                                                        placeholder="Title (optional)"
                                                        value={newGroupTitle}
                                                        onChange={e => setNewGroupTitle(e.target.value)}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-primary"
                                                        onClick={handleCreateGroup}
                                                        disabled={creatingGroup}
                                                    >
                                                        {creatingGroup ? "Creating…" : "Create"}
                                                    </button>
                                                </div>
                                            </div>

                                            {groupsLoading && <p className="text-muted small mb-0">Loading groups...</p>}

                                            {!groupsLoading && allGroups.length === 0 && (
                                                <p className="text-muted small mb-0">No product groups yet.</p>
                                            )}

                                            {!groupsLoading && allGroups.length > 0 && (
                                                <div className="d-flex flex-wrap gap-2" style={{ maxHeight: 240, overflowY: "auto" }}>
                                                    {allGroups.map(g => {
                                                        const selected = selectedGroupIds.includes(g.documentId);
                                                        const busy = groupBusyId === g.documentId;
                                                        return (
                                                            <div key={g.documentId} className="d-inline-flex align-items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    className={`btn btn-sm ${selected ? "btn-success" : "btn-outline-secondary"}`}
                                                                    onClick={() => toggleGroup(g.documentId)}
                                                                    disabled={busy}
                                                                >
                                                                    {selected && <i className="fas fa-check me-1"></i>}
                                                                    {g.name}
                                                                </button>
                                                                <Link className="btn btn-sm btn-outline-primary" href={`/${g.documentId}/product-group`} title="Open group">
                                                                    <i className="fas fa-external-link-alt"></i>
                                                                </Link>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ---- GALLERY & VARIANTS TAB ---- */}
                        {activeTab === "gallery" && (
                            <ProductGalleryManager
                                productId={documentId}
                                onUpdate={loadProduct}
                            />
                        )}

                        {/* ---- PRODUCT & VARIANTS TAB ---- */}
                        {activeTab === "variants" && (
                            <ProductVariantManager
                                productId={documentId}
                                onUpdate={loadProduct}
                            />
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
