import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import Link from "next/link";

export default function ProductDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const { currency } = useUtil();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Editable fields
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [sellingPrice, setSellingPrice] = useState("");
    const [offerPrice, setOfferPrice] = useState("");
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        if (!jwt || !documentId) return;
        authApi.get(`/products/${documentId}`, { populate: ["logo", "gallery", "categories", "brands"] })
            .then(res => {
                const p = res.data || res;
                setProduct(p);
                setName(p.name || "");
                setDescription(p.description || "");
                setSellingPrice(p.selling_price ?? "");
                setOfferPrice(p.offer_price ?? "");
                setIsActive(p.is_active ?? true);
            })
            .catch(err => console.error("Failed to load product", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await authApi.put(`/products/${documentId}`, {
                data: {
                    name,
                    description,
                    selling_price: parseFloat(sellingPrice) || 0,
                    offer_price: offerPrice ? parseFloat(offerPrice) : null,
                    is_active: isActive,
                },
            });
            alert("Product updated successfully!");
        } catch (err) {
            console.error("Failed to update product", err);
            alert("Failed to save changes.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/products">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Edit Product</h2>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !product && (
                    <div className="alert alert-warning">Product not found.</div>
                )}

                {!loading && product && (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Name</label>
                                        <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Description</label>
                                        <textarea className="form-control" rows={5} value={description} onChange={e => setDescription(e.target.value)} />
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
                                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                        {saving ? "Saving…" : "Save Changes"}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="col-md-4">
                            <div className="card mb-3">
                                <div className="card-header">Logo</div>
                                <div className="card-body text-center">
                                    {product.logo?.url ? (
                                        <img src={StraipImageUrl(product.logo)} alt={product.name} style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain" }} />
                                    ) : (
                                        <span className="text-muted">No logo</span>
                                    )}
                                </div>
                            </div>
                            <div className="card mb-3">
                                <div className="card-header">Gallery ({(product.gallery || []).length} images)</div>
                                <div className="card-body">
                                    <div className="d-flex flex-wrap gap-2">
                                        {(product.gallery || []).map((img, i) => (
                                            <img key={i} src={StraipImageUrl(img)} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 4 }} />
                                        ))}
                                        {(!product.gallery || product.gallery.length === 0) && (
                                            <span className="text-muted">No images</span>
                                        )}
                                    </div>
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
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
