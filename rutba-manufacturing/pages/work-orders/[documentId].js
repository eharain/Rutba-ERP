import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import SearchableSelect from "@rutba/pos-shared/components/SearchableSelect";
import WorkflowViewer from "@rutba/pos-shared/components/workflow/WorkflowViewer";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    MfgWorkOrdersEndpoints,
    MfgBundlesEndpoints,
    MfgTasksEndpoints,
    MfgMaterialLotsEndpoints,
    MfgMaterialIssuesEndpoints,
    MfgQcInspectionsEndpoints,
    MfgOperationsEndpoints,
    MfgWorkerProfilesEndpoints,
    WorkflowsEndpoints,
} from "@rutba/api-provider/endpoints";

const WO_ENTITY_UID = "api::mfg-work-order.mfg-work-order";

// ---------- badge color helpers ----------
function woStatusColor(status) {
    switch (status) {
        case "Released": return "info";
        case "InProgress": return "primary";
        case "OnHold": return "warning";
        case "Completed": return "success";
        case "Cancelled": return "danger";
        default: return "secondary";
    }
}
function bundleStatusColor(status) {
    switch (status) {
        case "Issued": return "info";
        case "InProgress": return "primary";
        case "QCHold": return "warning";
        case "Completed": return "success";
        default: return "secondary";
    }
}
function taskStatusColor(status) {
    switch (status) {
        case "InProgress": return "primary";
        case "Completed": return "success";
        case "Approved": return "success";
        case "Rejected": return "danger";
        default: return "secondary";
    }
}
function qcResultColor(result) {
    switch (result) {
        case "Pass": return "success";
        case "Fail": return "danger";
        case "PartialPass": return "warning";
        case "Rework": return "info";
        default: return "secondary";
    }
}

// allowed next statuses
const WO_TRANSITIONS = {
    Draft: ["Released", "Cancelled"],
    Released: ["InProgress", "OnHold", "Cancelled"],
    InProgress: ["Completed", "OnHold", "Cancelled"],
    OnHold: ["InProgress", "Cancelled"],
};
const BUNDLE_TRANSITIONS = {
    Created: ["Issued"],
    Issued: ["InProgress"],
    InProgress: ["Completed", "QCHold"],
    QCHold: ["Completed"],
};

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export default function WorkOrderDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();

    const [wo, setWo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // masters for selects
    const [workers, setWorkers] = useState([]);
    const [operations, setOperations] = useState([]);
    const [lots, setLots] = useState([]);
    // definable workflow for work orders (null → fall back to the built-in map)
    const [workflow, setWorkflow] = useState(null);

    // inline form state
    const [bundleForm, setBundleForm] = useState({ bundle_code: "", size: "", quantity: "" });
    const [taskForm, setTaskForm] = useState({ worker: "", operation: "", bundle: "", quantity_assigned: "" });
    const [issueForm, setIssueForm] = useState({ material_lot: "", quantity: "", issue_type: "Issue" });
    const [qcForm, setQcForm] = useState({ result: "Pass", quantity_inspected: "", quantity_failed: "", bundle: "" });
    const [busy, setBusy] = useState(false);

    async function reload() {
        if (!documentId) return;
        try {
            const res = await MfgWorkOrdersEndpoints.byId(documentId);
            setWo(res.data || null);
            setError("");
        } catch (err) {
            console.error("Failed to load work order", err);
            setError("Failed to load work order.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!router.isReady || !documentId || !jwt) return;
        setLoading(true);
        reload();
        (async () => {
            try {
                const res = await MfgWorkerProfilesEndpoints.list(1, 200);
                setWorkers(res.data || []);
            } catch (err) { console.error("Failed to load workers", err); }
            try {
                const res = await MfgOperationsEndpoints.list(1, 200);
                setOperations(res.data || []);
            } catch (err) { console.error("Failed to load operations", err); }
            try {
                const res = await MfgMaterialLotsEndpoints.list(1, 200);
                setLots(res.data || []);
            } catch (err) { console.error("Failed to load material lots", err); }
            try {
                const res = await WorkflowsEndpoints.list(1, 1, { entityUid: WO_ENTITY_UID });
                setWorkflow((res.data || [])[0] || null);
            } catch (err) { console.error("Failed to load workflow", err); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady, documentId, jwt]);

    const bundles = wo?.bundles || [];
    const tasks = wo?.tasks || [];
    const issues = wo?.material_issues || [];
    const inspections = wo?.qc_inspections || [];

    // options for the searchable selects
    const workerOptions = workers.map((w) => ({
        value: w.documentId,
        label: `${w.employee?.name || w.code || w.documentId}${w.code && w.employee?.name ? ` (${w.code})` : ""}${w.default_skill_grade ? ` · ${w.default_skill_grade}` : ""}`,
    }));
    const operationOptions = operations.map((o) => ({
        value: o.documentId,
        label: `${o.name || o.documentId}${o.local_name ? ` · ${o.local_name}` : ""}`,
    }));
    const bundleOptions = bundles.map((b) => ({
        value: b.documentId,
        label: `${b.bundle_code || b.documentId}${b.size ? ` · ${b.size}` : ""}${b.status ? ` (${b.status})` : ""}`,
    }));
    const lotOptions = lots.map((l) => ({
        value: l.documentId,
        label: `${l.lot_code || l.documentId} · ${l.product?.name || "?"} · rem ${l.quantity_remaining ?? 0} ${l.uom || ""}`,
    }));

    // ---------- definable workflow resolution ----------
    const wfStages = (workflow?.stages || [])
        .slice()
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const hasWorkflow = wfStages.length > 0;
    const currentStage = hasWorkflow
        ? (wfStages.find((s) => s.key === wo?.stage_key) ||
           wfStages.find((s) => s.maps_to_status === (wo?.status || "Draft")) ||
           null)
        : null;

    // ---------- WO transitions ----------
    async function woTransition(status) {
        setBusy(true);
        try {
            await MfgWorkOrdersEndpoints.processTransition(documentId, status);
            await reload();
        } catch (err) {
            console.error("Transition failed", err);
            alert("Transition failed.");
        } finally {
            setBusy(false);
        }
    }

    // ---------- bundles ----------
    async function addBundle(e) {
        e.preventDefault();
        if (!bundleForm.quantity || num(bundleForm.quantity) <= 0) { alert("Quantity is required."); return; }
        setBusy(true);
        try {
            await MfgBundlesEndpoints.create({
                bundle_code: bundleForm.bundle_code || undefined,
                size: bundleForm.size || undefined,
                quantity: num(bundleForm.quantity),
                work_order: documentId,
            });
            setBundleForm({ bundle_code: "", size: "", quantity: "" });
            await reload();
        } catch (err) {
            console.error("Add bundle failed", err);
            alert("Failed to add bundle.");
        } finally {
            setBusy(false);
        }
    }
    async function bundleTransition(bundle, status) {
        setBusy(true);
        try {
            let extra = {};
            if (status === "Completed") {
                const input = window.prompt("Quantity completed", String(bundle.quantity ?? ""));
                if (input === null) { setBusy(false); return; }
                extra = { quantity_completed: num(input) };
            }
            await MfgBundlesEndpoints.processTransition(bundle.documentId, status, extra);
            await reload();
        } catch (err) {
            console.error("Bundle transition failed", err);
            alert("Bundle transition failed.");
        } finally {
            setBusy(false);
        }
    }

    // ---------- tasks ----------
    async function addTask(e) {
        e.preventDefault();
        if (!taskForm.worker) { alert("Worker is required."); return; }
        if (!taskForm.operation) { alert("Operation is required."); return; }
        if (!taskForm.quantity_assigned || num(taskForm.quantity_assigned) <= 0) { alert("Quantity is required."); return; }
        setBusy(true);
        try {
            await MfgTasksEndpoints.create({
                work_order: documentId,
                worker: taskForm.worker,
                operation: taskForm.operation,
                bundle: taskForm.bundle || undefined,
                quantity_assigned: num(taskForm.quantity_assigned),
            });
            setTaskForm({ worker: "", operation: "", bundle: "", quantity_assigned: "" });
            await reload();
        } catch (err) {
            console.error("Add task failed", err);
            alert("Failed to assign task.");
        } finally {
            setBusy(false);
        }
    }
    async function taskAction(task, action) {
        setBusy(true);
        try {
            if (action === "start") {
                await MfgTasksEndpoints.processTransition(task.documentId, "InProgress");
            } else if (action === "complete") {
                const input = window.prompt("Quantity completed", String(task.quantity_assigned ?? ""));
                if (input === null) { setBusy(false); return; }
                await MfgTasksEndpoints.processTransition(task.documentId, "Completed", { quantity_completed: num(input) });
            } else if (action === "approve") {
                await MfgTasksEndpoints.approveTask(task.documentId);
            } else if (action === "reject") {
                await MfgTasksEndpoints.rejectTask(task.documentId);
            }
            await reload();
        } catch (err) {
            console.error("Task action failed", err);
            alert("Task action failed.");
        } finally {
            setBusy(false);
        }
    }

    // ---------- material issues ----------
    async function addIssue(e) {
        e.preventDefault();
        if (!issueForm.material_lot) { alert("Material lot is required."); return; }
        if (!issueForm.quantity || num(issueForm.quantity) <= 0) { alert("Quantity is required."); return; }
        setBusy(true);
        try {
            await MfgMaterialIssuesEndpoints.create({
                material_lot: issueForm.material_lot,
                work_order: documentId,
                quantity: num(issueForm.quantity),
                issue_type: issueForm.issue_type,
            });
            setIssueForm({ material_lot: "", quantity: "", issue_type: "Issue" });
            await reload();
        } catch (err) {
            console.error("Issue material failed", err);
            alert("Failed to issue material.");
        } finally {
            setBusy(false);
        }
    }

    // ---------- QC ----------
    async function addQc(e) {
        e.preventDefault();
        if (!qcForm.quantity_inspected || num(qcForm.quantity_inspected) <= 0) { alert("Quantity inspected is required."); return; }
        setBusy(true);
        try {
            await MfgQcInspectionsEndpoints.create({
                work_order: documentId,
                bundle: qcForm.bundle || undefined,
                result: qcForm.result,
                quantity_inspected: num(qcForm.quantity_inspected),
                quantity_failed: num(qcForm.quantity_failed),
            });
            setQcForm({ result: "Pass", quantity_inspected: "", quantity_failed: "", bundle: "" });
            await reload();
        } catch (err) {
            console.error("Add QC failed", err);
            alert("Failed to record QC inspection.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="mb-3">
                    <Link href="/work-orders">← Back to Work Orders</Link>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}
                {loading && <p>Loading work order...</p>}

                {!loading && !wo && !error && (
                    <div className="alert alert-info">Work order not found.</div>
                )}

                {!loading && wo && (
                    <>
                        {/* HEADER */}
                        <div className="card mb-4">
                            <div className="card-body">
                                <div className="d-flex justify-content-between align-items-start flex-wrap">
                                    <div>
                                        <h3 className="mb-1">
                                            {wo.wo_number || wo.documentId}{" "}
                                            {currentStage ? (
                                                <span className={`badge bg-${currentStage.color || woStatusColor(wo.status)}`}>
                                                    {currentStage.name || currentStage.key}
                                                    {currentStage.local_name ? ` · ${currentStage.local_name}` : ""}
                                                </span>
                                            ) : (
                                                <span className={`badge bg-${woStatusColor(wo.status)}`}>
                                                    {wo.status || "Draft"}
                                                </span>
                                            )}
                                            {currentStage && currentStage.name !== wo.status && (
                                                <span className="badge bg-light text-dark ms-1" title="Canonical status">
                                                    {wo.status || "Draft"}
                                                </span>
                                            )}
                                        </h3>
                                        <div className="text-muted">{wo.name}</div>
                                        <div className="text-muted">Product: {wo.product?.name || "—"}</div>
                                    </div>
                                    <div className="text-end">
                                        <div>Ordered: <strong>{wo.quantity_ordered ?? 0}</strong></div>
                                        <div>Completed: <strong>{wo.quantity_completed ?? 0}</strong></div>
                                        <div>Rejected: <strong>{wo.quantity_rejected ?? 0}</strong></div>
                                    </div>
                                </div>
                                <hr />
                                <div className="row text-center">
                                    <div className="col">
                                        <div className="text-muted small">Material Cost</div>
                                        <div>{num(wo.material_cost).toFixed(2)}</div>
                                    </div>
                                    <div className="col">
                                        <div className="text-muted small">Labor Cost</div>
                                        <div>{num(wo.labor_cost).toFixed(2)}</div>
                                    </div>
                                    <div className="col">
                                        <div className="text-muted small">Total Cost</div>
                                        <div>{num(wo.total_cost).toFixed(2)}</div>
                                    </div>
                                    <div className="col">
                                        <div className="text-muted small">Cost / Unit</div>
                                        <div>{num(wo.cost_per_unit).toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* TRANSITIONS — workflow-driven when one is defined, built-in map otherwise */}
                        {hasWorkflow ? (
                            <div className="card mb-4">
                                <div className="card-header d-flex justify-content-between align-items-center">
                                    <span>Workflow — {workflow.name}</span>
                                    <PermissionCheck showIf="admin">
                                        <Link href="/workflows" className="small">Edit workflows</Link>
                                    </PermissionCheck>
                                </div>
                                <div className="card-body">
                                    <WorkflowViewer
                                        workflow={workflow}
                                        currentKey={wo.stage_key}
                                        currentStatus={wo.status || "Draft"}
                                        onTransition={(toKey) => woTransition(toKey)}
                                        busy={busy}
                                        height={280}
                                    />
                                </div>
                            </div>
                        ) : (
                            (WO_TRANSITIONS[wo.status] || []).length > 0 && (
                                <div className="card mb-4">
                                    <div className="card-header">Status Transitions</div>
                                    <div className="card-body d-flex gap-2 flex-wrap">
                                        {(WO_TRANSITIONS[wo.status] || []).map((s) => (
                                            <button
                                                key={s}
                                                className={`btn btn-sm btn-${woStatusColor(s)}`}
                                                disabled={busy}
                                                onClick={() => woTransition(s)}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )
                        )}

                        {/* BUNDLES */}
                        <div className="card mb-4">
                            <div className="card-header">Bundles</div>
                            <div className="card-body">
                                <div className="table-responsive">
                                    <table className="table table-striped table-hover">
                                        <thead className="table-dark">
                                            <tr>
                                                <th>Code</th>
                                                <th>Size</th>
                                                <th>Qty</th>
                                                <th>Completed</th>
                                                <th>Status</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bundles.length === 0 && (
                                                <tr><td colSpan={6} className="text-muted">No bundles.</td></tr>
                                            )}
                                            {bundles.map((b) => (
                                                <tr key={b.documentId || b.id}>
                                                    <td>{b.bundle_code || "—"}</td>
                                                    <td>{b.size || "—"}</td>
                                                    <td>{b.quantity ?? 0}</td>
                                                    <td>{b.quantity_completed ?? 0}</td>
                                                    <td>
                                                        <span className={`badge bg-${bundleStatusColor(b.status)}`}>
                                                            {b.status || "Created"}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="d-flex gap-1 flex-wrap">
                                                            {(BUNDLE_TRANSITIONS[b.status] || []).map((s) => (
                                                                <button
                                                                    key={s}
                                                                    className="btn btn-sm btn-outline-primary"
                                                                    disabled={busy}
                                                                    onClick={() => bundleTransition(b, s)}
                                                                >
                                                                    {s}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <form className="row g-2 align-items-end" onSubmit={addBundle}>
                                    <div className="col-md-3">
                                        <label className="form-label">Bundle Code</label>
                                        <input className="form-control" value={bundleForm.bundle_code}
                                            onChange={(e) => setBundleForm((f) => ({ ...f, bundle_code: e.target.value }))} />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Size</label>
                                        <input className="form-control" value={bundleForm.size}
                                            onChange={(e) => setBundleForm((f) => ({ ...f, size: e.target.value }))} />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Quantity</label>
                                        <input type="number" className="form-control" value={bundleForm.quantity}
                                            onChange={(e) => setBundleForm((f) => ({ ...f, quantity: e.target.value }))} />
                                    </div>
                                    <div className="col-md-3">
                                        <button type="submit" className="btn btn-primary w-100" disabled={busy}>
                                            Add Bundle
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* TASKS */}
                        <div className="card mb-4">
                            <div className="card-header">Tasks</div>
                            <div className="card-body">
                                <div className="table-responsive">
                                    <table className="table table-striped table-hover">
                                        <thead className="table-dark">
                                            <tr>
                                                <th>Worker</th>
                                                <th>Operation</th>
                                                <th>Status</th>
                                                <th>Assigned</th>
                                                <th>Completed</th>
                                                <th>Rate</th>
                                                <th>Amount</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tasks.length === 0 && (
                                                <tr><td colSpan={8} className="text-muted">No tasks.</td></tr>
                                            )}
                                            {tasks.map((t) => (
                                                <tr key={t.documentId || t.id}>
                                                    <td>{t.worker?.employee?.name || t.worker?.code || "—"}</td>
                                                    <td>{t.operation?.name || "—"}</td>
                                                    <td>
                                                        <span className={`badge bg-${taskStatusColor(t.status)}`}>
                                                            {t.status || "Assigned"}
                                                        </span>
                                                    </td>
                                                    <td>{t.quantity_assigned ?? 0}</td>
                                                    <td>{t.quantity_completed ?? 0}</td>
                                                    <td>{t.piece_rate != null ? num(t.piece_rate).toFixed(2) : "—"}</td>
                                                    <td>{t.amount != null ? num(t.amount).toFixed(2) : "—"}</td>
                                                    <td>
                                                        <div className="d-flex gap-1 flex-wrap">
                                                            {t.status === "Assigned" && (
                                                                <button className="btn btn-sm btn-outline-primary" disabled={busy}
                                                                    onClick={() => taskAction(t, "start")}>Start</button>
                                                            )}
                                                            {t.status === "InProgress" && (
                                                                <button className="btn btn-sm btn-outline-success" disabled={busy}
                                                                    onClick={() => taskAction(t, "complete")}>Complete</button>
                                                            )}
                                                            {t.status === "Completed" && (
                                                                <>
                                                                    <button className="btn btn-sm btn-success" disabled={busy}
                                                                        onClick={() => taskAction(t, "approve")}>Approve</button>
                                                                    <button className="btn btn-sm btn-danger" disabled={busy}
                                                                        onClick={() => taskAction(t, "reject")}>Reject</button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <form className="row g-2 align-items-end" onSubmit={addTask}>
                                    <div className="col-md-3">
                                        <label className="form-label">Worker</label>
                                        <SearchableSelect
                                            value={taskForm.worker}
                                            onChange={(v) => setTaskForm((f) => ({ ...f, worker: v }))}
                                            options={workerOptions}
                                            placeholder="— Select worker —"
                                        />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Operation</label>
                                        <SearchableSelect
                                            value={taskForm.operation}
                                            onChange={(v) => setTaskForm((f) => ({ ...f, operation: v }))}
                                            options={operationOptions}
                                            placeholder="— Select operation —"
                                        />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Bundle (optional)</label>
                                        <SearchableSelect
                                            value={taskForm.bundle}
                                            onChange={(v) => setTaskForm((f) => ({ ...f, bundle: v }))}
                                            options={bundleOptions}
                                            placeholder="— None —"
                                        />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">Qty Assigned</label>
                                        <input type="number" className="form-control" value={taskForm.quantity_assigned}
                                            onChange={(e) => setTaskForm((f) => ({ ...f, quantity_assigned: e.target.value }))} />
                                    </div>
                                    <div className="col-md-1">
                                        <button type="submit" className="btn btn-primary w-100" disabled={busy}>Assign</button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* MATERIAL ISSUES */}
                        <div className="card mb-4">
                            <div className="card-header">Material Issues</div>
                            <div className="card-body">
                                <div className="table-responsive">
                                    <table className="table table-striped table-hover">
                                        <thead className="table-dark">
                                            <tr>
                                                <th>Material</th>
                                                <th>Type</th>
                                                <th>Quantity</th>
                                                <th>Total Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {issues.length === 0 && (
                                                <tr><td colSpan={4} className="text-muted">No material issues.</td></tr>
                                            )}
                                            {issues.map((m) => (
                                                <tr key={m.documentId || m.id}>
                                                    <td>{m.material_lot?.lot_code || m.material_lot?.product?.name || "—"}</td>
                                                    <td>{m.issue_type || "Issue"}</td>
                                                    <td>{m.quantity ?? 0}</td>
                                                    <td>{m.total_cost != null ? num(m.total_cost).toFixed(2) : "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <form className="row g-2 align-items-end" onSubmit={addIssue}>
                                    <div className="col-md-5">
                                        <label className="form-label">Material Lot</label>
                                        <SearchableSelect
                                            value={issueForm.material_lot}
                                            onChange={(v) => setIssueForm((f) => ({ ...f, material_lot: v }))}
                                            options={lotOptions}
                                            placeholder="— Select lot —"
                                        />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Quantity</label>
                                        <input type="number" className="form-control" value={issueForm.quantity}
                                            onChange={(e) => setIssueForm((f) => ({ ...f, quantity: e.target.value }))} />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">Type</label>
                                        <select className="form-select" value={issueForm.issue_type}
                                            onChange={(e) => setIssueForm((f) => ({ ...f, issue_type: e.target.value }))}>
                                            <option value="Issue">Issue</option>
                                            <option value="Return">Return</option>
                                            <option value="Wastage">Wastage</option>
                                        </select>
                                    </div>
                                    <div className="col-md-2">
                                        <button type="submit" className="btn btn-primary w-100" disabled={busy}>Issue</button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* QC */}
                        <div className="card mb-4">
                            <div className="card-header">QC Inspections</div>
                            <div className="card-body">
                                <div className="table-responsive">
                                    <table className="table table-striped table-hover">
                                        <thead className="table-dark">
                                            <tr>
                                                <th>Result</th>
                                                <th>Inspected</th>
                                                <th>Passed</th>
                                                <th>Failed</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inspections.length === 0 && (
                                                <tr><td colSpan={4} className="text-muted">No QC inspections.</td></tr>
                                            )}
                                            {inspections.map((q) => (
                                                <tr key={q.documentId || q.id}>
                                                    <td>
                                                        <span className={`badge bg-${qcResultColor(q.result)}`}>
                                                            {q.result || "—"}
                                                        </span>
                                                    </td>
                                                    <td>{q.quantity_inspected ?? 0}</td>
                                                    <td>{q.quantity_passed ?? 0}</td>
                                                    <td>{q.quantity_failed ?? 0}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <form className="row g-2 align-items-end" onSubmit={addQc}>
                                    <div className="col-md-3">
                                        <label className="form-label">Result</label>
                                        <select className="form-select" value={qcForm.result}
                                            onChange={(e) => setQcForm((f) => ({ ...f, result: e.target.value }))}>
                                            <option value="Pass">Pass</option>
                                            <option value="Fail">Fail</option>
                                            <option value="PartialPass">PartialPass</option>
                                            <option value="Rework">Rework</option>
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Qty Inspected</label>
                                        <input type="number" className="form-control" value={qcForm.quantity_inspected}
                                            onChange={(e) => setQcForm((f) => ({ ...f, quantity_inspected: e.target.value }))} />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">Qty Failed</label>
                                        <input type="number" className="form-control" value={qcForm.quantity_failed}
                                            onChange={(e) => setQcForm((f) => ({ ...f, quantity_failed: e.target.value }))} />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">Bundle (optional)</label>
                                        <SearchableSelect
                                            value={qcForm.bundle}
                                            onChange={(v) => setQcForm((f) => ({ ...f, bundle: v }))}
                                            options={bundleOptions}
                                            placeholder="— None —"
                                        />
                                    </div>
                                    <div className="col-md-2">
                                        <button type="submit" className="btn btn-primary w-100" disabled={busy}>Add QC</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
