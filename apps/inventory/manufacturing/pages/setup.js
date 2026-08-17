import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import SearchableSelect from "@rutba/pos-shared/components/SearchableSelect";
import ProductSelect from "../components/ProductSelect";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    MfgOperationsEndpoints,
    MfgPieceRatesEndpoints,
    MfgProductionLinesEndpoints,
    MfgWorkerProfilesEndpoints,
    MfgDefectTypesEndpoints,
    HrEmployeesEndpoints,
} from "@rutba/api-provider/endpoints";

const OP_CATEGORIES = ["cutting", "sewing", "finishing", "qc", "packing", "other"];
const UOMS = ["piece", "meter", "yard", "kg", "gram", "dozen", "set", "cone", "roll", "box"];
const SKILL_GRADES = ["A", "B", "C", "trainee", "any"];
const WORKER_TYPES = ["piece_rate", "fixed", "hybrid", "contractor"];
const SEVERITIES = ["minor", "major", "critical"];

export default function Setup() {
    const { jwt } = useAuth();
    const [tab, setTab] = useState("operations");

    // master data lists
    const [operations, setOperations] = useState([]);
    const [pieceRates, setPieceRates] = useState([]);
    const [lines, setLines] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [defects, setDefects] = useState([]);

    // shared option lists
    const [employees, setEmployees] = useState([]);

    // form states (shared between add and edit; *Editing holds the documentId being edited)
    const EMPTY_OP = { name: "", local_name: "", category: "sewing", default_uom: "piece", is_active: true };
    const EMPTY_PR = { operation: "", product: "", skill_grade: "any", rate: "", min_qty: "0", max_qty: "", effective_from: "", is_active: true };
    const EMPTY_LINE = { name: "", code: "", local_name: "", is_active: true };
    const EMPTY_WORKER = { employee: "", worker_type: "piece_rate", default_skill_grade: "A", code: "", production_line: "", is_active: true };
    const EMPTY_DEFECT = { name: "", severity: "minor", local_name: "", is_active: true };
    const [opForm, setOpForm] = useState(EMPTY_OP);
    const [prForm, setPrForm] = useState(EMPTY_PR);
    const [lineForm, setLineForm] = useState(EMPTY_LINE);
    const [workerForm, setWorkerForm] = useState(EMPTY_WORKER);
    const [defectForm, setDefectForm] = useState(EMPTY_DEFECT);
    const [opEditing, setOpEditing] = useState(null);
    const [prEditing, setPrEditing] = useState(null);
    const [lineEditing, setLineEditing] = useState(null);
    const [workerEditing, setWorkerEditing] = useState(null);
    const [defectEditing, setDefectEditing] = useState(null);

    const [busy, setBusy] = useState(false);

    async function loadOperations() {
        try { const r = await MfgOperationsEndpoints.list(1, 200); setOperations(r.data || []); }
        catch (e) { console.error("Failed to load operations", e); }
    }
    async function loadPieceRates() {
        try { const r = await MfgPieceRatesEndpoints.list(1, 200); setPieceRates(r.data || []); }
        catch (e) { console.error("Failed to load piece rates", e); }
    }
    async function loadLines() {
        try { const r = await MfgProductionLinesEndpoints.list(1, 200); setLines(r.data || []); }
        catch (e) { console.error("Failed to load production lines", e); }
    }
    async function loadWorkers() {
        try { const r = await MfgWorkerProfilesEndpoints.list(1, 200); setWorkers(r.data || []); }
        catch (e) { console.error("Failed to load worker profiles", e); }
    }
    async function loadDefects() {
        try { const r = await MfgDefectTypesEndpoints.list(1, 200); setDefects(r.data || []); }
        catch (e) { console.error("Failed to load defect types", e); }
    }

    useEffect(() => {
        if (!jwt) return;
        loadOperations();
        loadPieceRates();
        loadLines();
        loadWorkers();
        loadDefects();
        (async () => {
            try { const r = await HrEmployeesEndpoints.list(1, 200); setEmployees(r.data || []); }
            catch (e) { console.error("Failed to load employees", e); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt]);

    // ---------- submit handlers (create or update depending on *Editing) ----------
    async function submitOperation(e) {
        e.preventDefault();
        if (!opForm.name) { alert("Name is required."); return; }
        setBusy(true);
        try {
            const payload = {
                name: opForm.name,
                local_name: opForm.local_name || null,
                category: opForm.category,
                default_uom: opForm.default_uom,
                is_active: !!opForm.is_active,
            };
            if (opEditing) await MfgOperationsEndpoints.update(opEditing, payload);
            else await MfgOperationsEndpoints.create(payload);
            setOpForm(EMPTY_OP); setOpEditing(null);
            await loadOperations();
        } catch (err) { console.error("Save operation failed", err); alert("Failed to save operation."); }
        finally { setBusy(false); }
    }
    function editOperation(o) {
        setOpEditing(o.documentId);
        setOpForm({
            name: o.name || "", local_name: o.local_name || "",
            category: o.category || "sewing", default_uom: o.default_uom || "piece",
            is_active: o.is_active !== false,
        });
    }
    async function deleteOperation(o) {
        if (!window.confirm(`Delete operation "${o.name}"?`)) return;
        setBusy(true);
        try { await MfgOperationsEndpoints.del(o.documentId); await loadOperations(); }
        catch (err) { console.error("Delete operation failed", err); alert("Failed to delete operation (it may be in use)."); }
        finally { setBusy(false); }
    }

    async function submitPieceRate(e) {
        e.preventDefault();
        if (!prForm.operation) { alert("Operation is required."); return; }
        if (prForm.rate === "" || Number(prForm.rate) < 0) { alert("Rate is required."); return; }
        setBusy(true);
        try {
            const payload = {
                skill_grade: prForm.skill_grade,
                rate: Number(prForm.rate),
                min_qty: prForm.min_qty === "" ? 0 : Number(prForm.min_qty),
                max_qty: prForm.max_qty === "" ? null : Number(prForm.max_qty),
                effective_from: prForm.effective_from || null,
                is_active: !!prForm.is_active,
                operation: prForm.operation,
                product: prForm.product || null,
            };
            if (prEditing) await MfgPieceRatesEndpoints.update(prEditing, payload);
            else await MfgPieceRatesEndpoints.create(payload);
            setPrForm(EMPTY_PR); setPrEditing(null);
            await loadPieceRates();
        } catch (err) { console.error("Save piece rate failed", err); alert("Failed to save piece rate."); }
        finally { setBusy(false); }
    }
    function editPieceRate(p) {
        setPrEditing(p.documentId);
        setPrForm({
            operation: p.operation?.documentId || "",
            product: p.product?.documentId || "",
            skill_grade: p.skill_grade || "any",
            rate: p.rate != null ? String(p.rate) : "",
            min_qty: p.min_qty != null ? String(p.min_qty) : "0",
            max_qty: p.max_qty != null ? String(p.max_qty) : "",
            effective_from: p.effective_from || "",
            is_active: p.is_active !== false,
        });
    }
    async function deletePieceRate(p) {
        if (!window.confirm(`Delete piece rate ${p.operation?.name || ""} @ ${p.rate}?`)) return;
        setBusy(true);
        try { await MfgPieceRatesEndpoints.del(p.documentId); await loadPieceRates(); }
        catch (err) { console.error("Delete piece rate failed", err); alert("Failed to delete piece rate."); }
        finally { setBusy(false); }
    }

    async function submitLine(e) {
        e.preventDefault();
        if (!lineForm.name) { alert("Name is required."); return; }
        setBusy(true);
        try {
            const payload = {
                name: lineForm.name,
                code: lineForm.code || undefined,
                local_name: lineForm.local_name || null,
                is_active: !!lineForm.is_active,
            };
            if (lineEditing) await MfgProductionLinesEndpoints.update(lineEditing, payload);
            else await MfgProductionLinesEndpoints.create(payload);
            setLineForm(EMPTY_LINE); setLineEditing(null);
            await loadLines();
        } catch (err) { console.error("Save line failed", err); alert("Failed to save production line."); }
        finally { setBusy(false); }
    }
    function editLine(l) {
        setLineEditing(l.documentId);
        setLineForm({
            name: l.name || "", code: l.code || "", local_name: l.local_name || "",
            is_active: l.is_active !== false,
        });
    }
    async function deleteLine(l) {
        if (!window.confirm(`Delete production line "${l.name}"?`)) return;
        setBusy(true);
        try { await MfgProductionLinesEndpoints.del(l.documentId); await loadLines(); }
        catch (err) { console.error("Delete line failed", err); alert("Failed to delete production line (it may be in use)."); }
        finally { setBusy(false); }
    }

    async function submitWorker(e) {
        e.preventDefault();
        if (!workerForm.employee) { alert("Employee is required."); return; }
        setBusy(true);
        try {
            const payload = {
                employee: workerForm.employee,
                worker_type: workerForm.worker_type,
                default_skill_grade: workerForm.default_skill_grade,
                code: workerForm.code || null,
                production_line: workerForm.production_line || null,
                is_active: !!workerForm.is_active,
            };
            if (workerEditing) await MfgWorkerProfilesEndpoints.update(workerEditing, payload);
            else await MfgWorkerProfilesEndpoints.create(payload);
            setWorkerForm(EMPTY_WORKER); setWorkerEditing(null);
            await loadWorkers();
        } catch (err) { console.error("Save worker failed", err); alert("Failed to save worker profile."); }
        finally { setBusy(false); }
    }
    function editWorker(w) {
        setWorkerEditing(w.documentId);
        setWorkerForm({
            employee: w.employee?.documentId || "",
            worker_type: w.worker_type || "piece_rate",
            default_skill_grade: w.default_skill_grade || "A",
            code: w.code || "",
            production_line: w.production_line?.documentId || "",
            is_active: w.is_active !== false,
        });
    }
    async function deleteWorker(w) {
        if (!window.confirm(`Delete worker profile "${w.employee?.name || w.code}"? Existing tasks will lose their link to this profile — prefer unticking Active instead.`)) return;
        setBusy(true);
        try { await MfgWorkerProfilesEndpoints.del(w.documentId); await loadWorkers(); }
        catch (err) { console.error("Delete worker failed", err); alert("Failed to delete worker profile."); }
        finally { setBusy(false); }
    }

    async function submitDefect(e) {
        e.preventDefault();
        if (!defectForm.name) { alert("Name is required."); return; }
        setBusy(true);
        try {
            const payload = {
                name: defectForm.name,
                severity: defectForm.severity,
                local_name: defectForm.local_name || null,
                is_active: !!defectForm.is_active,
            };
            if (defectEditing) await MfgDefectTypesEndpoints.update(defectEditing, payload);
            else await MfgDefectTypesEndpoints.create(payload);
            setDefectForm(EMPTY_DEFECT); setDefectEditing(null);
            await loadDefects();
        } catch (err) { console.error("Save defect failed", err); alert("Failed to save defect type."); }
        finally { setBusy(false); }
    }
    function editDefect(d) {
        setDefectEditing(d.documentId);
        setDefectForm({
            name: d.name || "", severity: d.severity || "minor", local_name: d.local_name || "",
            is_active: d.is_active !== false,
        });
    }
    async function deleteDefect(d) {
        if (!window.confirm(`Delete defect type "${d.name}"?`)) return;
        setBusy(true);
        try { await MfgDefectTypesEndpoints.del(d.documentId); await loadDefects(); }
        catch (err) { console.error("Delete defect failed", err); alert("Failed to delete defect type."); }
        finally { setBusy(false); }
    }

    // shared row-action buttons + form helpers
    const rowActions = (onEdit, onDelete) => (
        <div className="d-flex gap-1">
            <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={onEdit} title="Edit">
                <i className="fa-solid fa-pen"></i>
            </button>
            <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={onDelete} title="Delete">
                <i className="fa-solid fa-trash"></i>
            </button>
        </div>
    );
    const activeBadge = (row) => (
        row.is_active === false ? <span className="badge bg-secondary ms-1">inactive</span> : null
    );
    const formButtons = (editing, onCancel) => (
        <div className="d-flex gap-1">
            <button type="submit" className="btn btn-primary w-100" disabled={busy}>
                {editing ? "Save" : "Add"}
            </button>
            {editing && (
                <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            )}
        </div>
    );
    const activeCheck = (id, checked, onChange) => (
        <div className="form-check mt-2">
            <input className="form-check-input" type="checkbox" id={id} checked={!!checked}
                onChange={(e) => onChange(e.target.checked)} />
            <label className="form-check-label small" htmlFor={id}>Active</label>
        </div>
    );

    const operationOptions = operations.map((o) => ({
        value: o.documentId,
        label: `${o.name}${o.local_name ? ` · ${o.local_name}` : ""}`,
    }));
    const employeeOptions = employees.map((emp) => ({
        value: emp.documentId,
        label: `${emp.name}${emp.designation ? ` — ${emp.designation}` : ""}`,
    }));

    const TABS = [
        { key: "operations", label: "Operations" },
        { key: "piece_rates", label: "Piece Rates" },
        { key: "lines", label: "Production Lines" },
        { key: "workers", label: "Worker Profiles" },
        { key: "defects", label: "Defect Types" },
    ];

    return (
        <ProtectedRoute>
            <Layout>
                <PermissionCheck adminOnly>
                <h2 className="mb-3">Manufacturing Setup</h2>

                <ul className="nav nav-tabs mb-3">
                    {TABS.map((t) => (
                        <li className="nav-item" key={t.key}>
                            <button
                                className={`nav-link ${tab === t.key ? "active" : ""}`}
                                onClick={() => setTab(t.key)}
                            >
                                {t.label}
                            </button>
                        </li>
                    ))}
                </ul>

                {/* OPERATIONS */}
                {tab === "operations" && (
                    <div className="card">
                        <div className="card-body">
                            <div className="table-responsive">
                                <table className="table table-striped table-hover">
                                    <thead className="table-dark">
                                        <tr><th>Name</th><th>Local Name</th><th>Category</th><th>Default UoM</th><th>Actions</th></tr>
                                    </thead>
                                    <tbody>
                                        {operations.length === 0 && <tr><td colSpan={5} className="text-muted">No operations.</td></tr>}
                                        {operations.map((o) => (
                                            <tr key={o.documentId || o.id} className={opEditing === o.documentId ? "table-warning" : ""}>
                                                <td>{o.name}{activeBadge(o)}</td>
                                                <td>{o.local_name || "—"}</td>
                                                <td>{o.category || "—"}</td>
                                                <td>{o.default_uom || "—"}</td>
                                                <td>{rowActions(() => editOperation(o), () => deleteOperation(o))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <form className="row g-2 align-items-end" onSubmit={submitOperation}>
                                {opEditing && <div className="col-12"><span className="badge bg-warning text-dark">Editing: {opForm.name}</span></div>}
                                <div className="col-md-3">
                                    <label className="form-label">Name *</label>
                                    <input className="form-control" value={opForm.name}
                                        onChange={(e) => setOpForm((f) => ({ ...f, name: e.target.value }))} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Local Name</label>
                                    <input className="form-control" value={opForm.local_name}
                                        onChange={(e) => setOpForm((f) => ({ ...f, local_name: e.target.value }))} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Category</label>
                                    <select className="form-select" value={opForm.category}
                                        onChange={(e) => setOpForm((f) => ({ ...f, category: e.target.value }))}>
                                        {OP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Default UoM</label>
                                    <select className="form-select" value={opForm.default_uom}
                                        onChange={(e) => setOpForm((f) => ({ ...f, default_uom: e.target.value }))}>
                                        {UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-1">
                                    {activeCheck("op-active", opForm.is_active, (v) => setOpForm((f) => ({ ...f, is_active: v })))}
                                </div>
                                <div className="col-md-2">
                                    {formButtons(opEditing, () => { setOpEditing(null); setOpForm(EMPTY_OP); })}
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* PIECE RATES */}
                {tab === "piece_rates" && (
                    <div className="card">
                        <div className="card-body">
                            <div className="table-responsive">
                                <table className="table table-striped table-hover">
                                    <thead className="table-dark">
                                        <tr><th>Operation</th><th>Product</th><th>Skill</th><th>Rate</th><th>Min Qty</th><th>Max Qty</th><th>Actions</th></tr>
                                    </thead>
                                    <tbody>
                                        {pieceRates.length === 0 && <tr><td colSpan={7} className="text-muted">No piece rates.</td></tr>}
                                        {pieceRates.map((p) => (
                                            <tr key={p.documentId || p.id} className={prEditing === p.documentId ? "table-warning" : ""}>
                                                <td>{p.operation?.name || "—"}{activeBadge(p)}</td>
                                                <td>{p.product?.name || "—"}</td>
                                                <td>{p.skill_grade || "—"}</td>
                                                <td>{p.rate != null ? Number(p.rate).toFixed(2) : "—"}</td>
                                                <td>{p.min_qty ?? 0}</td>
                                                <td>{p.max_qty ?? "—"}</td>
                                                <td>{rowActions(() => editPieceRate(p), () => deletePieceRate(p))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <form className="row g-2 align-items-end" onSubmit={submitPieceRate}>
                                {prEditing && <div className="col-12"><span className="badge bg-warning text-dark">Editing piece rate</span></div>}
                                <div className="col-md-3">
                                    <label className="form-label">Operation *</label>
                                    <SearchableSelect
                                        value={prForm.operation}
                                        onChange={(v) => setPrForm((f) => ({ ...f, operation: v }))}
                                        options={operationOptions}
                                        placeholder="— Select —"
                                    />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Product</label>
                                    <ProductSelect
                                        value={prForm.product}
                                        onChange={(v) => setPrForm((f) => ({ ...f, product: v }))}
                                        placeholder="— Any product —"
                                    />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Skill</label>
                                    <select className="form-select" value={prForm.skill_grade}
                                        onChange={(e) => setPrForm((f) => ({ ...f, skill_grade: e.target.value }))}>
                                        {SKILL_GRADES.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Rate *</label>
                                    <input type="number" className="form-control" value={prForm.rate}
                                        onChange={(e) => setPrForm((f) => ({ ...f, rate: e.target.value }))} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Min Qty</label>
                                    <input type="number" className="form-control" value={prForm.min_qty}
                                        onChange={(e) => setPrForm((f) => ({ ...f, min_qty: e.target.value }))} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Max Qty</label>
                                    <input type="number" className="form-control" value={prForm.max_qty}
                                        onChange={(e) => setPrForm((f) => ({ ...f, max_qty: e.target.value }))} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Effective From</label>
                                    <input type="date" className="form-control" value={prForm.effective_from}
                                        onChange={(e) => setPrForm((f) => ({ ...f, effective_from: e.target.value }))} />
                                </div>
                                <div className="col-md-1">
                                    {activeCheck("pr-active", prForm.is_active, (v) => setPrForm((f) => ({ ...f, is_active: v })))}
                                </div>
                                <div className="col-md-2">
                                    {formButtons(prEditing, () => { setPrEditing(null); setPrForm(EMPTY_PR); })}
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* PRODUCTION LINES */}
                {tab === "lines" && (
                    <div className="card">
                        <div className="card-body">
                            <div className="table-responsive">
                                <table className="table table-striped table-hover">
                                    <thead className="table-dark">
                                        <tr><th>Name</th><th>Code</th><th>Local Name</th><th>Actions</th></tr>
                                    </thead>
                                    <tbody>
                                        {lines.length === 0 && <tr><td colSpan={4} className="text-muted">No production lines.</td></tr>}
                                        {lines.map((l) => (
                                            <tr key={l.documentId || l.id} className={lineEditing === l.documentId ? "table-warning" : ""}>
                                                <td>{l.name}{activeBadge(l)}</td>
                                                <td>{l.code || "—"}</td>
                                                <td>{l.local_name || "—"}</td>
                                                <td>{rowActions(() => editLine(l), () => deleteLine(l))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <form className="row g-2 align-items-end" onSubmit={submitLine}>
                                {lineEditing && <div className="col-12"><span className="badge bg-warning text-dark">Editing: {lineForm.name}</span></div>}
                                <div className="col-md-4">
                                    <label className="form-label">Name *</label>
                                    <input className="form-control" value={lineForm.name}
                                        onChange={(e) => setLineForm((f) => ({ ...f, name: e.target.value }))} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Code</label>
                                    <input className="form-control" value={lineForm.code}
                                        onChange={(e) => setLineForm((f) => ({ ...f, code: e.target.value }))} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Local Name</label>
                                    <input className="form-control" value={lineForm.local_name}
                                        onChange={(e) => setLineForm((f) => ({ ...f, local_name: e.target.value }))} />
                                </div>
                                <div className="col-md-1">
                                    {activeCheck("line-active", lineForm.is_active, (v) => setLineForm((f) => ({ ...f, is_active: v })))}
                                </div>
                                <div className="col-md-2">
                                    {formButtons(lineEditing, () => { setLineEditing(null); setLineForm(EMPTY_LINE); })}
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* WORKER PROFILES */}
                {tab === "workers" && (
                    <div className="card">
                        <div className="card-body">
                            <div className="table-responsive">
                                <table className="table table-striped table-hover">
                                    <thead className="table-dark">
                                        <tr><th>Employee</th><th>Type</th><th>Skill Grade</th><th>Code</th><th>Line</th><th>Actions</th></tr>
                                    </thead>
                                    <tbody>
                                        {workers.length === 0 && <tr><td colSpan={6} className="text-muted">No worker profiles.</td></tr>}
                                        {workers.map((w) => (
                                            <tr key={w.documentId || w.id} className={workerEditing === w.documentId ? "table-warning" : ""}>
                                                <td>{w.employee?.name || "—"}{activeBadge(w)}</td>
                                                <td>{w.worker_type || "—"}</td>
                                                <td>{w.default_skill_grade || "—"}</td>
                                                <td>{w.code || "—"}</td>
                                                <td>{w.production_line?.name || "—"}</td>
                                                <td>{rowActions(() => editWorker(w), () => deleteWorker(w))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <form className="row g-2 align-items-end" onSubmit={submitWorker}>
                                {workerEditing && <div className="col-12"><span className="badge bg-warning text-dark">Editing worker profile</span></div>}
                                <div className="col-md-3">
                                    <label className="form-label">Employee *</label>
                                    <SearchableSelect
                                        value={workerForm.employee}
                                        onChange={(v) => setWorkerForm((f) => ({ ...f, employee: v }))}
                                        options={employeeOptions}
                                        placeholder="— Select employee —"
                                    />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Worker Type</label>
                                    <select className="form-select" value={workerForm.worker_type}
                                        onChange={(e) => setWorkerForm((f) => ({ ...f, worker_type: e.target.value }))}>
                                        {WORKER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-1">
                                    <label className="form-label">Grade</label>
                                    <select className="form-select" value={workerForm.default_skill_grade}
                                        onChange={(e) => setWorkerForm((f) => ({ ...f, default_skill_grade: e.target.value }))}>
                                        {["A", "B", "C", "trainee"].map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-1">
                                    <label className="form-label">Code</label>
                                    <input className="form-control" value={workerForm.code}
                                        onChange={(e) => setWorkerForm((f) => ({ ...f, code: e.target.value }))} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Line</label>
                                    <SearchableSelect
                                        value={workerForm.production_line}
                                        onChange={(v) => setWorkerForm((f) => ({ ...f, production_line: v }))}
                                        options={lines.map((l) => ({ value: l.documentId, label: l.name || l.documentId }))}
                                        placeholder="— None —"
                                    />
                                </div>
                                <div className="col-md-1">
                                    {activeCheck("worker-active", workerForm.is_active, (v) => setWorkerForm((f) => ({ ...f, is_active: v })))}
                                </div>
                                <div className="col-md-2">
                                    {formButtons(workerEditing, () => { setWorkerEditing(null); setWorkerForm(EMPTY_WORKER); })}
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* DEFECT TYPES */}
                {tab === "defects" && (
                    <div className="card">
                        <div className="card-body">
                            <div className="table-responsive">
                                <table className="table table-striped table-hover">
                                    <thead className="table-dark">
                                        <tr><th>Name</th><th>Severity</th><th>Local Name</th><th>Actions</th></tr>
                                    </thead>
                                    <tbody>
                                        {defects.length === 0 && <tr><td colSpan={4} className="text-muted">No defect types.</td></tr>}
                                        {defects.map((d) => (
                                            <tr key={d.documentId || d.id} className={defectEditing === d.documentId ? "table-warning" : ""}>
                                                <td>{d.name}{activeBadge(d)}</td>
                                                <td>{d.severity || "—"}</td>
                                                <td>{d.local_name || "—"}</td>
                                                <td>{rowActions(() => editDefect(d), () => deleteDefect(d))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <form className="row g-2 align-items-end" onSubmit={submitDefect}>
                                {defectEditing && <div className="col-12"><span className="badge bg-warning text-dark">Editing: {defectForm.name}</span></div>}
                                <div className="col-md-4">
                                    <label className="form-label">Name *</label>
                                    <input className="form-control" value={defectForm.name}
                                        onChange={(e) => setDefectForm((f) => ({ ...f, name: e.target.value }))} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">Severity</label>
                                    <select className="form-select" value={defectForm.severity}
                                        onChange={(e) => setDefectForm((f) => ({ ...f, severity: e.target.value }))}>
                                        {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Local Name</label>
                                    <input className="form-control" value={defectForm.local_name}
                                        onChange={(e) => setDefectForm((f) => ({ ...f, local_name: e.target.value }))} />
                                </div>
                                <div className="col-md-1">
                                    {activeCheck("defect-active", defectForm.is_active, (v) => setDefectForm((f) => ({ ...f, is_active: v })))}
                                </div>
                                <div className="col-md-2">
                                    {formButtons(defectEditing, () => { setDefectEditing(null); setDefectForm(EMPTY_DEFECT); })}
                                </div>
                            </form>
                        </div>
                    </div>
                )}
                </PermissionCheck>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
