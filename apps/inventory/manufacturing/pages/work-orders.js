import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import SearchableSelect from "@rutba/pos-shared/components/SearchableSelect";
import ProductSelect from "../components/ProductSelect";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    MfgWorkOrdersEndpoints,
    MfgBomsEndpoints,
    MfgProductionLinesEndpoints,
    WorkflowsEndpoints,
} from "@rutba/api-provider/endpoints";

const WO_ENTITY_UID = "api::mfg-work-order.mfg-work-order";
const WO_STATUSES = ["Draft", "Released", "InProgress", "OnHold", "Completed", "Cancelled"];

function woStatusColor(status) {
    switch (status) {
        case "Released": return "info";
        case "InProgress": return "primary";
        case "OnHold": return "warning";
        case "Completed": return "success";
        case "Cancelled": return "danger";
        case "Draft":
        default: return "secondary";
    }
}

function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString() : "—";
}

const EMPTY_FORM = {
    wo_number: "",
    name: "",
    quantity_ordered: "",
    product: "",
    bom: "",
    production_line: "",
    priority: "Normal",
    due_date: "",
    notes: "",
};

export default function WorkOrders() {
    const { jwt } = useAuth();
    const router = useRouter();
    const statusFilter = typeof router.query.status === "string" ? router.query.status : "";
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchText, setSearchText] = useState("");
    const [workflow, setWorkflow] = useState(null);

    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formError, setFormError] = useState("");
    const [editing, setEditing] = useState(null); // documentId of the WO being edited

    const [boms, setBoms] = useState([]);
    const [lines, setLines] = useState([]);

    const reload = useCallback(async (term) => {
        setLoading(true);
        try {
            const res = await MfgWorkOrdersEndpoints.list(1, 100, {
                sort: ["createdAt:desc"],
                ...(statusFilter ? { statusFilter } : {}),
                ...(term ? { searchTerm: term } : {}),
            });
            setRows(res.data || []);
            setError("");
        } catch (err) {
            console.error("Failed to load work orders", err);
            setError("Failed to load work orders.");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    useEffect(() => {
        if (!jwt || !router.isReady) return;
        reload(searchText);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt, router.isReady, statusFilter]);

    useEffect(() => {
        if (!jwt) return;
        (async () => {
            try {
                const res = await MfgBomsEndpoints.list(1, 100);
                setBoms(res.data || []);
            } catch (err) {
                console.error("Failed to load BOMs", err);
            }
            try {
                const res = await MfgProductionLinesEndpoints.list(1, 100);
                setLines(res.data || []);
            } catch (err) {
                console.error("Failed to load production lines", err);
            }
            try {
                const res = await WorkflowsEndpoints.list(1, 1, { entityUid: WO_ENTITY_UID });
                setWorkflow((res.data || [])[0] || null);
            } catch (err) {
                console.error("Failed to load workflow", err);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt]);

    // resolve a row's workflow stage (stage_key first, else status mapping)
    const wfStages = (workflow?.stages || []).slice().sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const stageFor = (r) =>
        wfStages.find((s) => s.key === r.stage_key) ||
        wfStages.find((s) => s.maps_to_status === (r.status || "Draft")) ||
        null;

    // BOMs for the chosen product first; BOMs without a product (or when no
    // product is chosen yet) stay available below them.
    const bomOptions = [...boms]
        .sort((a, b) => {
            const rank = (x) => (form.product && x.product?.documentId === form.product ? 0 : 1);
            return rank(a) - rank(b);
        })
        .map((b) => ({
            value: b.documentId,
            label: `${b.name || b.documentId}${b.version ? ` (v${b.version})` : ""}${b.product?.name ? ` — ${b.product.name}` : ""}`,
        }));
    const lineOptions = lines.map((l) => ({ value: l.documentId, label: l.name || l.documentId }));

    function setField(key, value) {
        setForm((f) => ({ ...f, [key]: value }));
    }

    function startEdit(wo) {
        setEditing(wo.documentId);
        setForm({
            wo_number: wo.wo_number || "",
            name: wo.name || "",
            quantity_ordered: wo.quantity_ordered != null ? String(wo.quantity_ordered) : "",
            product: wo.product?.documentId || "",
            bom: wo.bom?.documentId || "",
            production_line: wo.production_line?.documentId || "",
            priority: wo.priority || "Normal",
            due_date: wo.due_date || "",
            notes: wo.notes || "",
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
        if (form.quantity_ordered === "" || Number(form.quantity_ordered) <= 0) {
            setFormError("Quantity ordered is required and must be greater than 0.");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                wo_number: form.wo_number || undefined,
                name: form.name || undefined,
                quantity_ordered: Number(form.quantity_ordered),
                priority: form.priority || undefined,
                due_date: form.due_date || null,
                notes: form.notes || null,
            };
            if (editing) {
                // relations can be cleared on edit, not just set
                payload.product = form.product || null;
                payload.bom = form.bom || null;
                payload.production_line = form.production_line || null;
                await MfgWorkOrdersEndpoints.update(editing, payload);
            } else {
                if (form.product) payload.product = form.product;
                if (form.bom) payload.bom = form.bom;
                if (form.production_line) payload.production_line = form.production_line;
                await MfgWorkOrdersEndpoints.create(payload);
            }
            closeForm();
            await reload();
        } catch (err) {
            console.error("Failed to save work order", err);
            setFormError(editing ? "Failed to update work order." : "Failed to create work order.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-2">
                    <h2 className="mb-0">
                        Work Orders
                        {statusFilter && (
                            <span className="badge bg-secondary ms-2 align-middle" style={{ fontSize: 13 }}>
                                {statusFilter}
                                <Link href="/work-orders" className="text-white ms-2 text-decoration-none" title="Clear filter">×</Link>
                            </span>
                        )}
                    </h2>
                    <div className="d-flex gap-2">
                        <Link href="/board" className="btn btn-sm btn-outline-secondary">
                            <i className="fa-solid fa-table-columns me-1"></i>Board
                        </Link>
                        <button
                            className="btn btn-sm btn-primary"
                            onClick={() => { showForm ? closeForm() : setShowForm(true); }}
                        >
                            {showForm ? "Close" : "＋ New Work Order"}
                        </button>
                    </div>
                </div>

                <form
                    className="d-flex gap-2 mb-3"
                    onSubmit={(e) => { e.preventDefault(); reload(searchText); }}
                >
                    <input
                        className="form-control form-control-sm"
                        style={{ maxWidth: 320 }}
                        placeholder="Search WO # or name…"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                    <button type="submit" className="btn btn-sm btn-outline-primary">Search</button>
                    {searchText && (
                        <button type="button" className="btn btn-sm btn-outline-secondary"
                            onClick={() => { setSearchText(""); reload(""); }}>
                            Clear
                        </button>
                    )}
                </form>

                {error && <div className="alert alert-danger">{error}</div>}

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-header">
                            {editing ? `Edit Work Order — ${form.wo_number || editing}` : "New Work Order"}
                        </div>
                        <div className="card-body">
                            {formError && <div className="alert alert-warning">{formError}</div>}
                            <form onSubmit={handleSubmit}>
                                <div className="row g-3">
                                    <div className="col-md-4">
                                        <label className="form-label">WO #</label>
                                        <input
                                            className="form-control"
                                            value={form.wo_number}
                                            onChange={(e) => setField("wo_number", e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Name</label>
                                        <input
                                            className="form-control"
                                            value={form.name}
                                            onChange={(e) => setField("name", e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Quantity Ordered *</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={form.quantity_ordered}
                                            onChange={(e) => setField("quantity_ordered", e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Product</label>
                                        <ProductSelect
                                            value={form.product}
                                            onChange={(v) => {
                                                setField("product", v);
                                                // keep the BOM consistent with the product
                                                const current = boms.find((b) => b.documentId === form.bom);
                                                if (current?.product?.documentId && current.product.documentId !== v) {
                                                    setField("bom", "");
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">BOM</label>
                                        <SearchableSelect
                                            value={form.bom}
                                            onChange={(v) => setField("bom", v)}
                                            options={bomOptions}
                                            placeholder="— Select BOM —"
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Production Line</label>
                                        <SearchableSelect
                                            value={form.production_line}
                                            onChange={(v) => setField("production_line", v)}
                                            options={lineOptions}
                                            placeholder="— Select line —"
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Priority</label>
                                        <select
                                            className="form-select"
                                            value={form.priority}
                                            onChange={(e) => setField("priority", e.target.value)}
                                        >
                                            <option value="Low">Low</option>
                                            <option value="Normal">Normal</option>
                                            <option value="High">High</option>
                                            <option value="Urgent">Urgent</option>
                                        </select>
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Due Date</label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={form.due_date}
                                            onChange={(e) => setField("due_date", e.target.value)}
                                        />
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label">Notes</label>
                                        <textarea
                                            className="form-control"
                                            rows={2}
                                            value={form.notes}
                                            onChange={(e) => setField("notes", e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="mt-3 d-flex gap-2">
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? "Saving..." : editing ? "Save Changes" : "Create Work Order"}
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

                {loading && <p>Loading work orders...</p>}

                {!loading && rows.length === 0 && (
                    <div className="alert alert-info">No work orders found.</div>
                )}

                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>WO #</th>
                                    <th>Name</th>
                                    <th>Product</th>
                                    <th>Stage</th>
                                    <th>Ordered</th>
                                    <th>Completed</th>
                                    <th>Due</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.documentId || r.id} className={editing === r.documentId ? "table-warning" : ""}>
                                        <td>
                                            <Link href={`/work-orders/${r.documentId}`}>
                                                {r.wo_number || r.documentId}
                                            </Link>
                                        </td>
                                        <td>{r.name || "—"}</td>
                                        <td>{r.product?.name || "—"}</td>
                                        <td>
                                            {(() => {
                                                const stage = stageFor(r);
                                                if (!stage) {
                                                    return (
                                                        <span className={`badge bg-${woStatusColor(r.status)}`}>
                                                            {r.status || "Draft"}
                                                        </span>
                                                    );
                                                }
                                                const dark = ["light", "warning", "info"].includes(stage.color);
                                                return (
                                                    <>
                                                        <span className={`badge bg-${stage.color || "secondary"} ${dark ? "text-dark" : ""}`}>
                                                            {stage.name || stage.key}
                                                        </span>
                                                        {(stage.name || stage.key) !== r.status && (
                                                            <span className="badge bg-light text-muted border ms-1" title="Canonical status">
                                                                {r.status || "Draft"}
                                                            </span>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </td>
                                        <td>{r.quantity_ordered ?? 0}</td>
                                        <td>{r.quantity_completed ?? 0}</td>
                                        <td>{fmtDate(r.due_date)}</td>
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
