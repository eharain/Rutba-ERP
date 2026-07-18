import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { StockAdjustmentsEndpoints, BranchesEndpoints, StockItemsEndpoints } from "@rutba/api-provider/endpoints";

const TYPES = [
    { value: "WriteOff", label: "Write-off", to: "Reduced" },
    { value: "Damage", label: "Damage", to: "Damaged" },
    { value: "Lost", label: "Lost", to: "Lost" },
    { value: "Expired", label: "Expired", to: "Expired" },
];
const STATUS_BADGE = { Draft: "bg-secondary", Posted: "bg-danger", Cancelled: "bg-light text-muted border" };

function unitCount(a) {
    const si = a.stock_items;
    if (!si) return 0;
    if (Array.isArray(si)) return si.length;
    if (typeof si.count === "number") return si.count;
    return 0;
}

const EMPTY_FORM = { type: "WriteOff", branch: "", reason: "", notes: "" };

export default function AdjustmentsPage() {
    const { jwt } = useAuth();

    const [adjustments, setAdjustments] = useState([]);
    const [meta, setMeta] = useState(null);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);
    const [busy, setBusy] = useState(null);
    const [page, setPage] = useState(1);

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [units, setUnits] = useState([]);
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

    const loadAdjustments = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await StockAdjustmentsEndpoints.list(page, 50, { sort: ["createdAt:desc"] });
            setAdjustments(res?.data || []);
            setMeta(res?.meta?.pagination || null);
        } catch (e) {
            console.error("adjustments", e);
            notify("Failed to load adjustments.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, page]);

    useEffect(() => { loadBranches(); }, [loadBranches]);
    useEffect(() => { loadAdjustments(); }, [loadAdjustments]);

    const changeForm = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
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
                cost_price: item.cost_price,
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
        if (units.length === 0) { notify("Add at least one unit (scan a barcode).", "warning"); return; }
        setSaving(true);
        try {
            const data = {
                type: form.type,
                branch: form.branch || null,
                reason: form.reason || null,
                notes: form.notes || null,
                status: "Draft",
                stock_items: units.map((u) => u.documentId),
            };
            await StockAdjustmentsEndpoints.create({ data });
            notify("Adjustment created (Draft). Post it to apply the write-off.");
            setShowForm(false);
            await loadAdjustments();
        } catch (err) {
            console.error("create adjustment", err);
            notify(err?.response?.data?.error?.message || "Failed to create adjustment.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const doAction = async (a, action, confirmText) => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(`${a.documentId}:${action}`);
        try {
            const res = await StockAdjustmentsEndpoints[action](a.documentId);
            let extra = "";
            if (action === "post") extra = res?.gl?.posted ? " (GL posted)" : " (GL skipped — COA not configured)";
            notify(`${a.adjustment_number}: ${action} ok${extra}.`);
            await loadAdjustments();
        } catch (err) {
            console.error(`${action} adjustment`, err);
            notify(err?.response?.data?.error?.message || `Failed to ${action}.`, "danger");
        } finally {
            setBusy(null);
        }
    };

    const delAdjustment = async (a) => {
        if (!window.confirm(`Delete adjustment ${a.adjustment_number}?`)) return;
        setBusy(`${a.documentId}:del`);
        try {
            await StockAdjustmentsEndpoints.del(a.documentId);
            notify("Adjustment deleted.");
            await loadAdjustments();
        } catch (err) {
            console.error("delete adjustment", err);
            notify(err?.response?.data?.error?.message || "Failed to delete.", "danger");
        } finally {
            setBusy(null);
        }
    };

    const currentType = TYPES.find((t) => t.value === form.type);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-sliders me-2 text-warning"></i>Stock Adjustments</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreate}><i className="fas fa-plus me-1"></i>New Adjustment</button>
                </div>

                <p className="text-muted small mb-3">
                    Write-off, damage, loss or expiry of specific units. Posting moves each unit out of on-hand
                    and best-effort posts Dr Shrinkage / Cr Inventory (skipped if the chart-of-accounts mappings aren&apos;t set).
                </p>

                {msg && (
                    <div className={`alert alert-${msg.variant} alert-dismissible py-2`}>
                        {msg.text}
                        <button type="button" className="btn-close" onClick={() => setMsg(null)}></button>
                    </div>
                )}

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-body">
                            <h5>New Adjustment</h5>
                            <form onSubmit={submitCreate}>
                                <div className="row g-3">
                                    <div className="col-md-3">
                                        <label className="form-label">Type</label>
                                        <select className="form-select" name="type" value={form.type} onChange={changeForm}>
                                            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                        {currentType && <div className="form-text">Units → <code>{currentType.to}</code></div>}
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Branch <span className="text-muted small">(optional)</span></label>
                                        <select className="form-select" name="branch" value={form.branch} onChange={changeForm}>
                                            <option value="">— none —</option>
                                            {branches.map((w) => <option key={w.documentId} value={w.documentId}>{w.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Reason</label>
                                        <input className="form-control" name="reason" value={form.reason} onChange={changeForm} placeholder="e.g. breakage" />
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
                                                    <thead><tr><th>Barcode</th><th>Product</th><th>Status</th><th className="text-end">Cost</th><th></th></tr></thead>
                                                    <tbody>
                                                        {units.map((u) => (
                                                            <tr key={u.documentId}>
                                                                <td><code>{u.barcode}</code></td>
                                                                <td>{u.product}</td>
                                                                <td>{u.status === "InStock" ? <span className="badge bg-success">InStock</span> : <span className="badge bg-warning text-dark">{u.status}</span>}</td>
                                                                <td className="text-end">{u.cost_price ?? "—"}</td>
                                                                <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeUnit(u.documentId)}><i className="fas fa-times"></i></button></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <div className="small text-muted mt-1">{units.length} unit(s). Only <strong>InStock</strong> units are affected on post.</div>
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
                ) : adjustments.length === 0 ? (
                    <div className="alert alert-info">No adjustments yet. Click "New Adjustment" to write off, damage or expire units.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead>
                                <tr><th>Number</th><th>Type</th><th>Branch</th><th className="text-center">Units</th><th className="text-end">Cost</th><th>Status</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {adjustments.map((a) => {
                                    const b = `${a.documentId}`;
                                    return (
                                        <tr key={a.documentId}>
                                            <td><code>{a.adjustment_number}</code></td>
                                            <td>{TYPES.find((t) => t.value === a.type)?.label || a.type}</td>
                                            <td>{a.branch?.name || "—"}</td>
                                            <td className="text-center">{unitCount(a)}</td>
                                            <td className="text-end">{a.total_cost != null ? a.total_cost : "—"}{a.gl_posted ? <i className="fas fa-book ms-1 text-success" title="GL posted"></i> : null}</td>
                                            <td><span className={`badge ${STATUS_BADGE[a.status] || "bg-secondary"}`}>{a.status}</span></td>
                                            <td>
                                                <div className="d-flex gap-1 flex-wrap">
                                                    {a.status === "Draft" && (
                                                        <button className="btn btn-sm btn-outline-danger" disabled={busy === `${b}:post`} onClick={() => doAction(a, "post", "Post this adjustment? The units leave on-hand and (if configured) a GL write-off is booked.")}>
                                                            {busy === `${b}:post` ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-check me-1"></i>Post</>}
                                                        </button>
                                                    )}
                                                    {(a.status === "Draft" || a.status === "Posted") && (
                                                        <button className="btn btn-sm btn-outline-secondary" disabled={busy === `${b}:cancel`} onClick={() => doAction(a, "cancel", a.status === "Posted" ? "Cancel this posted adjustment? Units revert to InStock and the GL is reversed." : "Cancel this draft?")}>
                                                            <i className="fas fa-ban me-1"></i>Cancel
                                                        </button>
                                                    )}
                                                    {a.status === "Draft" && (
                                                        <button className="btn btn-sm btn-outline-danger" disabled={busy === `${b}:del`} onClick={() => delAdjustment(a)}><i className="fas fa-trash"></i></button>
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
