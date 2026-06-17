import { useState, useEffect, useCallback, useRef } from "react";
import SearchableSelect from "../SearchableSelect";
import PermissionCheck from "../PermissionCheck";
import WorkflowCanvas from "./WorkflowCanvas";
import { exportWorkflowToExcel, parseWorkflowFromExcel } from "./workflowExcel";

const COLORS = ["secondary", "info", "primary", "warning", "success", "danger", "dark", "light"];

const EMPTY_STAGE = { key: "", name: "", local_name: "", maps_to_status: "", sequence: 0, color: "secondary", is_initial: false, is_terminal: false, pos_x: null, pos_y: null };
const EMPTY_TRANSITION = { from_key: "", to_key: "", label: "", approles: "" };

function emptyForm(entityUid) {
    return { name: "", entity_uid: entityUid || "", description: "", is_default: true, is_active: true, stages: [], transitions: [] };
}

// strip Strapi component ids so saves replace the arrays cleanly
function stripIds(rows, template) {
    return (rows || []).map((r) => {
        const out = {};
        Object.keys(template).forEach((k) => { out[k] = r[k] ?? template[k]; });
        return out;
    });
}

/**
 * Generic editor for definable workflows (api::workflow.workflow).
 * Stages map to the entity's canonical statuses; transitions connect stage
 * keys. The entity's state machine validates moves against this definition.
 *
 * Props:
 *  - endpoints  WorkflowsEndpoints (list/create/update/del)
 *  - entities   [{ uid, label, statuses: string[] }] — entity types this app manages
 *  - jwt        auth token (load gate)
 */
export default function WorkflowEditor({ endpoints, entities = [], jwt }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const [editing, setEditing] = useState(null); // documentId | "new" | null
    const [view, setView] = useState("visual"); // "visual" | "table"
    const [form, setForm] = useState(emptyForm(entities[0]?.uid));
    const [ioMsg, setIoMsg] = useState(null); // { type, text } — Excel import/export feedback
    const [importNonce, setImportNonce] = useState(0); // bumped each import so the canvas reseeds
    const fileRef = useRef(null);

    const uids = entities.map((e) => e.uid);
    const entityFor = (uid) => entities.find((e) => e.uid === uid);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const res = await endpoints.list(1, 100);
            setRows((res.data || []).filter((w) => uids.includes(w.entity_uid)));
            setError("");
        } catch (err) {
            console.error("Failed to load workflows", err);
            setError("Failed to load workflows. (Has the server been restarted since the workflow feature was added?)");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt]);

    useEffect(() => { if (jwt) reload(); }, [jwt, reload]);

    function startNew() {
        setForm(emptyForm(entities[0]?.uid));
        setEditing("new");
    }

    function startEdit(w) {
        setForm({
            name: w.name || "",
            entity_uid: w.entity_uid || entities[0]?.uid || "",
            description: w.description || "",
            is_default: w.is_default !== false,
            is_active: w.is_active !== false,
            stages: stripIds(w.stages, EMPTY_STAGE),
            transitions: stripIds(w.transitions, EMPTY_TRANSITION),
        });
        setEditing(w.documentId);
    }

    async function remove(w) {
        if (!window.confirm(`Delete workflow "${w.name}"? The entity falls back to its built-in transitions.`)) return;
        setBusy(true);
        try { await endpoints.del(w.documentId); if (editing === w.documentId) setEditing(null); await reload(); }
        catch (err) { console.error("Delete workflow failed", err); alert("Failed to delete workflow."); }
        finally { setBusy(false); }
    }

    function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }
    function setStage(i, k, v) {
        setForm((f) => {
            const stages = [...f.stages];
            stages[i] = { ...stages[i], [k]: v };
            return { ...f, stages };
        });
    }
    function setTransition(i, k, v) {
        setForm((f) => {
            const transitions = [...f.transitions];
            transitions[i] = { ...transitions[i], [k]: v };
            return { ...f, transitions };
        });
    }

    async function save(e) {
        e.preventDefault();
        if (!form.name) { alert("Name is required."); return; }
        if (!form.entity_uid) { alert("Entity is required."); return; }
        const keys = form.stages.map((s) => s.key.trim()).filter(Boolean);
        if (keys.length === 0) { alert("Define at least one stage."); return; }
        if (new Set(keys).size !== keys.length) { alert("Stage keys must be unique."); return; }
        for (const s of form.stages) {
            if (!s.key.trim()) { alert("Every stage needs a key."); return; }
            if (!s.maps_to_status) { alert(`Stage "${s.key}" needs a status mapping.`); return; }
        }
        for (const t of form.transitions) {
            if (!keys.includes(t.from_key) || !keys.includes(t.to_key)) {
                alert(`Transition ${t.from_key || "?"} → ${t.to_key || "?"} references an unknown stage key.`); return;
            }
        }
        setBusy(true);
        try {
            const payload = {
                ...form,
                stages: form.stages.map((s, i) => ({ ...s, key: s.key.trim(), sequence: Number(s.sequence) || (i + 1) * 10 })),
                transitions: form.transitions.map((t) => ({ ...t, label: t.label || undefined })),
            };
            if (editing && editing !== "new") await endpoints.update(editing, payload);
            else await endpoints.create(payload);
            setEditing(null);
            await reload();
        } catch (err) {
            console.error("Save workflow failed", err);
            alert("Failed to save workflow.");
        } finally { setBusy(false); }
    }

    // ── Excel import/export (admin-only — see PermissionCheck wraps below) ──
    function exportWorkflow(w) {
        try { exportWorkflowToExcel(w); }
        catch (err) { setIoMsg({ type: "danger", text: `Export failed: ${err.message || err}` }); }
    }

    async function onImportFile(e) {
        const file = e.target.files?.[0];
        if (fileRef.current) fileRef.current.value = "";
        if (!file) return;
        setIoMsg(null);
        try {
            const parsed = await parseWorkflowFromExcel(file);
            if (!uids.includes(parsed.entity_uid)) {
                setIoMsg({ type: "danger", text: `This workbook targets "${parsed.entity_uid}", which isn't managed here. Import it from the app that owns that entity.` });
                return;
            }
            // Match by documentId so a round-tripped file updates its source;
            // otherwise it loads as a new workflow. Either way the admin
            // reviews in the designer and Saves through the normal (admin-only)
            // create/update path — import never writes blindly.
            const match = parsed.documentId ? rows.find((r) => r.documentId === parsed.documentId) : null;
            setForm({
                name: parsed.name,
                entity_uid: parsed.entity_uid,
                description: parsed.description,
                is_default: parsed.is_default,
                is_active: parsed.is_active,
                stages: parsed.stages,
                transitions: parsed.transitions,
            });
            setEditing(match ? match.documentId : "new");
            setImportNonce((n) => n + 1); // force the visual canvas to reseed from the imported data
            setView("visual");
            setIoMsg({
                type: "success",
                text: `Loaded "${parsed.name}" — ${parsed.stages.length} stage(s), ${parsed.transitions.length} transition(s). ${match ? "Will update the existing workflow" : "Will create a new workflow"} when you Save. Review below.`,
            });
        } catch (err) {
            setIoMsg({ type: "danger", text: err.message || "Import failed." });
        }
    }

    const statuses = entityFor(form.entity_uid)?.statuses || [];
    const stageKeyOptions = form.stages.filter((s) => s.key.trim()).map((s) => ({ value: s.key.trim(), label: `${s.key.trim()}${s.name ? ` (${s.name})` : ""}` }));

    return (
        <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="mb-0">Workflows</h2>
                <div className="d-flex gap-2">
                    <PermissionCheck showIf="admin">
                        <label className="btn btn-sm btn-outline-info mb-0" title="Import a workflow definition from Excel">
                            <i className="fa-solid fa-file-excel me-1"></i>Import Excel
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="d-none" onChange={onImportFile} />
                        </label>
                    </PermissionCheck>
                    <button className="btn btn-sm btn-primary" onClick={startNew}>＋ New Workflow</button>
                </div>
            </div>
            <p className="text-muted">
                Stages are free-form steps; each maps to a canonical status so the state machine keeps running
                stock / costing side effects. Transitions define which moves are allowed.
            </p>

            {ioMsg && (
                <div className={`alert alert-${ioMsg.type} d-flex justify-content-between align-items-start`}>
                    <span>{ioMsg.text}</span>
                    <button type="button" className="btn-close" aria-label="Close" onClick={() => setIoMsg(null)} />
                </div>
            )}
            {error && <div className="alert alert-danger">{error}</div>}
            {loading && <p>Loading workflows...</p>}

            {!loading && (
                <div className="table-responsive mb-4">
                    <table className="table table-striped table-hover">
                        <thead className="table-dark">
                            <tr><th>Name</th><th>Entity</th><th>Stages</th><th>Transitions</th><th>Active</th><th>Default</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={7} className="text-muted">No workflows defined — the built-in transitions apply.</td></tr>}
                            {rows.map((w) => (
                                <tr key={w.documentId} className={editing === w.documentId ? "table-warning" : ""}>
                                    <td>{w.name}</td>
                                    <td>{entityFor(w.entity_uid)?.label || w.entity_uid}</td>
                                    <td>{(w.stages || []).length}</td>
                                    <td>{(w.transitions || []).length}</td>
                                    <td>{w.is_active !== false ? "✓" : "—"}</td>
                                    <td>{w.is_default !== false ? "✓" : "—"}</td>
                                    <td>
                                        <div className="d-flex gap-1">
                                            <PermissionCheck showIf="admin">
                                                <button className="btn btn-sm btn-outline-success" disabled={busy} onClick={() => exportWorkflow(w)} title="Export to Excel">
                                                    <i className="fa-solid fa-file-excel"></i>
                                                </button>
                                            </PermissionCheck>
                                            <button className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => startEdit(w)} title="Edit">
                                                <i className="fa-solid fa-pen"></i>
                                            </button>
                                            <button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => remove(w)} title="Delete">
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editing && (
                <form onSubmit={save}>
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <span>{editing === "new" ? "New Workflow" : `Edit Workflow — ${form.name}`}</span>
                            <PermissionCheck showIf="admin">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-success"
                                    title="Export this workflow to Excel"
                                    onClick={() => exportWorkflow({ ...form, documentId: editing !== "new" ? editing : undefined })}
                                >
                                    <i className="fa-solid fa-file-excel me-1"></i>Export
                                </button>
                            </PermissionCheck>
                        </div>
                        <div className="card-body">
                            <div className="row g-3 mb-2">
                                <div className="col-md-4">
                                    <label className="form-label">Name *</label>
                                    <input className="form-control" value={form.name} onChange={(e) => setField("name", e.target.value)} />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Entity *</label>
                                    <SearchableSelect
                                        value={form.entity_uid}
                                        onChange={(v) => setField("entity_uid", v)}
                                        options={entities.map((en) => ({ value: en.uid, label: en.label }))}
                                        showClear={false}
                                    />
                                </div>
                                <div className="col-md-4 d-flex align-items-end gap-3">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="wf-active" checked={form.is_active}
                                            onChange={(e) => setField("is_active", e.target.checked)} />
                                        <label className="form-check-label" htmlFor="wf-active">Active</label>
                                    </div>
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="wf-default" checked={form.is_default}
                                            onChange={(e) => setField("is_default", e.target.checked)} />
                                        <label className="form-check-label" htmlFor="wf-default">Default</label>
                                    </div>
                                </div>
                                <div className="col-12">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-control" rows={2} value={form.description}
                                        onChange={(e) => setField("description", e.target.value)} />
                                </div>
                            </div>

                            {/* VIEW SWITCH */}
                            <ul className="nav nav-tabs mt-3 mb-3">
                                <li className="nav-item">
                                    <button type="button" className={`nav-link ${view === "visual" ? "active" : ""}`} onClick={() => setView("visual")}>
                                        <i className="fa-solid fa-diagram-project me-1"></i> Visual
                                    </button>
                                </li>
                                <li className="nav-item">
                                    <button type="button" className={`nav-link ${view === "table" ? "active" : ""}`} onClick={() => setView("table")}>
                                        <i className="fa-solid fa-table-list me-1"></i> Table
                                    </button>
                                </li>
                            </ul>

                            {view === "visual" && (
                                <WorkflowCanvas
                                    key={`${editing}:${importNonce}`}
                                    stages={form.stages}
                                    transitions={form.transitions}
                                    statuses={statuses}
                                    colors={COLORS}
                                    onChange={(stages, transitions) => setForm((f) => ({ ...f, stages, transitions }))}
                                />
                            )}

                            {view === "table" && (
                            <>
                            {/* STAGES */}
                            <h5 className="mt-3">Stages</h5>
                            <div className="table-responsive">
                                <table className="table table-sm align-middle">
                                    <thead>
                                        <tr><th>Key *</th><th>Name</th><th>Local Name</th><th>Maps to Status *</th><th>Seq</th><th>Color</th><th>Initial</th><th>Terminal</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {form.stages.map((s, i) => (
                                            <tr key={i}>
                                                <td><input className="form-control form-control-sm" value={s.key} onChange={(e) => setStage(i, "key", e.target.value)} /></td>
                                                <td><input className="form-control form-control-sm" value={s.name || ""} onChange={(e) => setStage(i, "name", e.target.value)} /></td>
                                                <td><input className="form-control form-control-sm" value={s.local_name || ""} onChange={(e) => setStage(i, "local_name", e.target.value)} /></td>
                                                <td>
                                                    <select className="form-select form-select-sm" value={s.maps_to_status} onChange={(e) => setStage(i, "maps_to_status", e.target.value)}>
                                                        <option value="">— status —</option>
                                                        {statuses.map((st) => <option key={st} value={st}>{st}</option>)}
                                                    </select>
                                                </td>
                                                <td style={{ width: 70 }}><input type="number" className="form-control form-control-sm" value={s.sequence} onChange={(e) => setStage(i, "sequence", e.target.value)} /></td>
                                                <td>
                                                    <select className={`form-select form-select-sm text-${s.color === "light" ? "dark" : s.color}`} value={s.color || "secondary"} onChange={(e) => setStage(i, "color", e.target.value)}>
                                                        {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </td>
                                                <td className="text-center"><input type="checkbox" className="form-check-input" checked={!!s.is_initial} onChange={(e) => setStage(i, "is_initial", e.target.checked)} /></td>
                                                <td className="text-center"><input type="checkbox" className="form-check-input" checked={!!s.is_terminal} onChange={(e) => setStage(i, "is_terminal", e.target.checked)} /></td>
                                                <td>
                                                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setForm((f) => ({ ...f, stages: f.stages.filter((_, j) => j !== i) }))}>
                                                        <i className="fa-solid fa-xmark"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button type="button" className="btn btn-sm btn-outline-secondary mb-3"
                                onClick={() => setForm((f) => ({ ...f, stages: [...f.stages, { ...EMPTY_STAGE, sequence: (f.stages.length + 1) * 10 }] }))}>
                                ＋ Add Stage
                            </button>

                            {/* TRANSITIONS */}
                            <h5 className="mt-2">Transitions</h5>
                            <div className="table-responsive">
                                <table className="table table-sm align-middle">
                                    <thead>
                                        <tr><th>From *</th><th>To *</th><th>Button Label</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {form.transitions.map((t, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <select className="form-select form-select-sm" value={t.from_key} onChange={(e) => setTransition(i, "from_key", e.target.value)}>
                                                        <option value="">— stage —</option>
                                                        {stageKeyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                </td>
                                                <td>
                                                    <select className="form-select form-select-sm" value={t.to_key} onChange={(e) => setTransition(i, "to_key", e.target.value)}>
                                                        <option value="">— stage —</option>
                                                        {stageKeyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                </td>
                                                <td><input className="form-control form-control-sm" value={t.label || ""} placeholder="defaults to stage name" onChange={(e) => setTransition(i, "label", e.target.value)} /></td>
                                                <td>
                                                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setForm((f) => ({ ...f, transitions: f.transitions.filter((_, j) => j !== i) }))}>
                                                        <i className="fa-solid fa-xmark"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button type="button" className="btn btn-sm btn-outline-secondary mb-3"
                                onClick={() => setForm((f) => ({ ...f, transitions: [...f.transitions, { ...EMPTY_TRANSITION }] }))}>
                                ＋ Add Transition
                            </button>
                            </>
                            )}

                            <div className="d-flex gap-2 mt-2">
                                <button type="submit" className="btn btn-primary" disabled={busy}>
                                    {busy ? "Saving..." : editing === "new" ? "Create Workflow" : "Save Changes"}
                                </button>
                                <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setEditing(null)}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
}
