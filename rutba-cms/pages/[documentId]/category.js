import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function CategoryDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [category, setCategory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const isNew = documentId === "new";

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [summary, setSummary] = useState("");
    const [description, setDescription] = useState("");

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        authApi.get(`/categories/${documentId}`, { populate: ["logo", "gallery", "parent"] })
            .then(res => {
                const c = res.data || res;
                setCategory(c);
                setName(c.name || "");
                setSlug(c.slug || "");
                setSummary(c.summary || "");
                setDescription(c.description || "");
            })
            .catch(err => console.error("Failed to load category", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const handleSave = async () => {
        setSaving(true);
        try {
            if (isNew) {
                const res = await authApi.post("/categories", {
                    data: { name, slug: slug || name.toLowerCase().replace(/\s+/g, "-"), summary, description },
                });
                const created = res.data || res;
                router.push(`/${created.documentId}/category`);
            } else {
                await authApi.put(`/categories/${documentId}`, {
                    data: { name, summary, description },
                });
                alert("Category updated!");
            }
        } catch (err) {
            console.error("Failed to save category", err);
            alert("Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/categories">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Category" : "Edit Category"}</h2>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !isNew && !category && (
                    <div className="alert alert-warning">Category not found.</div>
                )}

                {!loading && (isNew || category) && (
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
                                    <div className="mb-3">
                                        <label className="form-label">Summary</label>
                                        <textarea className="form-control" rows={2} value={summary} onChange={e => setSummary(e.target.value)} />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Description</label>
                                        <textarea className="form-control" rows={4} value={description} onChange={e => setDescription(e.target.value)} />
                                    </div>
                                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                        {saving ? "Saving…" : isNew ? "Create Category" : "Save Changes"}
                                    </button>
                                </div>
                            </div>
                        </div>
                        {!isNew && category && (
                            <div className="col-md-4">
                                <div className="card mb-3">
                                    <div className="card-header">Logo</div>
                                    <div className="card-body text-center">
                                        {category.logo?.url ? (
                                            <img src={StraipImageUrl(category.logo)} alt={category.name} style={{ maxWidth: "100%", maxHeight: 150, objectFit: "contain" }} />
                                        ) : (
                                            <span className="text-muted">No logo</span>
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
