import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { StockBatchesEndpoints, StockItemsEndpoints } from "@rutba/api-provider/endpoints";

const STATUS = ["Active", "Expired", "Quarantined", "Depleted", "Recalled"];
const STATUS_BADGE = { Active: "bg-success", Expired: "bg-danger", Quarantined: "bg-warning text-dark", Depleted: "bg-secondary", Recalled: "bg-dark" };

const EMPTY = { batch_code: "", manufacture_date: "", expiry_date: "", status: "Active" };

export default function BatchesPage() {
    const { jwt } = useAuth();

    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ ...EMPTY });
    const [units, setUnits] = useState([]); // scanned units define the product + get attached
    const [barcode, setBarcode] = useState("");
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);

    const notify = (text, variant = "success") => setMsg({ text, variant });

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await StockBatchesEndpoints.list(1, 200, { sort: ["expiry_date:asc"] });
            setBatches(res?.data || []);
        } catch (e) { console.error(e); notify("Failed to load batches.", "danger"); }
        finally { setLoading(false); }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const change = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    const openCreate = () => { setForm({ ...EMPTY }); setUnits([]); setBarcode(""); setShowForm(true); };

    const addUnit = async () => {
        const code = barcode.trim();
        if (!code) return;
        if (units.some((u) => u.barcode === code)) { setBarcode(""); return; }
        setAdding(true);
        try {
            const res = await StockItemsEndpoints.listByBarcode(code);
            const item = (res?.data || [])[0];
            if (!item) { notify(`No stock item with barcode ${code}`, "warning"); return; }
            const pDoc = item.product?.documentId;
            if (!pDoc) { notify("That unit has no product.", "warning"); return; }
            if (units.length > 0 && units[0].product_doc_id !== pDoc) {
                notify("All units in a batch must be the same product.", "warning"); return;
            }
            setUnits((prev) => [...prev, { documentId: item.documentId, barcode: item.barcode || code, product_doc_id: pDoc, product_name: item.product?.name || "(unnamed)" }]);
            setBarcode("");
        } catch (e) { console.error(e); notify("Failed to resolve barcode.", "danger"); }
        finally { setAdding(false); }
    };
    const removeUnit = (documentId) => setUnits((prev) => prev.filter((u) => u.documentId !== documentId));

    const submit = async (e) => {
        e.preventDefault();
        if (units.length === 0) { notify("Scan at least one unit — it sets the batch's product.", "warning"); return; }
        if (!form.expiry_date) { notify("Set an expiry date.", "warning"); return; }
        setSaving(true);
        try {
            const productDoc = units[0].product_doc_id;
            const data = {
                batch_code: form.batch_code || null,
                product: productDoc,
                manufacture_date: form.manufacture_date || null,
                expiry_date: form.expiry_date,
                status: form.status,
                quantity_received: units.length,
                quantity_remaining: units.length,
            };
            const created = await StockBatchesEndpoints.create({ data });
            const batchDoc = created?.data?.documentId;
            // Attach the scanned units: set batch + denormalise expiry onto each unit.
            let attached = 0;
            for (const u of units) {
                try {
                    await StockItemsEndpoints.update(u.documentId, { data: { batch: batchDoc, expiry_date: form.expiry_date } });
                    attached += 1;
                } catch (err) { console.error("attach unit", err); }
            }
            notify(`Batch created and ${attached}/${units.length} unit(s) tagged with the expiry.`);
            setShowForm(false);
            await load();
        } catch (err) {
            console.error("create batch", err);
            notify(err?.response?.data?.error?.message || "Failed to create batch.", "danger");
        } finally { setSaving(false); }
    };

    const del = async (b) => {
        if (!window.confirm(`Delete batch ${b.batch_code || b.documentId}? (Units keep their expiry_date.)`)) return;
        try { await StockBatchesEndpoints.del(b.documentId); notify("Batch deleted."); await load(); }
        catch (err) { console.error(err); notify(err?.response?.data?.error?.message || "Failed to delete.", "danger"); }
    };

    const daysLeft = (d) => {
        if (!d) return null;
        return Math.round((new Date(d).getTime() - Date.now()) / 86400000);
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-boxes-packing me-2 text-info"></i>Batches / Lots</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreate}><i className="fas fa-plus me-1"></i>New Batch</button>
                </div>
                <p className="text-muted small mb-3">
                    Group units under a batch/lot with an expiry date. Scan the units to include — the batch takes
                    their product and stamps its expiry onto each unit (used by the Expiry sweep + FEFO).
                </p>

                {msg && (
                    <div className={`alert alert-${msg.variant} alert-dismissible py-2`}>
                        {msg.text}<button type="button" className="btn-close" onClick={() => setMsg(null)}></button>
                    </div>
                )}

                {showForm && (
                    <div className="card mb-4"><div className="card-body">
                        <h5>New Batch</h5>
                        <form onSubmit={submit}>
                            <div className="row g-3">
                                <div className="col-md-3">
                                    <label className="form-label">Batch code <span className="text-muted small">(optional)</span></label>
                                    <input className="form-control" name="batch_code" value={form.batch_code} onChange={change} placeholder="auto if blank" />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Manufacture date</label>
                                    <input type="date" className="form-control" name="manufacture_date" value={form.manufacture_date} onChange={change} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Expiry date</label>
                                    <input type="date" className="form-control" name="expiry_date" value={form.expiry_date} onChange={change} required />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Status</label>
                                    <select className="form-select" name="status" value={form.status} onChange={change}>
                                        {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="col-12">
                                    <label className="form-label">Units in this batch (scan barcodes){units[0] ? <span className="text-muted small ms-2">product: {units[0].product_name}</span> : null}</label>
                                    <div className="input-group" style={{ maxWidth: 420 }}>
                                        <input className="form-control" value={barcode} onChange={(e) => setBarcode(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUnit(); } }} placeholder="scan a stock-item barcode" />
                                        <button className="btn btn-outline-secondary" type="button" onClick={addUnit} disabled={adding}>
                                            {adding ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-plus me-1"></i>Add</>}
                                        </button>
                                    </div>
                                    {units.length > 0 && (
                                        <div className="mt-2 d-flex flex-wrap gap-2">
                                            {units.map((u) => (
                                                <span key={u.documentId} className="badge bg-light text-dark border">
                                                    <code>{u.barcode}</code>
                                                    <button type="button" className="btn-close btn-close-sm ms-2" style={{ fontSize: ".6rem" }} onClick={() => removeUnit(u.documentId)}></button>
                                                </span>
                                            ))}
                                            <span className="text-muted small align-self-center">{units.length} unit(s)</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 d-flex gap-2">
                                <button className="btn btn-success btn-sm" type="submit" disabled={saving}>{saving ? "Saving..." : "Create Batch"}</button>
                                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowForm(false)}>Cancel</button>
                            </div>
                        </form>
                    </div></div>
                )}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : batches.length === 0 ? (
                    <div className="alert alert-info">No batches yet. Create one to track expiry on a set of units.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead><tr><th>Batch</th><th>Product</th><th>Expiry</th><th className="text-end">Days left</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {batches.map((b) => {
                                    const dl = daysLeft(b.expiry_date);
                                    return (
                                        <tr key={b.documentId}>
                                            <td><code>{b.batch_code || "—"}</code></td>
                                            <td>{b.product?.name || "—"}</td>
                                            <td>{b.expiry_date || "—"}</td>
                                            <td className="text-end">{dl == null ? "—" : <span className={dl < 0 ? "text-danger fw-semibold" : dl <= 30 ? "text-warning fw-semibold" : ""}>{dl}</span>}</td>
                                            <td><span className={`badge ${STATUS_BADGE[b.status] || "bg-secondary"}`}>{b.status}</span></td>
                                            <td><button className="btn btn-sm btn-outline-danger" onClick={() => del(b)}><i className="fas fa-trash"></i></button></td>
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
