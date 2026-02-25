import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function BrandGroupDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const isNew = documentId === "new";

    const [group, setGroup] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [sortOrder, setSortOrder] = useState(0);
    const [selectedBrandIds, setSelectedBrandIds] = useState([]);
    const [allBrands, setAllBrands] = useState([]);

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        authApi.get(`/brand-groups/${documentId}`, { populate: ["brands.logo"] })
            .then(res => {
                const g = res.data || res;
                setGroup(g);
                setName(g.name || "");
                setSlug(g.slug || "");
                setSortOrder(g.sort_order ?? 0);
                setSelectedBrandIds((g.brands || []).map(b => b.documentId));
            })
            .catch(err => console.error("Failed to load brand group", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const loadBrands = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await authApi.get("/brands", { pagination: { pageSize: 100 }, sort: ["name:asc"], populate: ["logo"] });
            setAllBrands(res.data || []);
        } catch (err) {
            console.error("Failed to load brands", err);
        }
    }, [jwt]);

    useEffect(() => { loadBrands(); }, [loadBrands]);

    const toggleBrand = (docId) => {
        setSelectedBrandIds(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                data: {
                    name,
                    sort_order: sortOrder,
                    brands: { set: selectedBrandIds },
                },
            };
            if (isNew) {
                payload.data.slug = slug || name.toLowerCase().replace(/\s+/g, "-");
                const res = await authApi.post("/brand-groups", payload);
                const created = res.data || res;
                router.push(`/${created.documentId}/brand-group`);
            } else {
                await authApi.put(`/brand-groups/${documentId}`, payload);
                alert("Brand group updated!");
            }
        } catch (err) {
            console.error("Failed to save brand group", err);
            alert("Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this brand group?")) return;
        try {
            await authApi.del(`/brand-groups/${documentId}`);
            router.push("/brand-groups");
        } catch (err) {
            console.error("Failed to delete brand group", err);
            alert("Failed to delete.");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/brand-groups">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Brand Group" : "Edit Brand Group"}</h2>
                    {!isNew && (
                        <button className="btn btn-sm btn-outline-danger ms-auto" onClick={handleDelete}>
                            <i className="fas fa-trash me-1"></i>Delete
                        </button>
                    )}
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !isNew && !group && (
                    <div className="alert alert-warning">Brand group not found.</div>
                )}

                {!loading && (isNew || group) && (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Name</label>
                                        <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} />
                                        <div className="form-text">This name is used as the section title on the website (e.g. &quot;Explore Brands&quot;).</div>
                                    </div>
                                    {isNew && (
                                        <div className="mb-3">
                                            <label className="form-label">Slug</label>
                                            <input type="text" className="form-control" value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto-generated from name" />
                                        </div>
                                    )}
                                    <div className="mb-3">
                                        <label className="form-label">Sort Order</label>
                                        <input type="number" className="form-control" value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value) || 0)} />
                                    </div>
                                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                        {saving ? "Saving…" : isNew ? "Create Brand Group" : "Save Changes"}
                                    </button>
                                </div>
                            </div>

                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-tag me-2"></i>
                                    <strong>Brands</strong>
                                    <span className="badge bg-primary ms-2">{selectedBrandIds.length}</span>
                                </div>
                                <div className="card-body">
                                    <p className="text-muted small mb-2">Select brands to include in this group.</p>
                                    {allBrands.length === 0 ? (
                                        <p className="text-muted small">No brands available.</p>
                                    ) : (
                                        <div className="d-flex flex-wrap gap-2">
                                            {allBrands.map(b => {
                                                const selected = selectedBrandIds.includes(b.documentId);
                                                return (
                                                    <button key={b.documentId} type="button" className={`btn btn-sm ${selected ? "btn-warning" : "btn-outline-secondary"}`} onClick={() => toggleBrand(b.documentId)}>
                                                        {selected && <i className="fas fa-check me-1"></i>}
                                                        {b.logo?.url && <img src={StraipImageUrl(b.logo)} alt="" style={{ width: 16, height: 16, objectFit: "contain", marginRight: 4 }} />}
                                                        {b.name}
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
                                <div className="card-header">Info</div>
                                <div className="card-body">
                                    {!isNew && group?.slug && (
                                        <div className="mb-3">
                                            <label className="form-label">Slug</label>
                                            <code className="d-block">{group.slug}</code>
                                        </div>
                                    )}
                                    {!isNew && group?.publishedAt && <span className="badge bg-success">Published</span>}
                                    {!isNew && !group?.publishedAt && <span className="badge bg-secondary">Draft</span>}
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
