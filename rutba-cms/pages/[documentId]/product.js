import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import FileView from "@rutba/pos-shared/components/FileView";
import ProductGalleryManager from "@rutba/pos-shared/components/ProductGalleryManager";
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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();
    const [activeTab, setActiveTab] = useState("details");

    // Editable fields
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [sellingPrice, setSellingPrice] = useState("");
    const [offerPrice, setOfferPrice] = useState("");
    const [isActive, setIsActive] = useState(true);

    const loadProduct = useCallback(async () => {
        if (!jwt || !documentId) return;
        setLoading(true);
        try {
            const res = await authApi.get(`/products/${documentId}`, {
                status: 'draft',
                populate: {
                    logo: true,
                    gallery: true,
                    categories: true,
                    brands: true,
                    variants: { populate: { gallery: true, logo: true, terms: true } },
                },
            });
            const p = res.data || res;
            setProduct(p);
            setName(p.name || "");
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

    const handleSave = async () => {
        setSaving(true);
        try {
            await authApi.put(`/products/${documentId}?status=draft`, {
                data: {
                    name,
                    description,
                    selling_price: parseFloat(sellingPrice) || 0,
                    offer_price: offerPrice ? parseFloat(offerPrice) : null,
                    is_active: isActive,
                },
            });
            toast("Product updated!", "success");
        } catch (err) {
            console.error("Failed to update product", err);
            toast("Failed to save changes.", "danger");
        } finally {
            setSaving(false);
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
                    {activeTab === "details" && (
                        <button className="btn btn-sm btn-primary ms-auto" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving…" : "Save Changes"}
                        </button>
                    )}
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
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
