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
    const [isPublished, setIsPublished] = useState(false);
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
        Promise.all([
            authApi.get(`/category-groups/${documentId}`, { status: 'draft', populate: ["categories"] }),
            authApi.get(`/category-groups/${documentId}`, { status: 'published', fields: ["documentId"] }).catch(() => ({ data: null })),
        ])
            .then(([draftRes, pubRes]) => {
                const g = draftRes.data || draftRes;
                setGroup(g);
                setIsPublished(!!(pubRes.data));
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
            const res = await authApi.get("/categories", { status: 'draft', pagination: { pageSize: 200 }, sort: ["name:asc"] });
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
                await authApi.put(`/category-groups/${documentId}?status=draft`, payload);
                toast("Draft saved!", "success");
            }
        } catch (err) {
            console.error("Failed to save category group", err);
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
                    sort_order: sortOrder,
                    categories: { set: selectedCategoryIds },
                },
            };
            await authApi.put(`/category-groups/${documentId}?status=draft`, payload);
            await authApi.post(`/category-groups/${documentId}/publish`, {});
            setIsPublished(true);
            toast("Category group saved & published!", "success");
        } catch (err) {
            console.error("Failed to publish category group", err);
            toast("Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setSaving(true);
        try {
            await authApi.post(`/category-groups/${documentId}/unpublish`, {});
            setIsPublished(false);
            toast("Category group unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish category group", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDiscardDraft = async () => {
        if (!confirm("Save current draft and load the published version into the editor?")) return;
        setSaving(true);
        try {
            await authApi.put(`/category-groups/${documentId}?status=draft`, {
                data: { name, sort_order: sortOrder, categories: { set: selectedCategoryIds } },
            });
            const res = await authApi.get(`/category-groups/${documentId}`, { status: 'published', populate: ["categories"] });
            const g = res.data || res;
            if (!g) { toast("No published version found.", "warning"); return; }
            setName(g.name || "");
            setSlug(g.slug || "");
            setSortOrder(g.sort_order ?? 0);
            setSelectedCategoryIds((g.categories || []).map(c => c.documentId));
            toast("Draft saved. Showing published version — click Save Draft to overwrite.", "success");
        } catch (err) {
            console.error("Failed to load published version", err);
            toast("Failed to load published version.", "danger");
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
                            {saving ? "Saving…" : isNew ? "Create Category Group" : "Save Draft"}
                        </button>
                        {!isNew && (
                            <button className="btn btn-sm btn-success" onClick={handlePublish} disabled={saving}>
                                <i className="fas fa-upload me-1"></i>{saving ? "Publishing…" : "Save & Publish"}
                            </button>
                        )}
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
                                    {!isNew && isPublished && <span className="badge bg-success">Published</span>}
                                    {!isNew && group && !isPublished && <span className="badge bg-secondary">Draft</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
