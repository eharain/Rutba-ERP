import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import MarkdownEditor from "@rutba/pos-shared/components/MarkdownEditor";
import Link from "next/link";
import { useToast } from "../../components/Toast";

function EntityPicker({ title, allEntities, selectedIds, onToggle, onRemoveAll, labelFn }) {
    const [tab, setTab] = useState("connected");
    const [search, setSearch] = useState("");

    const connected = useMemo(
        () => allEntities.filter(e => selectedIds.includes(e.documentId)),
        [allEntities, selectedIds]
    );

    const filtered = useMemo(() => {
        if (!search.trim()) return allEntities;
        const q = search.toLowerCase();
        return allEntities.filter(e => (labelFn(e) || "").toLowerCase().includes(q));
    }, [allEntities, search, labelFn]);

    return (
        <div className="card mb-3">
            <div className="card-header d-flex align-items-center justify-content-between">
                <span>{title} <span className="badge bg-primary ms-1">{connected.length}</span></span>
                {connected.length > 0 && (
                    <button className="btn btn-sm btn-outline-danger" onClick={onRemoveAll}>Remove All</button>
                )}
            </div>
            <div className="card-body">
                <ul className="nav nav-tabs mb-2">
                    <li className="nav-item">
                        <button className={`nav-link ${tab === "connected" ? "active" : ""}`} onClick={() => setTab("connected")}>
                            Connected ({connected.length})
                        </button>
                    </li>
                    <li className="nav-item">
                        <button className={`nav-link ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
                            All ({allEntities.length})
                        </button>
                    </li>
                </ul>
                {tab === "all" && (
                    <input type="text" className="form-control form-control-sm mb-2" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
                )}
                <div className="d-flex flex-wrap gap-1" style={{ maxHeight: 200, overflowY: "auto" }}>
                    {(tab === "connected" ? connected : filtered).map(e => {
                        const sel = selectedIds.includes(e.documentId);
                        return (
                            <button key={e.documentId} type="button" className={`btn btn-sm ${sel ? "btn-success" : "btn-outline-secondary"}`} onClick={() => onToggle(e.documentId)}>
                                {sel && <i className="fas fa-check me-1"></i>}{labelFn(e)}
                            </button>
                        );
                    })}
                    {(tab === "connected" ? connected : filtered).length === 0 && (
                        <span className="text-muted small">None</span>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function OfferDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [offer, setOffer] = useState(null);
    const [isPublished, setIsPublished] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();
    const isNew = documentId === "new";

    const [name, setName] = useState("");
    const [active, setActive] = useState(false);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [description, setDescription] = useState("");
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [selectedPageIds, setSelectedPageIds] = useState([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);

    // All entities for pickers
    const [allGroups, setAllGroups] = useState([]);
    const [allPages, setAllPages] = useState([]);
    const [allCategories, setAllCategories] = useState([]);

    // Load picker options
    useEffect(() => {
        if (!jwt) return;
        Promise.all([
            authApi.get("/product-groups", { status: 'draft', fields: ["documentId", "name"], pagination: { pageSize: 200 } }),
            authApi.get("/cms-pages", { status: 'draft', fields: ["documentId", "title", "slug"], pagination: { pageSize: 200 } }),
            authApi.get("/categories", { status: 'draft', fields: ["documentId", "name"], pagination: { pageSize: 200 } }),
        ]).then(([gRes, pRes, cRes]) => {
            setAllGroups(gRes.data || []);
            setAllPages(pRes.data || []);
            setAllCategories(cRes.data || []);
        }).catch(err => console.error("Failed to load picker data", err));
    }, [jwt]);

    // Load offer
    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        Promise.all([
            authApi.get(`/sale-offers/${documentId}`, { status: 'draft', populate: ["product_groups", "cms_pages", "categories"] }),
            authApi.get(`/sale-offers/${documentId}`, { status: 'published', fields: ["documentId"] }).catch(() => ({ data: null })),
        ]).then(([draftRes, pubRes]) => {
            const o = draftRes.data || draftRes;
            setOffer(o);
            setIsPublished(!!(pubRes.data));
            setName(o.name || "");
            setActive(o.active === true);
            setStartDate(o.start_date ? o.start_date.slice(0, 16) : "");
            setEndDate(o.end_date ? o.end_date.slice(0, 16) : "");
            setDescription(o.description || "");
            setSelectedGroupIds((o.product_groups || []).map(g => g.documentId));
            setSelectedPageIds((o.cms_pages || []).map(p => p.documentId));
            setSelectedCategoryIds((o.categories || []).map(c => c.documentId));
        }).catch(err => console.error("Failed to load sale offer", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const toggleId = (setter) => (docId) => {
        setter(prev => prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]);
    };
    const removeAll = (setter) => () => setter([]);

    const buildPayload = () => ({
        data: {
            name,
            active,
            start_date: startDate || null,
            end_date: endDate || null,
            description: description || null,
            product_groups: { set: selectedGroupIds },
            cms_pages: { set: selectedPageIds },
            categories: { set: selectedCategoryIds },
        },
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            if (isNew) {
                const res = await authApi.post("/sale-offers", buildPayload());
                const created = res.data || res;
                router.push(`/${created.documentId}/sale-offer`);
            } else {
                await authApi.put(`/sale-offers/${documentId}?status=draft`, buildPayload());
                toast("Draft saved!", "success");
            }
        } catch (err) {
            console.error("Failed to save sale offer", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        setSaving(true);
        try {
            await authApi.put(`/sale-offers/${documentId}?status=draft`, buildPayload());
            await authApi.post(`/sale-offers/${documentId}/publish`, {});
            setIsPublished(true);
            toast("Offer saved & published!", "success");
        } catch (err) {
            console.error("Failed to publish sale offer", err);
            toast("Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setSaving(true);
        try {
            await authApi.post(`/sale-offers/${documentId}/unpublish`, {});
            setIsPublished(false);
            toast("Offer unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish sale offer", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this sale offer?")) return;
        try {
            await authApi.del(`/sale-offers/${documentId}`);
            router.push("/sale-offers");
        } catch (err) {
            console.error("Failed to delete sale offer", err);
            toast("Failed to delete.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/sale-offers">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Sale Offer" : "Edit Sale Offer"}</h2>
                    {!isNew && isPublished && <span className="badge bg-success ms-2 align-self-center">Published</span>}
                    {!isNew && offer && !isPublished && <span className="badge bg-secondary ms-2 align-self-center">Draft</span>}
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
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving…" : isNew ? "Create Sale Offer" : "Save Draft"}
                        </button>
                        {!isNew && (
                            <button className="btn btn-sm btn-success" onClick={handlePublish} disabled={saving}>
                                <i className="fas fa-upload me-1"></i>{saving ? "Publishing…" : "Save & Publish"}
                            </button>
                        )}
                    </div>
                </div>

                {loading && <p>Loading...</p>}
                {!loading && !isNew && !offer && <div className="alert alert-warning">Sale offer not found.</div>}

                {!loading && (isNew || offer) && (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Sale Offer Name</label>
                                        <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer Sale 50% Off" />
                                    </div>
                                    <div className="form-check mb-3">
                                        <input className="form-check-input" type="checkbox" id="offerActive" checked={active} onChange={e => setActive(e.target.checked)} />
                                        <label className="form-check-label" htmlFor="offerActive">Active</label>
                                    </div>
                                    <div className="row mb-3">
                                        <div className="col-md-6">
                                            <label className="form-label">Start Date</label>
                                            <input type="datetime-local" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                            <small className="text-muted">Empty = immediate</small>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label">End Date</label>
                                            <input type="datetime-local" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} />
                                            <small className="text-muted">Empty = indefinite</small>
                                        </div>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Description (Markdown)</label>
                                        <MarkdownEditor value={description} onChange={e => setDescription(e.target.value)} name="description" rows={4} placeholder="Optional description or terms..." />
                                    </div>
                                </div>
                            </div>

                            <EntityPicker
                                title="Product Groups"
                                allEntities={allGroups}
                                selectedIds={selectedGroupIds}
                                onToggle={toggleId(setSelectedGroupIds)}
                                onRemoveAll={removeAll(setSelectedGroupIds)}
                                labelFn={e => e.name}
                            />

                            <EntityPicker
                                title="CMS Pages"
                                allEntities={allPages}
                                selectedIds={selectedPageIds}
                                onToggle={toggleId(setSelectedPageIds)}
                                onRemoveAll={removeAll(setSelectedPageIds)}
                                labelFn={e => e.title || e.slug}
                            />

                            <EntityPicker
                                title="Categories"
                                allEntities={allCategories}
                                selectedIds={selectedCategoryIds}
                                onToggle={toggleId(setSelectedCategoryIds)}
                                onRemoveAll={removeAll(setSelectedCategoryIds)}
                                labelFn={e => e.name}
                            />
                        </div>

                        <div className="col-md-4">
                            <div className="card mb-3">
                                <div className="card-header">Info</div>
                                <div className="card-body">
                                    {!isNew && offer && (
                                        <>
                                            <div className="mb-2">
                                                <label className="form-label mb-0">Document ID</label>
                                                <code className="d-block small">{offer.documentId}</code>
                                            </div>
                                            {isPublished && <span className="badge bg-success">Published</span>}
                                            {!isPublished && <span className="badge bg-secondary">Draft</span>}
                                        </>
                                    )}
                                    {isNew && <span className="text-muted small">Save to create this offer.</span>}
                                </div>
                            </div>
                            <div className="card mb-3">
                                <div className="card-header">Summary</div>
                                <div className="card-body small">
                                    <div className="mb-1"><strong>Groups:</strong> {selectedGroupIds.length}</div>
                                    <div className="mb-1"><strong>Pages:</strong> {selectedPageIds.length}</div>
                                    <div className="mb-1"><strong>Categories:</strong> {selectedCategoryIds.length}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
