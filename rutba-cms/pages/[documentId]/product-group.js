import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function ProductGroupDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [group, setGroup] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const isNew = documentId === "new";

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        authApi.get(`/product-groups/${documentId}`, { populate: ["gallery", "cover_image", "products.logo"] })
            .then(res => {
                const g = res.data || res;
                setGroup(g);
                setName(g.name || "");
                setSlug(g.slug || "");
            })
            .catch(err => console.error("Failed to load product group", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const handleSave = async () => {
        setSaving(true);
        try {
            if (isNew) {
                const res = await authApi.post("/product-groups", {
                    data: { name, slug: slug || name.toLowerCase().replace(/\s+/g, "-") },
                });
                const created = res.data || res;
                router.push(`/${created.documentId}/product-group`);
            } else {
                await authApi.put(`/product-groups/${documentId}`, {
                    data: { name },
                });
                alert("Product group updated!");
            }
        } catch (err) {
            console.error("Failed to save product group", err);
            alert("Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/product-groups">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Product Group" : "Edit Product Group"}</h2>
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
                                    {isNew && (
                                        <div className="mb-3">
                                            <label className="form-label">Slug</label>
                                            <input type="text" className="form-control" value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto-generated from name" />
                                        </div>
                                    )}
                                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                        {saving ? "Saving…" : isNew ? "Create Group" : "Save Changes"}
                                    </button>
                                </div>
                            </div>

                            {!isNew && group?.products && group.products.length > 0 && (
                                <div className="card">
                                    <div className="card-header">Products in this group ({group.products.length})</div>
                                    <div className="card-body p-0">
                                        <table className="table table-sm mb-0">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 40 }}></th>
                                                    <th>Name</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.products.map(p => (
                                                    <tr key={p.id}>
                                                        <td>
                                                            {p.logo?.url ? (
                                                                <img src={StraipImageUrl(p.logo)} alt={p.name} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />
                                                            ) : (
                                                                <i className="fas fa-box text-muted"></i>
                                                            )}
                                                        </td>
                                                        <td>{p.name}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                        {!isNew && group && (
                            <div className="col-md-4">
                                <div className="card mb-3">
                                    <div className="card-header">Cover Image</div>
                                    <div className="card-body text-center">
                                        {group.cover_image?.url ? (
                                            <img src={StraipImageUrl(group.cover_image)} alt={group.name} style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain" }} />
                                        ) : (
                                            <span className="text-muted">No cover image</span>
                                        )}
                                    </div>
                                </div>
                                <div className="card mb-3">
                                    <div className="card-header">Gallery</div>
                                    <div className="card-body text-center">
                                        {group.gallery?.url ? (
                                            <img src={StraipImageUrl(group.gallery)} alt={group.name} style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain" }} />
                                        ) : (
                                            <span className="text-muted">No gallery image</span>
                                        )}
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

export async function getServerSideProps() { return { props: {} }; }
