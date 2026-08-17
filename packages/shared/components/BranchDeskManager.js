import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { BranchesEndpoints, StorageLocationsEndpoints } from "@rutba/api-provider/endpoints";

/**
 * BranchDeskManager — admin CRUD for branches, their sales desks, and their
 * storage-location (bin) hierarchy. Shared by the inventory and stock apps.
 *
 * Since the warehouse entity was merged into branch (1 branch = 1 stock
 * location), a branch now carries the location fields (location_code /
 * location_type / is_default_location / is_active) and owns the bin tree that
 * used to hang off the warehouse. Desks stay as the embedded `pos.sales-desks`
 * component and are edited inline on the branch.
 *
 * Wrap this in each app's own Layout + ProtectedRoute.
 */

const LOCATION_TYPES = ["warehouse", "store", "transit", "virtual", "supplier", "customer"];
const BIN_TYPES = ["zone", "aisle", "rack", "shelf", "bin", "staging", "quarantine"];

const EMPTY_BRANCH = {
    name: "", companyName: "", phone: "", email: "", address: "", city: "",
    location_code: "", location_type: "warehouse", is_default_location: false, is_active: true,
    desks: [],
};
const EMPTY_DESK = { name: "", note: "", invoice_prefix: "", has_cash_register: true, has_sale_returns: false };
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
    if (out.length !== locations.length) {
        const seen = new Set(out.map((l) => l.documentId));
        for (const l of locations) if (!seen.has(l.documentId)) out.push({ ...l, _depth: 0 });
    }
    return out;
}

export default function BranchDeskManager({ title = "Branches, Desks & Locations" }) {
    const { jwt } = useAuth();

    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null); // { text, variant }

    const [showBranchForm, setShowBranchForm] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [branchForm, setBranchForm] = useState({ ...EMPTY_BRANCH });
    const [savingBranch, setSavingBranch] = useState(false);

    const [selected, setSelected] = useState(null);
    const [locations, setLocations] = useState([]);
    const [loadingLoc, setLoadingLoc] = useState(false);
    const [showLocForm, setShowLocForm] = useState(false);
    const [editingLoc, setEditingLoc] = useState(null);
    const [locForm, setLocForm] = useState({ ...EMPTY_LOC });
    const [savingLoc, setSavingLoc] = useState(false);

    const notify = (text, variant = "success") => setMsg({ text, variant });

    const loadBranches = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await BranchesEndpoints.listWithDesks({ pageSize: 200, sort: ["name:asc"] });
            setBranches(res?.data || []);
        } catch (err) {
            console.error("Failed to load branches", err);
            notify("Failed to load branches.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadBranches(); }, [loadBranches]);

    const loadLocations = useCallback(async (branch) => {
        if (!branch) return;
        setLoadingLoc(true);
        try {
            const res = await StorageLocationsEndpoints.list(1, 1000, { branchDocId: branch.documentId, sort: ["code:asc"] });
            setLocations(res?.data || []);
        } catch (err) {
            console.error("Failed to load locations", err);
            notify("Failed to load storage locations.", "danger");
        } finally {
            setLoadingLoc(false);
        }
    }, []);

    const selectBranch = (branch) => {
        setSelected(branch);
        setShowLocForm(false);
        setEditingLoc(null);
        loadLocations(branch);
    };

    // ── Branch form ──────────────────────────────────────────
    const openCreateBranch = () => { setEditingBranch(null); setBranchForm({ ...EMPTY_BRANCH, desks: [] }); setShowBranchForm(true); };
    const openEditBranch = (b) => {
        setEditingBranch(b);
        setBranchForm({
            name: b.name || "", companyName: b.companyName || "", phone: b.phone || "",
            email: b.email || "", address: b.address || "", city: b.city || "",
            location_code: b.location_code || "", location_type: b.location_type || "warehouse",
            is_default_location: !!b.is_default_location, is_active: b.is_active !== false,
            desks: (b.desks || []).map((d) => ({
                id: d.id,
                name: d.name || "", note: d.note || "", invoice_prefix: d.invoice_prefix || "",
                has_cash_register: d.has_cash_register !== false, has_sale_returns: !!d.has_sale_returns,
            })),
        });
        setShowBranchForm(true);
    };
    const changeBranch = (e) => {
        const { name, value, type, checked } = e.target;
        setBranchForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
    };

    // Desk row editing (inline on the branch form).
    const addDesk = () => setBranchForm((p) => ({ ...p, desks: [...p.desks, { ...EMPTY_DESK }] }));
    const removeDesk = (idx) => setBranchForm((p) => ({ ...p, desks: p.desks.filter((_, i) => i !== idx) }));
    const changeDesk = (idx, e) => {
        const { name, value, type, checked } = e.target;
        setBranchForm((p) => ({
            ...p,
            desks: p.desks.map((d, i) => (i === idx ? { ...d, [name]: type === "checkbox" ? checked : value } : d)),
        }));
    };

    const submitBranch = async (e) => {
        e.preventDefault();
        setSavingBranch(true);
        try {
            const data = {
                name: branchForm.name, companyName: branchForm.companyName || null,
                phone: branchForm.phone || null, email: branchForm.email || null,
                address: branchForm.address || null, city: branchForm.city || null,
                location_code: branchForm.location_code || null, location_type: branchForm.location_type,
                is_default_location: branchForm.is_default_location, is_active: branchForm.is_active,
                // Preserve component ids so existing desks (and their denormalised
                // desk_id refs on cash-registers) update in place rather than churn.
                desks: branchForm.desks.map((d) => ({
                    ...(d.id ? { id: d.id } : {}),
                    name: d.name, note: d.note || null, invoice_prefix: d.invoice_prefix || null,
                    has_cash_register: d.has_cash_register, has_sale_returns: d.has_sale_returns,
                })),
            };
            if (editingBranch) {
                await BranchesEndpoints.update(editingBranch.documentId, { data });
                notify("Branch updated.");
            } else {
                await BranchesEndpoints.create({ data });
                notify("Branch created.");
            }
            setShowBranchForm(false); setEditingBranch(null); setBranchForm({ ...EMPTY_BRANCH, desks: [] });
            await loadBranches();
        } catch (err) {
            console.error("Failed to save branch", err);
            notify(err?.response?.data?.error?.message || "Failed to save branch.", "danger");
        } finally {
            setSavingBranch(false);
        }
    };
    const deleteBranch = async (b) => {
        if (!window.confirm(`Delete branch "${b.name}"? Its storage locations will be orphaned.`)) return;
        try {
            await BranchesEndpoints.del(b.documentId);
            notify("Branch deleted.");
            if (selected?.documentId === b.documentId) { setSelected(null); setLocations([]); }
            await loadBranches();
        } catch (err) {
            console.error("Failed to delete branch", err);
            notify(err?.response?.data?.error?.message || "Failed to delete branch.", "danger");
        }
    };

    // ── Location (bin) form ──────────────────────────────────
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
                branch: selected.documentId,
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
    const parentOptions = locations.filter((l) => !editingLoc || l.documentId !== editingLoc.documentId);

    return (
        <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h3><i className="fas fa-store me-2 text-primary"></i>{title}</h3>
                <button className="btn btn-primary btn-sm" onClick={openCreateBranch}>
                    <i className="fas fa-plus me-1"></i>Add Branch
                </button>
            </div>

            {msg && (
                <div className={`alert alert-${msg.variant} alert-dismissible py-2`} role="alert">
                    {msg.text}
                    <button type="button" className="btn-close" onClick={() => setMsg(null)}></button>
                </div>
            )}

            {showBranchForm && (
                <div className="card mb-4">
                    <div className="card-body">
                        <h5>{editingBranch ? "Edit Branch" : "New Branch"}</h5>
                        <form onSubmit={submitBranch}>
                            <div className="row g-3">
                                <div className="col-md-5">
                                    <label className="form-label">Name</label>
                                    <input className="form-control" name="name" value={branchForm.name} onChange={changeBranch} required placeholder="e.g. Main Store" />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Company name</label>
                                    <input className="form-control" name="companyName" value={branchForm.companyName} onChange={changeBranch} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Location type</label>
                                    <select className="form-select" name="location_type" value={branchForm.location_type} onChange={changeBranch}>
                                        {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Location code</label>
                                    <input className="form-control" name="location_code" value={branchForm.location_code} onChange={changeBranch} placeholder="e.g. WH-MAIN" />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Phone</label>
                                    <input className="form-control" name="phone" value={branchForm.phone} onChange={changeBranch} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Email</label>
                                    <input className="form-control" name="email" value={branchForm.email} onChange={changeBranch} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">City</label>
                                    <input className="form-control" name="city" value={branchForm.city} onChange={changeBranch} />
                                </div>
                                <div className="col-md-9">
                                    <label className="form-label">Address</label>
                                    <input className="form-control" name="address" value={branchForm.address} onChange={changeBranch} />
                                </div>
                                <div className="col-md-3 d-flex align-items-end gap-4">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" name="is_default_location" checked={branchForm.is_default_location} onChange={changeBranch} id="brDefault" />
                                        <label className="form-check-label" htmlFor="brDefault">Default</label>
                                    </div>
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" name="is_active" checked={branchForm.is_active} onChange={changeBranch} id="brActive" />
                                        <label className="form-check-label" htmlFor="brActive">Active</label>
                                    </div>
                                </div>
                            </div>

                            {/* Desks (repeatable component on the branch) */}
                            <div className="mt-4 d-flex justify-content-between align-items-center">
                                <h6 className="mb-0"><i className="fas fa-desktop me-2 text-secondary"></i>Sales Desks</h6>
                                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={addDesk}><i className="fas fa-plus me-1"></i>Add Desk</button>
                            </div>
                            {branchForm.desks.length === 0 ? (
                                <div className="text-muted small mt-2">No desks. A branch needs at least one desk to run a POS terminal.</div>
                            ) : (
                                <div className="table-responsive mt-2">
                                    <table className="table table-sm align-middle mb-0">
                                        <thead>
                                            <tr><th>Name</th><th>Invoice prefix</th><th>Note</th><th className="text-center">Register</th><th className="text-center">Returns</th><th></th></tr>
                                        </thead>
                                        <tbody>
                                            {branchForm.desks.map((d, idx) => (
                                                <tr key={idx}>
                                                    <td><input className="form-control form-control-sm" name="name" value={d.name} onChange={(e) => changeDesk(idx, e)} required placeholder="Desk name" /></td>
                                                    <td><input className="form-control form-control-sm" name="invoice_prefix" value={d.invoice_prefix} onChange={(e) => changeDesk(idx, e)} placeholder="INV" /></td>
                                                    <td><input className="form-control form-control-sm" name="note" value={d.note} onChange={(e) => changeDesk(idx, e)} /></td>
                                                    <td className="text-center"><input className="form-check-input" type="checkbox" name="has_cash_register" checked={d.has_cash_register} onChange={(e) => changeDesk(idx, e)} /></td>
                                                    <td className="text-center"><input className="form-check-input" type="checkbox" name="has_sale_returns" checked={d.has_sale_returns} onChange={(e) => changeDesk(idx, e)} /></td>
                                                    <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeDesk(idx)}><i className="fas fa-trash"></i></button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="mt-3 d-flex gap-2">
                                <button className="btn btn-success btn-sm" type="submit" disabled={savingBranch}>{savingBranch ? "Saving..." : "Save"}</button>
                                <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setShowBranchForm(false); setEditingBranch(null); }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-center py-5"><div className="spinner-border"></div></div>
            ) : branches.length === 0 ? (
                <div className="alert alert-info">No branches yet. Click "Add Branch" to create one.</div>
            ) : (
                <div className="table-responsive mb-4">
                    <table className="table table-hover align-middle">
                        <thead>
                            <tr><th>Code</th><th>Name</th><th>Type</th><th className="text-center">Desks</th><th>Default</th><th>Active</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {branches.map((b) => (
                                <tr key={b.documentId} className={selected?.documentId === b.documentId ? "table-active" : ""}>
                                    <td><code>{b.location_code || "—"}</code></td>
                                    <td>{b.name}</td>
                                    <td><span className="badge bg-light text-dark border">{b.location_type || "warehouse"}</span></td>
                                    <td className="text-center">{(b.desks || []).length}</td>
                                    <td>{b.is_default_location ? <i className="fas fa-check text-success"></i> : ""}</td>
                                    <td>{b.is_active !== false ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Inactive</span>}</td>
                                    <td>
                                        <div className="d-flex gap-1">
                                            <button className="btn btn-sm btn-outline-info" title="Manage bins" onClick={() => selectBranch(b)}><i className="fas fa-sitemap me-1"></i>Bins</button>
                                            <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => openEditBranch(b)}><i className="fas fa-pen"></i></button>
                                            <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => deleteBranch(b)}><i className="fas fa-trash"></i></button>
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
                                                {BIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
                            <div className="alert alert-info mb-0">No storage locations in this branch yet.</div>
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
        </div>
    );
}
