import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import { useToast } from "../../components/Toast";

const PROVIDERS = ["own_rider", "easypost", "custom"];

function EntityPicker({ title, allEntities, selectedIds, onToggle, onRemoveAll, labelFn, hrefFn }) {
    const [tab, setTab] = useState("connected");
    const [search, setSearch] = useState("");

    const connected = allEntities.filter(e => selectedIds.includes(e.documentId));
    const filtered = !search.trim()
        ? allEntities
        : allEntities.filter(e => (labelFn(e) || "").toLowerCase().includes(search.toLowerCase()));

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
                <div className="d-flex flex-wrap gap-1" style={{ maxHeight: 220, overflowY: "auto" }}>
                    {(tab === "connected" ? connected : filtered).map(e => {
                        const selected = selectedIds.includes(e.documentId);
                        return (
                            <div key={e.documentId} className="d-inline-flex align-items-center gap-1">
                                <button
                                    type="button"
                                    className={`btn btn-sm ${selected ? "btn-success" : "btn-outline-secondary"}`}
                                    onClick={() => onToggle(e.documentId)}
                                >
                                    {selected && <i className="fas fa-check me-1"></i>}{labelFn(e)}
                                </button>
                                {hrefFn && (
                                    <Link href={hrefFn(e)} className="btn btn-sm btn-outline-primary" title="Open">
                                        <i className="fas fa-external-link-alt"></i>
                                    </Link>
                                )}
                            </div>
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

export default function DeliveryMethodDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [method, setMethod] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();
    const isNew = documentId === "new";

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [serviceProvider, setServiceProvider] = useState("custom");
    const [baseCost, setBaseCost] = useState("0");
    const [perKgRate, setPerKgRate] = useState("0");
    const [freeShippingThreshold, setFreeShippingThreshold] = useState("");
    const [estimatedDaysMin, setEstimatedDaysMin] = useState("1");
    const [estimatedDaysMax, setEstimatedDaysMax] = useState("3");
    const [priority, setPriority] = useState("0");
    const [isActive, setIsActive] = useState(true);
    const [offerTimeoutMinutes, setOfferTimeoutMinutes] = useState("5");
    const [maxRidersToOffer, setMaxRidersToOffer] = useState("10");

    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [selectedPageIds, setSelectedPageIds] = useState([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);

    const [allGroups, setAllGroups] = useState([]);
    const [allPages, setAllPages] = useState([]);
    const [allCategories, setAllCategories] = useState([]);

    useEffect(() => {
        if (!jwt) return;
        Promise.all([
            authApi.get("/product-groups", { status: "draft", fields: ["documentId", "name"], pagination: { pageSize: 200 } }),
            authApi.get("/cms-pages", { status: "draft", fields: ["documentId", "title", "slug"], pagination: { pageSize: 200 } }),
            authApi.get("/categories", { status: "draft", fields: ["documentId", "name"], pagination: { pageSize: 200 } }),
        ])
            .then(([gRes, pRes, cRes]) => {
                setAllGroups(gRes.data || []);
                setAllPages(pRes.data || []);
                setAllCategories(cRes.data || []);
            })
            .catch(err => console.error("Failed to load linked entities", err));
    }, [jwt]);

    useEffect(() => {
        if (!jwt || !documentId || isNew) {
            setLoading(false);
            return;
        }

        authApi.get(`/delivery-methods/${documentId}`, {
            populate: ["product_groups", "cms_pages", "categories"],
        })
            .then((res) => {
                const m = res.data || res;
                setMethod(m);
                setName(m.name || "");
                setDescription(m.description || "");
                setServiceProvider(m.service_provider || "custom");
                setBaseCost(String(m.base_cost ?? 0));
                setPerKgRate(String(m.per_kg_rate ?? 0));
                setFreeShippingThreshold(m.free_shipping_threshold == null ? "" : String(m.free_shipping_threshold));
                setEstimatedDaysMin(String(m.estimated_days_min ?? 1));
                setEstimatedDaysMax(String(m.estimated_days_max ?? 3));
                setPriority(String(m.priority ?? 0));
                setIsActive(m.is_active !== false);
                setOfferTimeoutMinutes(String(m.offer_timeout_minutes ?? 5));
                setMaxRidersToOffer(String(m.max_riders_to_offer ?? 10));
                setSelectedGroupIds((m.product_groups || []).map(g => g.documentId));
                setSelectedPageIds((m.cms_pages || []).map(p => p.documentId));
                setSelectedCategoryIds((m.categories || []).map(c => c.documentId));
            })
            .catch((err) => {
                console.error("Failed to load delivery method", err);
                toast("Failed to load delivery method.", "danger");
            })
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew, toast]);

    const toggleId = (setter) => (docId) => {
        setter(prev => prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]);
    };

    const removeAll = (setter) => () => setter([]);

    const buildPayload = () => ({
        data: {
            name: name.trim(),
            description: description.trim() || null,
            service_provider: serviceProvider,
            base_cost: Number(baseCost || 0),
            per_kg_rate: Number(perKgRate || 0),
            free_shipping_threshold: freeShippingThreshold === "" ? null : Number(freeShippingThreshold),
            estimated_days_min: Number(estimatedDaysMin || 1),
            estimated_days_max: Number(estimatedDaysMax || 3),
            priority: Number(priority || 0),
            is_active: isActive,
            offer_timeout_minutes: Number(offerTimeoutMinutes || 5),
            max_riders_to_offer: Number(maxRidersToOffer || 10),
            product_groups: { set: selectedGroupIds },
            cms_pages: { set: selectedPageIds },
            categories: { set: selectedCategoryIds },
        },
    });

    const handleSave = async () => {
        if (!name.trim()) {
            toast("Delivery method name is required.", "warning");
            return;
        }

        setSaving(true);
        try {
            if (isNew) {
                const res = await authApi.post("/delivery-methods", buildPayload());
                const created = res.data || res;
                toast("Delivery method created.", "success");
                router.push(`/${created.documentId}/delivery-method`);
            } else {
                await authApi.put(`/delivery-methods/${documentId}`, buildPayload());
                toast("Delivery method updated.", "success");
            }
        } catch (err) {
            console.error("Failed to save delivery method", err);
            toast("Failed to save delivery method.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (isNew) return;
        if (!confirm("Are you sure you want to delete this delivery method?")) return;

        try {
            await authApi.del(`/delivery-methods/${documentId}`);
            toast("Delivery method deleted.", "success");
            router.push("/delivery-methods");
        } catch (err) {
            console.error("Failed to delete delivery method", err);
            toast("Failed to delete delivery method.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/delivery-methods">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Delivery Method" : "Edit Delivery Method"}</h2>
                    <div className="ms-auto d-flex gap-2">
                        {!isNew && (
                            <button className="btn btn-sm btn-outline-danger" onClick={handleDelete}>
                                <i className="fas fa-trash me-1"></i>Delete
                            </button>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving..." : isNew ? "Create Delivery Method" : "Save Delivery Method"}
                        </button>
                    </div>
                </div>

                {loading && <p>Loading...</p>}
                {!loading && !isNew && !method && <div className="alert alert-warning">Delivery method not found.</div>}

                {!loading && (isNew || method) && (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="row g-3">
                                        <div className="col-md-6">
                                            <label className="form-label">Name</label>
                                            <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label">Description</label>
                                            <input type="text" className="form-control" value={description} onChange={e => setDescription(e.target.value)} />
                                        </div>
                                        <div className="col-md-3">
                                            <label className="form-label">Provider</label>
                                            <select className="form-select" value={serviceProvider} onChange={e => setServiceProvider(e.target.value)}>
                                                {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                        </div>
                                        <div className="col-md-3">
                                            <label className="form-label">Base Cost</label>
                                            <input type="number" min="0" step="0.01" className="form-control" value={baseCost} onChange={e => setBaseCost(e.target.value)} />
                                        </div>
                                        <div className="col-md-3">
                                            <label className="form-label">Per Kg Rate</label>
                                            <input type="number" min="0" step="0.01" className="form-control" value={perKgRate} onChange={e => setPerKgRate(e.target.value)} />
                                        </div>
                                        <div className="col-md-3">
                                            <label className="form-label">Free Shipping Threshold</label>
                                            <input type="number" min="0" step="0.01" className="form-control" value={freeShippingThreshold} onChange={e => setFreeShippingThreshold(e.target.value)} />
                                        </div>
                                        <div className="col-md-2">
                                            <label className="form-label">Min Days</label>
                                            <input type="number" min="0" className="form-control" value={estimatedDaysMin} onChange={e => setEstimatedDaysMin(e.target.value)} />
                                        </div>
                                        <div className="col-md-2">
                                            <label className="form-label">Max Days</label>
                                            <input type="number" min="0" className="form-control" value={estimatedDaysMax} onChange={e => setEstimatedDaysMax(e.target.value)} />
                                        </div>
                                        <div className="col-md-2">
                                            <label className="form-label">Priority</label>
                                            <input type="number" className="form-control" value={priority} onChange={e => setPriority(e.target.value)} />
                                        </div>
                                        <div className="col-md-3">
                                            <label className="form-label">Offer Timeout (Minutes)</label>
                                            <input type="number" min="1" className="form-control" value={offerTimeoutMinutes} onChange={e => setOfferTimeoutMinutes(e.target.value)} />
                                        </div>
                                        <div className="col-md-3">
                                            <label className="form-label">Max Riders To Offer</label>
                                            <input type="number" min="1" className="form-control" value={maxRidersToOffer} onChange={e => setMaxRidersToOffer(e.target.value)} />
                                        </div>
                                        <div className="col-12">
                                            <div className="form-check">
                                                <input className="form-check-input" type="checkbox" id="methodActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                                                <label className="form-check-label" htmlFor="methodActive">Active</label>
                                            </div>
                                        </div>
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
                                hrefFn={e => `/${e.documentId}/product-group`}
                            />

                            <EntityPicker
                                title="CMS Pages"
                                allEntities={allPages}
                                selectedIds={selectedPageIds}
                                onToggle={toggleId(setSelectedPageIds)}
                                onRemoveAll={removeAll(setSelectedPageIds)}
                                labelFn={e => e.title || e.slug}
                                hrefFn={e => `/${e.documentId}/cms-page`}
                            />

                            <EntityPicker
                                title="Categories"
                                allEntities={allCategories}
                                selectedIds={selectedCategoryIds}
                                onToggle={toggleId(setSelectedCategoryIds)}
                                onRemoveAll={removeAll(setSelectedCategoryIds)}
                                labelFn={e => e.name}
                                hrefFn={e => `/${e.documentId}/category`}
                            />
                        </div>

                        <div className="col-md-4">
                            <div className="card mb-3">
                                <div className="card-header">Info</div>
                                <div className="card-body">
                                    {!isNew && method && (
                                        <div>
                                            <label className="form-label mb-0">Document ID</label>
                                            <code className="d-block small">{method.documentId}</code>
                                        </div>
                                    )}
                                    {isNew && <span className="text-muted small">Save to create this delivery method.</span>}
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
