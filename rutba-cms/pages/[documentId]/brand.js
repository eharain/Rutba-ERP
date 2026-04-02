import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import FileView from "@rutba/pos-shared/components/FileView";
import Link from "next/link";
import { useToast } from "../../components/Toast";
import ProductPickerTabs from "../../components/ProductPickerTabs";
import { fetchProducts } from "@rutba/pos-shared/lib/pos";

export default function BrandDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [brand, setBrand] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();
    const isNew = documentId === "new";

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");

    const [selectedProductIds, setSelectedProductIds] = useState([]);
    const [connectedProducts, setConnectedProducts] = useState([]);
    const initialProductIdsRef = useRef([]);

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        Promise.all([
            authApi.get(`/brands/${documentId}`, { status: 'draft', populate: ["logo", "gallery"] }),
            fetchProducts({ brands: [documentId], parentOnly: true, status: "draft" }, 1, 1000, "name:asc"),
        ])
            .then(([brandRes, productsRes]) => {
                const b = brandRes.data || brandRes;
                setBrand(b);
                setName(b.name || "");
                setSlug(b.slug || "");

                const products = productsRes.data || [];
                setConnectedProducts(products);
                const ids = products.map(p => p.documentId);
                setSelectedProductIds(ids);
                initialProductIdsRef.current = ids;
            })
            .catch(err => console.error("Failed to load brand", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const toggleProduct = (docId) => {
        setSelectedProductIds(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (isNew) {
                const res = await authApi.post("/brands", {
                    data: { name, slug: slug || name.toLowerCase().replace(/\s+/g, "-") },
                });
                const created = res.data || res;
                router.push(`/${created.documentId}/brand`);
            } else {
                await authApi.put(`/brands/${documentId}?status=draft`, {
                    data: { name },
                });

                const initialIds = new Set(initialProductIdsRef.current);
                const currentIds = new Set(selectedProductIds);
                const added = selectedProductIds.filter(id => !initialIds.has(id));
                const removed = initialProductIdsRef.current.filter(id => !currentIds.has(id));

                const updates = [];
                for (const id of added) {
                    updates.push(authApi.put(`/products/${id}?status=draft`, {
                        data: { brands: { connect: [documentId] } }
                    }));
                }
                for (const id of removed) {
                    updates.push(authApi.put(`/products/${id}?status=draft`, {
                        data: { brands: { disconnect: [documentId] } }
                    }));
                }
                await Promise.all(updates);

                initialProductIdsRef.current = [...selectedProductIds];
                toast("Brand updated!", "success");
            }
        } catch (err) {
            console.error("Failed to save brand", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/brands">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Brand" : "Edit Brand"}</h2>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !isNew && !brand && (
                    <div className="alert alert-warning">Brand not found.</div>
                )}

                {!loading && (isNew || brand) && (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Name</label>
                                        <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} />
                                    </div>
                                    {isNew && (
                                        <div className="mb-3">
                                            <label className="form-label">Slug</label>
                                            <input type="text" className="form-control" value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto-generated from name" />
                                        </div>
                                    )}
                                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                        {saving ? "Saving…" : isNew ? "Create Brand" : "Save Changes"}
                                    </button>
                                </div>
                            </div>

                            {!isNew && (
                                <ProductPickerTabs
                                    selectedProductIds={selectedProductIds}
                                    connectedProducts={connectedProducts}
                                    onToggle={toggleProduct}
                                />
                            )}
                        </div>
                        {!isNew && brand && (
                            <div className="col-md-4">
                                <div className="card mb-3">
                                    <div className="card-header">Logo</div>
                                    <div className="card-body">
                                        <FileView
                                            single={brand.logo}
                                            refName="brand"
                                            refId={brand.id}
                                            field="logo"
                                            name={name}
                                        />
                                    </div>
                                </div>
                                <div className="card mb-3">
                                    <div className="card-header">Gallery</div>
                                    <div className="card-body">
                                        <FileView
                                            gallery={brand.gallery || []}
                                            multiple
                                            refName="brand"
                                            refId={brand.id}
                                            field="gallery"
                                            name={name}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
