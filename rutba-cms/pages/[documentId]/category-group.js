import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import { useToast } from "../../components/Toast";

export default function CategoryGroupDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const isNew = documentId === "new";

    const [group, setGroup] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [sortOrder, setSortOrder] = useState(0);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
    const [allCategories, setAllCategories] = useState([]);

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        authApi.get(`/category-groups/${documentId}`, { populate: ["categories"] })
            .then(res => {
                const g = res.data || res;
                setGroup(g);
                setName(g.name || "");
                setSlug(g.slug || "");
                setSortOrder(g.sort_order ?? 0);
                setSelectedCategoryIds((g.categories || []).map(c => c.documentId));
            })
            .catch(err => console.error("Failed to load category group", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const loadCategories = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await authApi.get("/categories", { pagination: { pageSize: 200 }, sort: ["name:asc"] });
            setAllCategories(res.data || []);
        } catch (err) {
            console.error("Failed to load categories", err);
        }
    }, [jwt]);

    useEffect(() => { loadCategories(); }, [loadCategories]);

    const toggleCategory = (docId) => {
        setSelectedCategoryIds(prev =>
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
                    categories: { set: selectedCategoryIds },
                },
            };
            if (isNew) {
                payload.data.slug = slug || name.toLowerCase().replace(/\s+/g, "-");
                const res = await authApi.post("/category-groups", payload);
                const created = res.data || res;
                router.push(`/${created.documentId}/category-group`);
            } else {
                await authApi.put(`/category-groups/${documentId}`, payload);
                toast("Category group updated!", "success");
            }
        } catch (err) {
            console.error("Failed to save category group", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this category group?")) return;
        try {
            await authApi.del(`/category-groups/${documentId}`);
            router.push("/category-groups");
        } catch (err) {
            console.error("Failed to delete category group", err);
            toast("Failed to delete.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/category-groups">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Category Group" : "Edit Category Group"}</h2>
                    <div className="ms-auto d-flex gap-2">
                        {!isNew && (
                            <button className="btn btn-sm btn-outline-danger" onClick={handleDelete}>
                                <i className="fas fa-trash me-1"></i>Delete
                            </button>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving…" : isNew ? "Create Category Group" : "Save Changes"}
                        </button>
                    </div>
                </div>

                {loading && <p>Loading...</p>}
                {!loading && !isNew && !group && <div className="alert alert-warning">Category group not found.</div>}

                {!loading && (isNew || group) && (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Name</label>
                                        <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} />
                                        <div className="form-text">This name is used as the section title on the website (e.g. &quot;Explore Categories&quot;).</div>
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
                                </div>
                            </div>

                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-folder me-2"></i>
                                    <strong>Categories</strong>
                                    <span className="badge bg-primary ms-2">{selectedCategoryIds.length}</span>
                                </div>
                                <div className="card-body">
                                    <p className="text-muted small mb-2">Select categories to include in this group.</p>
                                    {allCategories.length === 0 ? (
                                        <p className="text-muted small">No categories available.</p>
                                    ) : (
                                        <div className="d-flex flex-wrap gap-2">
                                            {allCategories.map(c => {
                                                const selected = selectedCategoryIds.includes(c.documentId);
                                                return (
                                                    <button key={c.documentId} type="button" className={`btn btn-sm ${selected ? "btn-success" : "btn-outline-secondary"}`} onClick={() => toggleCategory(c.documentId)}>
                                                        {selected && <i className="fas fa-check me-1"></i>}{c.name}
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
