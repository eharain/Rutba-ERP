import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { StockCountsEndpoints, BranchesEndpoints, StockItemsEndpoints, StockLevelsEndpoints } from "@rutba/api-provider/endpoints";

const STATUS_BADGE = { Draft: "bg-secondary", Posted: "bg-success", Cancelled: "bg-light text-muted border" };

export default function CountsPage() {
    const { jwt } = useAuth();

    const [counts, setCounts] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);
    const [busy, setBusy] = useState(null);

    const [showForm, setShowForm] = useState(false);
    const [branch, setBranch] = useState("");
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState([]);
    const [barcode, setBarcode] = useState("");
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);

    const notify = (text, variant = "success") => setMsg({ text, variant });

    const loadBranches = useCallback(async () => {
        if (!jwt) return;
        try { const res = await BranchesEndpoints.list({ pageSize: 200, sort: ["name:asc"] }); setBranches(res?.data || []); }
        catch (e) { console.error(e); }
    }, [jwt]);

    const loadCounts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try { const res = await StockCountsEndpoints.list(1, 50, { sort: ["createdAt:desc"] }); setCounts(res?.data || []); }
        catch (e) { console.error(e); notify("Failed to load counts.", "danger"); }
        finally { setLoading(false); }
    }, [jwt]);

    useEffect(() => { loadBranches(); }, [loadBranches]);
    useEffect(() => { loadCounts(); }, [loadCounts]);

    const openCreate = () => { setBranch(""); setNotes(""); setLines([]); setBarcode(""); setShowForm(true); };

    const addLine = async () => {
        const code = barcode.trim();
        if (!code) return;
        if (!branch) { notify("Pick a branch first.", "warning"); return; }
        setAdding(true);
        try {
            const res = await StockItemsEndpoints.listByBarcode(code);
            const item = (res?.data || [])[0];
            if (!item) { notify(`No stock item with barcode ${code}`, "warning"); return; }
            const pDoc = item.product?.documentId;
            if (!pDoc) { notify("That unit has no product — can't count it.", "warning"); return; }
            if (lines.some((l) => l.product_doc_id === pDoc)) { notify("Product already on the count.", "warning"); setBarcode(""); return; }
            // System qty = on-hand of this product at the branch (from the stock-level cache).
            let system = 0;
            try {
                const lv = await StockLevelsEndpoints.list(1, 5, { productDocId: pDoc, branchDocId: branch });
                system = (lv?.data || []).reduce((s, r) => s + (Number(r.quantity_on_hand) || 0), 0);
            } catch (e) { console.error("system qty", e); }
            setLines((prev) => [...prev, {
                product_doc_id: pDoc,
                product_name: item.product?.name || item.name || "(unnamed)",
                sku: item.product?.sku || item.sku || "",
                system_qty: system,
                counted_qty: system, // default to system; the counter corrects it
            }]);
            setBarcode("");
        } catch (e) {
            console.error("add line", e);
            notify("Failed to resolve barcode.", "danger");
        } finally { setAdding(false); }
    };

    const setCounted = (idx, val) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, counted_qty: val } : l));
    const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));

    const submitCreate = async (e) => {
        e.preventDefault();
        if (!branch) { notify("Pick a branch.", "warning"); return; }
        if (lines.length === 0) { notify("Add at least one product to count.", "warning"); return; }
        setSaving(true);
        try {
            const data = {
                branch,
                notes: notes || null,
                status: "Draft",
                lines: lines.map((l) => ({
                    product_doc_id: l.product_doc_id, product_name: l.product_name, sku: l.sku,
                    system_qty: Number(l.system_qty) || 0, counted_qty: Number(l.counted_qty) || 0,
                })),
            };
            await StockCountsEndpoints.create({ data });
            notify("Count created (Draft). Post it to book any shortages.");
            setShowForm(false);
            await loadCounts();
        } catch (err) {
            console.error("create count", err);
            notify(err?.response?.data?.error?.message || "Failed to create count.", "danger");
        } finally { setSaving(false); }
    };

    const doAction = async (c, action, confirmText) => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(`${c.documentId}:${action}`);
        try {
            const res = await StockCountsEndpoints[action](c.documentId);
            let extra = "";
            if (action === "post") extra = ` — ${res?.shortageUnits || 0} short, ${res?.overageUnits || 0} over`;
            notify(`${c.count_number}: ${action} ok${extra}.`);
            await loadCounts();
        } catch (err) {
            console.error(`${action} count`, err);
            notify(err?.response?.data?.error?.message || `Failed to ${action}.`, "danger");
        } finally { setBusy(null); }
    };

    const delCount = async (c) => {
        if (!window.confirm(`Delete count ${c.count_number}?`)) return;
        setBusy(`${c.documentId}:del`);
        try { await StockCountsEndpoints.del(c.documentId); notify("Count deleted."); await loadCounts(); }
        catch (err) { console.error(err); notify(err?.response?.data?.error?.message || "Failed to delete.", "danger"); }
        finally { setBusy(null); }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-clipboard-check me-2 text-secondary"></i>Cycle Counts</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreate}><i className="fas fa-plus me-1"></i>New Count</button>
                </div>
                <p className="text-muted small mb-3">
                    Physical stock-take of a branch. Add each product (scan a unit), enter what you physically
                    counted, then Post — shortages book the missing units as <code>Lost</code>. Overages are reported.
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
                            <h5>New Count</h5>
                            <form onSubmit={submitCreate}>
                                <div className="row g-3">
                                    <div className="col-md-4">
                                        <label className="form-label">Branch</label>
                                        <select className="form-select" value={branch} onChange={(e) => { setBranch(e.target.value); setLines([]); }} required>
                                            <option value="">— select —</option>
                                            {branches.map((w) => <option key={w.documentId} value={w.documentId}>{w.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-8">
                                        <label className="form-label">Notes</label>
                                        <input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} />
                                    </div>

                                    <div className="col-12">
                                        <label className="form-label">Add products by scanning a unit</label>
                                        <div className="input-group" style={{ maxWidth: 420 }}>
                                            <input className="form-control" value={barcode} onChange={(e) => setBarcode(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine(); } }}
                                                placeholder="scan/type a stock-item barcode" disabled={!branch} />
                                            <button className="btn btn-outline-secondary" type="button" onClick={addLine} disabled={adding || !branch}>
                                                {adding ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-plus me-1"></i>Add</>}
                                            </button>
                                        </div>
                                        {lines.length > 0 && (
                                            <div className="table-responsive mt-2">
                                                <table className="table table-sm align-middle mb-0">
                                                    <thead><tr><th>Product</th><th>SKU</th><th className="text-end">System</th><th style={{ width: 130 }} className="text-end">Counted</th><th></th></tr></thead>
                                                    <tbody>
                                                        {lines.map((l, i) => {
                                                            const v = (Number(l.counted_qty) || 0) - (Number(l.system_qty) || 0);
                                                            return (
                                                                <tr key={l.product_doc_id}>
                                                                    <td>{l.product_name}</td>
                                                                    <td><code>{l.sku || "—"}</code></td>
                                                                    <td className="text-end">{l.system_qty}</td>
                                                                    <td className="text-end">
                                                                        <input type="number" className={`form-control form-control-sm text-end ${v < 0 ? "border-danger" : v > 0 ? "border-warning" : ""}`}
                                                                            value={l.counted_qty} onChange={(e) => setCounted(i, e.target.value)} style={{ width: 110, display: "inline-block" }} />
                                                                    </td>
                                                                    <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeLine(i)}><i className="fas fa-times"></i></button></td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
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
                ) : counts.length === 0 ? (
                    <div className="alert alert-info">No counts yet. Click "New Count" to start a stock-take.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead><tr><th>Number</th><th>Branch</th><th>Status</th><th>Posted</th><th>Actions</th></tr></thead>
                            <tbody>
                                {counts.map((c) => {
                                    const b = `${c.documentId}`;
                                    return (
                                        <tr key={c.documentId}>
                                            <td><code>{c.count_number}</code></td>
                                            <td>{c.branch?.name || "—"}</td>
                                            <td><span className={`badge ${STATUS_BADGE[c.status] || "bg-secondary"}`}>{c.status}</span></td>
                                            <td className="small text-muted">{c.posted_at ? new Date(c.posted_at).toLocaleString() : "—"}</td>
                                            <td>
                                                <div className="d-flex gap-1 flex-wrap">
                                                    {c.status === "Draft" && (
                                                        <button className="btn btn-sm btn-outline-success" disabled={busy === `${b}:post`} onClick={() => doAction(c, "post", "Post this count? Shortages will mark the missing units as Lost.")}>
                                                            {busy === `${b}:post` ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-check me-1"></i>Post</>}
                                                        </button>
                                                    )}
                                                    {c.status === "Draft" && (
                                                        <button className="btn btn-sm btn-outline-secondary" disabled={busy === `${b}:cancel`} onClick={() => doAction(c, "cancel")}><i className="fas fa-ban me-1"></i>Cancel</button>
                                                    )}
                                                    {c.status === "Draft" && (
                                                        <button className="btn btn-sm btn-outline-danger" disabled={busy === `${b}:del`} onClick={() => delCount(c)}><i className="fas fa-trash"></i></button>
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
            </Layout>
        </ProtectedRoute>
    );
}
