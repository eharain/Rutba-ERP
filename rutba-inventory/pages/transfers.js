import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { StockTransfersEndpoints, BranchesEndpoints, StorageLocationsEndpoints, StockItemsEndpoints } from "@rutba/api-provider/endpoints";

const STATUS_BADGE = {
    Draft: "bg-secondary",
    InTransit: "bg-warning text-dark",
    PartiallyReceived: "bg-info text-dark",
    Received: "bg-success",
    Cancelled: "bg-light text-muted border",
};

function unitCount(t) {
    const si = t.stock_items;
    if (!si) return 0;
    if (Array.isArray(si)) return si.length;
    if (typeof si.count === "number") return si.count;
    return 0;
}

const EMPTY_FORM = { fromWh: "", toWh: "", toLoc: "", notes: "" };

export default function TransfersPage() {
    const { jwt } = useAuth();

    const [transfers, setTransfers] = useState([]);
    const [meta, setMeta] = useState(null);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);
    const [busy, setBusy] = useState(null);
    const [page, setPage] = useState(1);

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [toLocations, setToLocations] = useState([]);
    const [units, setUnits] = useState([]); // [{ documentId, barcode, product, status }]
    const [barcode, setBarcode] = useState("");
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);

    const notify = (text, variant = "success") => setMsg({ text, variant });

    const loadBranches = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await BranchesEndpoints.list({ pageSize: 200, sort: ["name:asc"] });
            setBranches(res?.data || []);
        } catch (e) { console.error("branches", e); }
    }, [jwt]);

    const loadTransfers = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await StockTransfersEndpoints.list(page, 50, { sort: ["createdAt:desc"] });
            setTransfers(res?.data || []);
            setMeta(res?.meta?.pagination || null);
        } catch (e) {
            console.error("transfers", e);
            notify("Failed to load transfers.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, page]);

    useEffect(() => { loadBranches(); }, [loadBranches]);
    useEffect(() => { loadTransfers(); }, [loadTransfers]);

    // Load destination bins whenever the to-branch changes.
    useEffect(() => {
        let alive = true;
        (async () => {
            if (!form.toWh) { setToLocations([]); return; }
            try {
                const res = await StorageLocationsEndpoints.list(1, 1000, { branchDocId: form.toWh, sort: ["code:asc"] });
                if (alive) setToLocations(res?.data || []);
            } catch (e) { console.error("to-locations", e); }
        })();
        return () => { alive = false; };
    }, [form.toWh]);

    const changeForm = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value, ...(e.target.name === "toWh" ? { toLoc: "" } : {}) }));

    const openCreate = () => { setForm({ ...EMPTY_FORM }); setUnits([]); setBarcode(""); setShowForm(true); };

    const addUnit = async () => {
        const code = barcode.trim();
        if (!code) return;
        if (units.some((u) => u.barcode === code)) { notify(`Already added: ${code}`, "warning"); setBarcode(""); return; }
        setAdding(true);
        try {
            const res = await StockItemsEndpoints.listByBarcode(code);
            const item = (res?.data || [])[0];
            if (!item) { notify(`No stock item with barcode ${code}`, "warning"); return; }
            setUnits((prev) => [...prev, {
                documentId: item.documentId,
                barcode: item.barcode || code,
                product: item.product?.name || item.name || "(unnamed)",
                status: item.status,
            }]);
            setBarcode("");
        } catch (e) {
            console.error("resolve barcode", e);
            notify("Failed to resolve barcode.", "danger");
        } finally {
            setAdding(false);
        }
    };

    const removeUnit = (documentId) => setUnits((prev) => prev.filter((u) => u.documentId !== documentId));

    const submitCreate = async (e) => {
        e.preventDefault();
        if (!form.fromWh || !form.toWh) { notify("Pick both source and destination branches.", "warning"); return; }
        if (form.fromWh === form.toWh) { notify("Source and destination must differ.", "warning"); return; }
        if (units.length === 0) { notify("Add at least one unit (scan a barcode).", "warning"); return; }
        setSaving(true);
        try {
            const data = {
                from_branch: form.fromWh,
                to_branch: form.toWh,
                to_location: form.toLoc || null,
                notes: form.notes || null,
                status: "Draft",
                stock_items: units.map((u) => u.documentId),
            };
            await StockTransfersEndpoints.create({ data });
            notify("Transfer created (Draft). Dispatch it when the units leave.");
            setShowForm(false);
            await loadTransfers();
        } catch (err) {
            console.error("create transfer", err);
            notify(err?.response?.data?.error?.message || "Failed to create transfer.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const doAction = async (t, action, confirmText) => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(`${t.documentId}:${action}`);
        try {
            const res = await StockTransfersEndpoints[action](t.documentId);
            notify(`${t.transfer_number}: ${action} ok${res?.status ? ` → ${res.status}` : ""}.`);
            await loadTransfers();
        } catch (err) {
            console.error(`${action} transfer`, err);
            notify(err?.response?.data?.error?.message || `Failed to ${action}.`, "danger");
        } finally {
            setBusy(null);
        }
    };

    const delTransfer = async (t) => {
        if (!window.confirm(`Delete transfer ${t.transfer_number}? (Only Draft transfers should be deleted.)`)) return;
        setBusy(`${t.documentId}:del`);
        try {
            await StockTransfersEndpoints.del(t.documentId);
            notify("Transfer deleted.");
            await loadTransfers();
        } catch (err) {
            console.error("delete transfer", err);
            notify(err?.response?.data?.error?.message || "Failed to delete.", "danger");
        } finally {
            setBusy(null);
        }
    };

    const whName = (w) => w?.name || "—";

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-right-left me-2 text-success"></i>Stock Transfers</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreate}><i className="fas fa-plus me-1"></i>New Transfer</button>
                </div>

                {msg && (
                    <div className={`alert alert-${msg.variant} alert-dismissible py-2`}>
                        {msg.text}
                        <button type="button" className="btn-close" onClick={() => setMsg(null)}></button>
                    </div>
                )}

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-body">
                            <h5>New Transfer</h5>
                            <form onSubmit={submitCreate}>
                                <div className="row g-3">
                                    <div className="col-md-3">
                                        <label className="form-label">From branch</label>
                                        <select className="form-select" name="fromWh" value={form.fromWh} onChange={changeForm} required>
                                            <option value="">— select —</option>
                                            {branches.map((w) => <option key={w.documentId} value={w.documentId}>{w.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">To branch</label>
                                        <select className="form-select" name="toWh" value={form.toWh} onChange={changeForm} required>
                                            <option value="">— select —</option>
                                            {branches.map((w) => <option key={w.documentId} value={w.documentId}>{w.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">To bin <span className="text-muted small">(optional)</span></label>
                                        <select className="form-select" name="toLoc" value={form.toLoc} onChange={changeForm} disabled={!form.toWh}>
                                            <option value="">— receiving default —</option>
                                            {toLocations.map((l) => <option key={l.documentId} value={l.documentId}>{l.code || l.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Notes</label>
                                        <input className="form-control" name="notes" value={form.notes} onChange={changeForm} />
                                    </div>

                                    <div className="col-12">
                                        <label className="form-label">Add units by barcode</label>
                                        <div className="input-group" style={{ maxWidth: 420 }}>
                                            <input className="form-control" value={barcode} onChange={(e) => setBarcode(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUnit(); } }}
                                                placeholder="scan or type a stock-item barcode" />
                                            <button className="btn btn-outline-secondary" type="button" onClick={addUnit} disabled={adding}>
                                                {adding ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-plus me-1"></i>Add</>}
                                            </button>
                                        </div>
                                        {units.length > 0 && (
                                            <div className="table-responsive mt-2">
                                                <table className="table table-sm align-middle mb-0" style={{ maxWidth: 700 }}>
                                                    <thead><tr><th>Barcode</th><th>Product</th><th>Status</th><th></th></tr></thead>
                                                    <tbody>
                                                        {units.map((u) => (
                                                            <tr key={u.documentId}>
                                                                <td><code>{u.barcode}</code></td>
                                                                <td>{u.product}</td>
                                                                <td>{u.status === "InStock" ? <span className="badge bg-success">InStock</span> : <span className="badge bg-warning text-dark">{u.status}</span>}</td>
                                                                <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeUnit(u.documentId)}><i className="fas fa-times"></i></button></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <div className="small text-muted mt-1">{units.length} unit(s). Only <strong>InStock</strong> units are moved on dispatch.</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-3 d-flex gap-2">
                                    <button className="btn btn-success btn-sm" type="submit" disabled={saving}>{saving ? "Saving..." : "Create Draft"}</button>
                                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowForm(false)}>Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : transfers.length === 0 ? (
                    <div className="alert alert-info">No transfers yet. Click "New Transfer" to move stock between branches.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead>
                                <tr><th>Number</th><th>From</th><th>To</th><th className="text-center">Units</th><th>Status</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {transfers.map((t) => {
                                    const b = `${t.documentId}`;
                                    return (
                                        <tr key={t.documentId}>
                                            <td><code>{t.transfer_number}</code></td>
                                            <td>{whName(t.from_branch)}</td>
                                            <td>{whName(t.to_branch)}{t.to_location ? <span className="text-muted small ms-1">/ {t.to_location.code || ""}</span> : null}</td>
                                            <td className="text-center">{unitCount(t)}</td>
                                            <td><span className={`badge ${STATUS_BADGE[t.status] || "bg-secondary"}`}>{t.status}</span></td>
                                            <td>
                                                <div className="d-flex gap-1 flex-wrap">
                                                    {t.status === "Draft" && (
                                                        <button className="btn btn-sm btn-outline-warning" disabled={busy === `${b}:dispatch`} onClick={() => doAction(t, "dispatch", "Dispatch this transfer? Units go in-transit and leave the source on-hand.")}>
                                                            {busy === `${b}:dispatch` ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-truck me-1"></i>Dispatch</>}
                                                        </button>
                                                    )}
                                                    {(t.status === "InTransit" || t.status === "PartiallyReceived") && (
                                                        <button className="btn btn-sm btn-outline-success" disabled={busy === `${b}:receive`} onClick={() => doAction(t, "receive", "Receive this transfer? Units land InStock at the destination.")}>
                                                            {busy === `${b}:receive` ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-box-open me-1"></i>Receive</>}
                                                        </button>
                                                    )}
                                                    {(t.status === "Draft" || t.status === "InTransit") && (
                                                        <button className="btn btn-sm btn-outline-secondary" disabled={busy === `${b}:cancel`} onClick={() => doAction(t, "cancel", "Cancel this transfer? In-transit units revert to InStock at the source.")}>
                                                            <i className="fas fa-ban"></i>
                                                        </button>
                                                    )}
                                                    {t.status === "Draft" && (
                                                        <button className="btn btn-sm btn-outline-danger" disabled={busy === `${b}:del`} onClick={() => delTransfer(t)}><i className="fas fa-trash"></i></button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {meta && meta.pageCount > 1 && (
                    <div className="d-flex justify-content-between align-items-center">
                        <span className="text-muted small">Page {meta.page} of {meta.pageCount} · {meta.total} total</span>
                        <div className="btn-group btn-group-sm">
                            <button className="btn btn-outline-secondary" disabled={loading || meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                            <button className="btn btn-outline-secondary" disabled={loading || meta.page >= meta.pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
