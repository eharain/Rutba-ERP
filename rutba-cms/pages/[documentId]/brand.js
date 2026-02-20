import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function BrandDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [brand, setBrand] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const isNew = documentId === "new";

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        authApi.get(`/brands/${documentId}`, { populate: ["logo", "gallery"] })
            .then(res => {
                const b = res.data || res;
                setBrand(b);
                setName(b.name || "");
                setSlug(b.slug || "");
            })
            .catch(err => console.error("Failed to load brand", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

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
                await authApi.put(`/brands/${documentId}`, {
                    data: { name },
                });
                alert("Brand updated!");
            }
        } catch (err) {
            console.error("Failed to save brand", err);
            alert("Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
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
                            <div className="card">
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
                        </div>
                        {!isNew && brand && (
                            <div className="col-md-4">
                                <div className="card mb-3">
                                    <div className="card-header">Logo</div>
                                    <div className="card-body text-center">
                                        {brand.logo?.url ? (
                                            <img src={StraipImageUrl(brand.logo)} alt={brand.name} style={{ maxWidth: "100%", maxHeight: 150, objectFit: "contain" }} />
                                        ) : (
                                            <span className="text-muted">No logo</span>
                                        )}
                                    </div>
                                </div>
                                {brand.gallery && brand.gallery.length > 0 && (
                                    <div className="card mb-3">
                                        <div className="card-header">Gallery ({brand.gallery.length} images)</div>
                                        <div className="card-body">
                                            <div className="d-flex flex-wrap gap-2">
                                                {brand.gallery.map((img, i) => (
                                                    <img key={i} src={StraipImageUrl(img)} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 4 }} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
