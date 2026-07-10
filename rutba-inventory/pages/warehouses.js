import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { WarehousesEndpoints, StorageLocationsEndpoints, BranchesEndpoints } from "@rutba/api-provider/endpoints";

const WAREHOUSE_TYPES = ["warehouse", "store", "transit", "virtual", "supplier", "customer"];
const LOCATION_TYPES = ["zone", "aisle", "rack", "shelf", "bin", "staging", "quarantine"];

const EMPTY_WH = { code: "", name: "", type: "warehouse", branch: "", address: "", is_default: false, is_active: true };
const EMPTY_LOC = { code: "", name: "", type: "bin", parent: "", is_pickable: true, is_receivable: true, is_active: true };

// Order a flat location list as a depth-tagged tree (parent before children).
function toTree(locations) {
    const byParent = {};
    for (const l of locations) {
        const pid = l.parent?.documentId || "root";
        (byParent[pid] = byParent[pid] || []).push(l);
    }
    const out = [];
    const walk = (pid, depth) => {
        for (const l of byParent[pid] || []) {
            out.push({ ...l, _depth: depth });
            walk(l.documentId, depth + 1);
        }
    };
    walk("root", 0);
    // Any locations whose parent isn't in this set (shouldn't happen) fall back to flat.
    if (out.length !== locations.length) {
        const seen = new Set(out.map((l) => l.documentId));
        for (const l of locations) if (!seen.has(l.documentId)) out.push({ ...l, _depth: 0 });
    }
    return out;
}

export default function WarehousesPage() {
    const { jwt } = useAuth();

    const [warehouses, setWarehouses] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null); // { text, variant }

    const [showWhForm, setShowWhForm] = useState(false);
    const [editingWh, setEditingWh] = useState(null);
    const [whForm, setWhForm] = useState({ ...EMPTY_WH });
    const [savingWh, setSavingWh] = useState(false);

    const [selected, setSelected] = useState(null);
    const [locations, setLocations] = useState([]);
    const [loadingLoc, setLoadingLoc] = useState(false);
    const [showLocForm, setShowLocForm] = useState(false);
    const [editingLoc, setEditingLoc] = useState(null);
    const [locForm, setLocForm] = useState({ ...EMPTY_LOC });
    const [savingLoc, setSavingLoc] = useState(false);

    const notify = (text, variant = "success") => setMsg({ text, variant });

    const loadWarehouses = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await WarehousesEndpoints.list(1, 200, { sort: ["name:asc"] });
            setWarehouses(res?.data || []);
        } catch (err) {
            console.error("Failed to load warehouses", err);
            notify("Failed to load warehouses.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    const loadBranches = useCallback(async () => {
        if (!jwt) return;
        try {
            // Use list() (populate: true) not searchBranches() — the latter sends a
            // mixed-array populate that Strapi rejects with 400. We only need name.
            const res = await BranchesEndpoints.list({ pageSize: 200, sort: ["name:asc"] });
            setBranches(res?.data || []);
        } catch (err) {
            console.error("Failed to load branches", err);
        }
    }, [jwt]);

    useEffect(() => { loadWarehouses(); loadBranches(); }, [loadWarehouses, loadBranches]);

    const loadLocations = useCallback(async (wh) => {
        if (!wh) return;
        setLoadingLoc(true);
        try {
            const res = await StorageLocationsEndpoints.list(1, 1000, { warehouseDocId: wh.documentId, sort: ["code:asc"] });
            setLocations(res?.data || []);
        } catch (err) {
            console.error("Failed to load locations", err);
            notify("Failed to load storage locations.", "danger");
        } finally {
            setLoadingLoc(false);
        }
    }, []);

    const selectWarehouse = (wh) => {
        setSelected(wh);
        setShowLocForm(false);
        setEditingLoc(null);
        loadLocations(wh);
    };

    // ── Warehouse form ───────────────────────────────────────
    const openCreateWh = () => { setEditingWh(null); setWhForm({ ...EMPTY_WH }); setShowWhForm(true); };
    const openEditWh = (wh) => {
        setEditingWh(wh);
        setWhForm({
            code: wh.code || "", name: wh.name || "", type: wh.type || "warehouse",
            branch: wh.branch?.documentId || "", address: wh.address || "",
            is_default: !!wh.is_default, is_active: wh.is_active !== false,
        });
        setShowWhForm(true);
    };
    const changeWh = (e) => {
        const { name, value, type, checked } = e.target;
        setWhForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
    };
    const submitWh = async (e) => {
        e.preventDefault();
        setSavingWh(true);
        try {
            const data = {
                code: whForm.code || null, name: whForm.name, type: whForm.type,
                address: whForm.address || null, is_default: whForm.is_default, is_active: whForm.is_active,
                branch: whForm.branch || null,
            };
            if (editingWh) {
                await WarehousesEndpoints.update(editingWh.documentId, { data });
                notify("Warehouse updated.");
            } else {
                await WarehousesEndpoints.create({ data });
                notify("Warehouse created.");
            }
            setShowWhForm(false); setEditingWh(null); setWhForm({ ...EMPTY_WH });
            await loadWarehouses();
        } catch (err) {
            console.error("Failed to save warehouse", err);
            notify(err?.response?.data?.error?.message || "Failed to save warehouse.", "danger");
        } finally {
            setSavingWh(false);
        }
    };
    const deleteWh = async (wh) => {
        if (!window.confirm(`Delete warehouse "${wh.name}"? Its storage locations will be orphaned.`)) return;
        try {
            await WarehousesEndpoints.del(wh.documentId);
            notify("Warehouse deleted.");
            if (selected?.documentId === wh.documentId) { setSelected(null); setLocations([]); }
            await loadWarehouses();
        } catch (err) {
            console.error("Failed to delete warehouse", err);
            notify(err?.response?.data?.error?.message || "Failed to delete warehouse.", "danger");
        }
    };

    // ── Location form ────────────────────────────────────────
    const openCreateLoc = (parent = null) => {
        setEditingLoc(null);
        setLocForm({ ...EMPTY_LOC, parent: parent?.documentId || "" });
        setShowLocForm(true);
    };
    const openEditLoc = (loc) => {
        setEditingLoc(loc);
        setLocForm({
            code: loc.code || "", name: loc.name || "", type: loc.type || "bin",
            parent: loc.parent?.documentId || "",
            is_pickable: loc.is_pickable !== false, is_receivable: loc.is_receivable !== false,
            is_active: loc.is_active !== false,
        });
        setShowLocForm(true);
    };
    const changeLoc = (e) => {
        const { name, value, type, checked } = e.target;
        setLocForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
    };
    const submitLoc = async (e) => {
        e.preventDefault();
        if (!selected) return;
        setSavingLoc(true);
        try {
            const data = {
                code: locForm.code || null, name: locForm.name || null, type: locForm.type,
                is_pickable: locForm.is_pickable, is_receivable: locForm.is_receivable, is_active: locForm.is_active,
                warehouse: selected.documentId,
                parent: locForm.parent || null,
            };
            if (editingLoc) {
                await StorageLocationsEndpoints.update(editingLoc.documentId, { data });
                notify("Location updated.");
            } else {
                await StorageLocationsEndpoints.create({ data });
                notify("Location created.");
            }
            setShowLocForm(false); setEditingLoc(null); setLocForm({ ...EMPTY_LOC });
            await loadLocations(selected);
        } catch (err) {
            console.error("Failed to save location", err);
            notify(err?.response?.data?.error?.message || "Failed to save location.", "danger");
        } finally {
            setSavingLoc(false);
        }
    };
    const deleteLoc = async (loc) => {
        if (!window.confirm(`Delete location "${loc.code || loc.name}"?`)) return;
        try {
            await StorageLocationsEndpoints.del(loc.documentId);
            notify("Location deleted.");
            await loadLocations(selected);
        } catch (err) {
            console.error("Failed to delete location", err);
            notify(err?.response?.data?.error?.message || "Failed to delete location.", "danger");
        }
    };

    const tree = toTree(locations);
    // Parent options exclude the location being edited (can't be its own parent).
    const parentOptions = locations.filter((l) => !editingLoc || l.documentId !== editingLoc.documentId);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-warehouse me-2 text-primary"></i>Warehouses &amp; Locations</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreateWh}>
                        <i className="fas fa-plus me-1"></i>Add Warehouse
                    </button>
                </div>

                {msg && (
                    <div className={`alert alert-${msg.variant} alert-dismissible py-2`} role="alert">
                        {msg.text}
                        <button type="button" className="btn-close" onClick={() => setMsg(null)}></button>
                    </div>
                )}

                {showWhForm && (
                    <div className="card mb-4">
                        <div className="card-body">
                            <h5>{editingWh ? "Edit Warehouse" : "New Warehouse"}</h5>
                            <form onSubmit={submitWh}>
                                <div className="row g-3">
                                    <div className="col-md-3">
                                        <label className="form-label">Code</label>
                                        <input className="form-control" name="code" value={whForm.code} onChange={changeWh} placeholder="e.g. WH-MAIN" />
                                    </div>
                                    <div className="col-md-5">
                                        <label className="form-label">Name</label>
                                        <input className="form-control" name="name" value={whForm.name} onChange={changeWh} required placeholder="e.g. Main Warehouse" />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Type</label>
                                        <select className="form-select" name="type" value={whForm.type} onChange={changeWh}>
                                            {WAREHOUSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Branch</label>
                                        <select className="form-select" name="branch" value={whForm.branch} onChange={changeWh}>
                                            <option value="">— none —</option>
                                            {branches.map((b) => <option key={b.documentId} value={b.documentId}>{b.name || b.companyName || b.documentId}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-8">
                                        <label className="form-label">Address</label>
                                        <input className="form-control" name="address" value={whForm.address} onChange={changeWh} />
                                    </div>
                                    <div className="col-12 d-flex gap-4">
                                        <div className="form-check">
                                            <input className="form-check-input" type="checkbox" name="is_default" checked={whForm.is_default} onChange={changeWh} id="whDefault" />
                                            <label className="form-check-label" htmlFor="whDefault">Default (for backfill / receiving)</label>
                                        </div>
                                        <div className="form-check">
                                            <input className="form-check-input" type="checkbox" name="is_active" checked={whForm.is_active} onChange={changeWh} id="whActive" />
                                            <label className="form-check-label" htmlFor="whActive">Active</label>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 d-flex gap-2">
                                    <button className="btn btn-success btn-sm" type="submit" disabled={savingWh}>{savingWh ? "Saving..." : "Save"}</button>
                                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setShowWhForm(false); setEditingWh(null); }}>Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : warehouses.length === 0 ? (
                    <div className="alert alert-info">No warehouses yet. Click "Add Warehouse", or run the location backfill from the Stock module.</div>
                ) : (
                    <div className="table-responsive mb-4">
                        <table className="table table-hover align-middle">
                            <thead>
                                <tr><th>Code</th><th>Name</th><th>Type</th><th>Branch</th><th>Default</th><th>Active</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {warehouses.map((wh) => (
                                    <tr key={wh.documentId} className={selected?.documentId === wh.documentId ? "table-active" : ""}>
                                        <td><code>{wh.code || "—"}</code></td>
                                        <td>{wh.name}</td>
                                        <td><span className="badge bg-light text-dark border">{wh.type}</span></td>
                                        <td>{wh.branch?.name || "—"}</td>
                                        <td>{wh.is_default ? <i className="fas fa-check text-success"></i> : ""}</td>
                                        <td>{wh.is_active !== false ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Inactive</span>}</td>
                                        <td>
                                            <div className="d-flex gap-1">
                                                <button className="btn btn-sm btn-outline-info" title="Manage bins" onClick={() => selectWarehouse(wh)}><i className="fas fa-sitemap me-1"></i>Bins</button>
                                                <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => openEditWh(wh)}><i className="fas fa-pen"></i></button>
                                                <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => deleteWh(wh)}><i className="fas fa-trash"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {selected && (
                    <div className="card">
                        <div className="card-body">
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h5 className="mb-0"><i className="fas fa-sitemap me-2 text-info"></i>Storage Locations in <strong>{selected.name}</strong></h5>
                                <div className="d-flex gap-2">
                                    <button className="btn btn-primary btn-sm" onClick={() => openCreateLoc(null)}><i className="fas fa-plus me-1"></i>Add Location</button>
                                    <button className="btn btn-outline-secondary btn-sm" onClick={() => { setSelected(null); setLocations([]); }}>Close</button>
                                </div>
                            </div>

                            {showLocForm && (
                                <div className="border rounded p-3 mb-3 bg-light">
                                    <h6>{editingLoc ? "Edit Location" : "New Location"}</h6>
                                    <form onSubmit={submitLoc}>
                                        <div className="row g-3">
                                            <div className="col-md-3">
                                                <label className="form-label">Code</label>
                                                <input className="form-control" name="code" value={locForm.code} onChange={changeLoc} placeholder="e.g. A-01-03" />
                                            </div>
                                            <div className="col-md-4">
                                                <label className="form-label">Name</label>
                                                <input className="form-control" name="name" value={locForm.name} onChange={changeLoc} />
                                            </div>
                                            <div className="col-md-2">
                                                <label className="form-label">Type</label>
                                                <select className="form-select" name="type" value={locForm.type} onChange={changeLoc}>
                                                    {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-md-3">
                                                <label className="form-label">Parent</label>
                                                <select className="form-select" name="parent" value={locForm.parent} onChange={changeLoc}>
                                                    <option value="">— top level —</option>
                                                    {parentOptions.map((l) => <option key={l.documentId} value={l.documentId}>{l.code || l.name || l.documentId}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-12 d-flex gap-4">
                                                <div className="form-check">
                                                    <input className="form-check-input" type="checkbox" name="is_pickable" checked={locForm.is_pickable} onChange={changeLoc} id="locPick" />
                                                    <label className="form-check-label" htmlFor="locPick">Pickable</label>
                                                </div>
                                                <div className="form-check">
                                                    <input className="form-check-input" type="checkbox" name="is_receivable" checked={locForm.is_receivable} onChange={changeLoc} id="locRecv" />
                                                    <label className="form-check-label" htmlFor="locRecv">Receivable</label>
                                                </div>
                                                <div className="form-check">
                                                    <input className="form-check-input" type="checkbox" name="is_active" checked={locForm.is_active} onChange={changeLoc} id="locActive" />
                                                    <label className="form-check-label" htmlFor="locActive">Active</label>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-3 d-flex gap-2">
                                            <button className="btn btn-success btn-sm" type="submit" disabled={savingLoc}>{savingLoc ? "Saving..." : "Save"}</button>
                                            <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setShowLocForm(false); setEditingLoc(null); }}>Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {loadingLoc ? (
                                <div className="text-center py-4"><div className="spinner-border"></div></div>
                            ) : tree.length === 0 ? (
                                <div className="alert alert-info mb-0">No storage locations in this warehouse yet.</div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-sm table-hover align-middle mb-0">
                                        <thead>
                                            <tr><th>Code / Name</th><th>Type</th><th>Pickable</th><th>Receivable</th><th>Active</th><th>Actions</th></tr>
                                        </thead>
                                        <tbody>
                                            {tree.map((loc) => (
                                                <tr key={loc.documentId}>
                                                    <td style={{ paddingLeft: 12 + loc._depth * 22 }}>
                                                        {loc._depth > 0 && <i className="fas fa-angle-right text-muted me-1"></i>}
                                                        <code>{loc.code || "—"}</code>{loc.name ? <span className="text-muted ms-2">{loc.name}</span> : null}
                                                    </td>
                                                    <td><span className="badge bg-light text-dark border">{loc.type}</span></td>
                                                    <td>{loc.is_pickable !== false ? <i className="fas fa-check text-success"></i> : <i className="fas fa-minus text-muted"></i>}</td>
                                                    <td>{loc.is_receivable !== false ? <i className="fas fa-check text-success"></i> : <i className="fas fa-minus text-muted"></i>}</td>
                                                    <td>{loc.is_active !== false ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Off</span>}</td>
                                                    <td>
                                                        <div className="d-flex gap-1">
                                                            <button className="btn btn-sm btn-outline-secondary" title="Add child" onClick={() => openCreateLoc(loc)}><i className="fas fa-plus"></i></button>
                                                            <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => openEditLoc(loc)}><i className="fas fa-pen"></i></button>
                                                            <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => deleteLoc(loc)}><i className="fas fa-trash"></i></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
