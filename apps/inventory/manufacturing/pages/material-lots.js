import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import ProductSelect from "../components/ProductSelect";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MfgMaterialLotsEndpoints } from "@rutba/api-provider/endpoints";

function lotStatusColor(status) {
    switch (status) {
        case "Available": return "success";
        case "PartiallyConsumed": return "info";
        case "Consumed": return "secondary";
        case "Reserved": return "warning";
        default: return "light";
    }
}

const UOMS = ["piece", "meter", "yard", "kg", "gram", "dozen", "set", "cone", "roll", "box"];

const EMPTY_FORM = {
    lot_code: "",
    name: "",
    product: "",
    uom: "meter",
    quantity_received: "",
    unit_cost: "",
    dye_lot: "",
    color: "",
};

export default function MaterialLots() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const [recomputing, setRecomputing] = useState(false);
    // { documentId, originalQty } while editing an existing lot
    const [editing, setEditing] = useState(null);

    async function reload() {
        setLoading(true);
        try {
            const res = await MfgMaterialLotsEndpoints.list(1, 100, { sort: ["createdAt:desc"] });
            setRows(res.data || []);
            setError("");
        } catch (err) {
            console.error("Failed to load material lots", err);
            setError("Failed to load material lots.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!jwt) return;
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt]);

    function setField(key, value) {
        setForm((f) => ({ ...f, [key]: value }));
    }

    function startEdit(lot) {
        setEditing({ documentId: lot.documentId, originalQty: Number(lot.quantity_received) || 0 });
        setForm({
            lot_code: lot.lot_code || "",
            name: lot.name || "",
            product: lot.product?.documentId || "",
            uom: lot.uom || "meter",
            quantity_received: lot.quantity_received != null ? String(lot.quantity_received) : "",
            unit_cost: lot.unit_cost != null ? String(lot.unit_cost) : "",
            dye_lot: lot.dye_lot || "",
            color: lot.color || "",
        });
        setFormError("");
        setShowForm(true);
    }

    function closeForm() {
        setShowForm(false);
        setEditing(null);
        setForm(EMPTY_FORM);
        setFormError("");
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setFormError("");
        if (form.quantity_received === "" || Number(form.quantity_received) <= 0) {
            setFormError("Quantity received is required and must be greater than 0.");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                lot_code: form.lot_code || undefined,
                name: form.name || undefined,
                uom: form.uom,
                quantity_received: Number(form.quantity_received),
                dye_lot: form.dye_lot || undefined,
                color: form.color || undefined,
            };
            if (form.product) payload.product = form.product;
            if (form.unit_cost !== "") payload.unit_cost = Number(form.unit_cost);

            if (editing) {
                await MfgMaterialLotsEndpoints.update(editing.documentId, payload);
                // received qty drives the remaining balance — re-derive it from the issue ledger
                if (Number(form.quantity_received) !== editing.originalQty) {
                    try { await MfgMaterialLotsEndpoints.recomputeLots(); }
                    catch (err) { console.error("Recompute after edit failed", err); }
                }
            } else {
                await MfgMaterialLotsEndpoints.create(payload);
            }
            closeForm();
            await reload();
        } catch (err) {
            console.error("Failed to save material lot", err);
            setFormError(editing ? "Failed to update lot." : "Failed to receive material.");
        } finally {
            setSaving(false);
        }
    }

    async function handleRecompute() {
        setRecomputing(true);
        try {
            const res = await MfgMaterialLotsEndpoints.recomputeLots();
            const summary = res?.data ?? res;
            const msg = typeof summary === "object" ? JSON.stringify(summary) : String(summary);
            alert(`Recompute complete: ${msg}`);
            await reload();
        } catch (err) {
            console.error("Recompute failed", err);
            alert("Recompute failed.");
        } finally {
            setRecomputing(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Material Lots</h2>
                    <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-outline-secondary" disabled={recomputing} onClick={handleRecompute}>
                            {recomputing ? "Recomputing..." : "Recompute balances"}
                        </button>
                        <button
                            className="btn btn-sm btn-primary"
                            onClick={() => { showForm ? closeForm() : setShowForm(true); }}
                        >
                            {showForm ? "Close" : "＋ Receive Material"}
                        </button>
                    </div>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-header">
                            {editing ? `Edit Lot — ${form.lot_code || editing.documentId}` : "Receive Material"}
                        </div>
                        <div className="card-body">
                            {formError && <div className="alert alert-warning">{formError}</div>}
                            <form onSubmit={handleSubmit}>
                                <div className="row g-3">
                                    <div className="col-md-4">
                                        <label className="form-label">Lot Code</label>
                                        <input className="form-control" value={form.lot_code}
                                            onChange={(e) => setField("lot_code", e.target.value)} />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Name</label>
                                        <input className="form-control" value={form.name}
                                            onChange={(e) => setField("name", e.target.value)} />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Product</label>
                                        <ProductSelect
                                            value={form.product}
                                            onChange={(v) => setField("product", v)}
                                            kinds={["raw_material", "consumable"]}
                                            placeholder="— Select raw material —"
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">UoM</label>
                                        <select className="form-select" value={form.uom}
                                            onChange={(e) => setField("uom", e.target.value)}>
                                            {UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Quantity Received *</label>
                                        <input type="number" className="form-control" value={form.quantity_received}
                                            onChange={(e) => setField("quantity_received", e.target.value)} required />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Unit Cost</label>
                                        <input type="number" className="form-control" value={form.unit_cost}
                                            onChange={(e) => setField("unit_cost", e.target.value)} />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Dye Lot</label>
                                        <input className="form-control" value={form.dye_lot}
                                            onChange={(e) => setField("dye_lot", e.target.value)} />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Color</label>
                                        <input className="form-control" value={form.color}
                                            onChange={(e) => setField("color", e.target.value)} />
                                    </div>
                                </div>
                                <div className="mt-3 d-flex gap-2">
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? "Saving..." : editing ? "Save Changes" : "Receive Material"}
                                    </button>
                                    {editing && (
                                        <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={closeForm}>
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading && <p>Loading material lots...</p>}

                {!loading && rows.length === 0 && (
                    <div className="alert alert-info">No material lots found.</div>
                )}

                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Lot Code</th>
                                    <th>Product</th>
                                    <th>UoM</th>
                                    <th>Received</th>
                                    <th>Remaining</th>
                                    <th>Status</th>
                                    <th>Unit Cost</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.documentId || r.id} className={editing?.documentId === r.documentId ? "table-warning" : ""}>
                                        <td>{r.lot_code || "—"}</td>
                                        <td>{r.product?.name || "—"}</td>
                                        <td>{r.uom || "—"}</td>
                                        <td>{r.quantity_received ?? 0}</td>
                                        <td>{r.quantity_remaining ?? 0}</td>
                                        <td>
                                            <span className={`badge bg-${lotStatusColor(r.status)}`}>
                                                {r.status || "—"}
                                            </span>
                                        </td>
                                        <td>{r.unit_cost != null ? Number(r.unit_cost).toFixed(2) : "—"}</td>
                                        <td>
                                            <button className="btn btn-sm btn-outline-primary" title="Edit"
                                                onClick={() => startEdit(r)}>
                                                <i className="fa-solid fa-pen"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
