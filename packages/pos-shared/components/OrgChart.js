import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { HrEmployeesEndpoints } from "@rutba/api-provider/endpoints";

/**
 * Org chart, in two views over one node shape.
 *
 *   reporting → who reports to whom (this is what grants approval authority)
 *   team      → team structure, with members as leaves
 *
 * The server decides the scope and which edge it walked; this component only
 * renders. A node the server truncated comes back with `has_more`, which is
 * surfaced as an explicit "…more" marker rather than being silently dropped —
 * a chart that quietly hides people is worse than one that admits it.
 *
 * DRAGGING. With `editable` (and an HR-scoped response, which is what sets
 * `data.editable`), a person can be dragged onto their new manager. That is an
 * authorization change, not a layout change, so the drop does NOT write: it
 * asks the server for a dry run and shows who gains and who loses the ability
 * to approve for the dragged subtree, by name, before anything is saved.
 */

function Node({ node, depth, expanded, onToggle, highlight, drag }) {
    const kids = node.children || [];
    const hasKids = kids.length > 0;
    const isOpen = expanded[node.documentId] !== false; // default open
    const isMatch = highlight && node.name
        && node.name.toLowerCase().includes(highlight.toLowerCase());

    const draggable = Boolean(drag) && !node.is_team;
    const isDragging = drag?.draggingId === node.documentId;
    const isDropTarget = drag?.overId === node.documentId && drag?.draggingId !== node.documentId;

    const rowClass = [
        "d-flex align-items-center gap-2 py-1",
        isMatch ? "bg-warning-subtle rounded px-1" : "",
        isDragging ? "opacity-50" : "",
        isDropTarget ? "bg-primary-subtle rounded px-1" : "",
    ].filter(Boolean).join(" ");

    return (
        <li className="org-node">
            <div
                className={rowClass}
                style={{ paddingLeft: depth * 4, cursor: draggable ? "grab" : undefined }}
                draggable={draggable}
                onDragStart={draggable ? (e) => {
                    e.stopPropagation();
                    // Firefox will not start a drag without payload on the event.
                    e.dataTransfer.setData("text/plain", node.documentId);
                    e.dataTransfer.effectAllowed = "move";
                    drag.onDragStart(node);
                } : undefined}
                onDragEnd={draggable ? () => drag.onDragEnd() : undefined}
                onDragOver={draggable ? (e) => {
                    if (!drag.draggingId || drag.draggingId === node.documentId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    drag.onDragOver(node);
                } : undefined}
                onDrop={draggable ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    drag.onDrop(node);
                } : undefined}
            >
                {hasKids ? (
                    <button
                        type="button"
                        className="btn btn-sm btn-link p-0 text-decoration-none"
                        style={{ width: 18 }}
                        onClick={() => onToggle(node.documentId)}
                        aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                        <i className={`fa-solid fa-caret-${isOpen ? "down" : "right"}`}></i>
                    </button>
                ) : (
                    <span style={{ width: 18 }}></span>
                )}

                <i className={`fa-solid ${node.is_team ? "fa-people-group text-info" : "fa-user text-secondary"}`}></i>

                <span className="fw-semibold">{node.name}</span>

                {node.designation && <span className="badge bg-light text-dark border">{node.designation}</span>}
                {node.department && <span className="small text-muted">{node.department}</span>}
                {node.is_org_root && (
                    <span className="badge bg-secondary-subtle text-secondary-emphasis border" title="Top of the organisation — excluded from the reporting-line gap report">
                        org root
                    </span>
                )}
                {node.is_team && node.manager && (
                    <span className="small text-muted">managed by {node.manager.name}</span>
                )}

                {/* Secondary (matrix) managers hang off the node rather than
                    duplicating the person under a second parent. The two kinds
                    are labelled differently because only one of them can
                    approve anything. */}
                {(node.secondary_managers || []).map((m) => (
                    <span
                        key={m.documentId}
                        className={`badge border ${m.grants_authority
                            ? "bg-info-subtle text-info-emphasis"
                            : "bg-light text-muted"}`}
                        title={m.grants_authority
                            ? `${m.name} also has approval authority over ${node.name} (${m.kind.toLowerCase()} line)`
                            : `${m.name} is a ${m.kind.toLowerCase()}-line manager for ${node.name}, with no approval rights`}
                    >
                        <i className="fa-solid fa-link-slash me-1"></i>
                        {m.name}
                        {!m.grants_authority && " (advisory)"}
                    </span>
                ))}

                {node.has_more && (
                    <span className="small text-muted fst-italic" title="Increase depth to load more">
                        …more below
                    </span>
                )}
            </div>

            {hasKids && isOpen && (
                <ul className="list-unstyled mb-0">
                    {kids.map((c) => (
                        <Node
                            key={`${c.documentId}-${c.is_team ? "t" : "e"}`}
                            node={c}
                            depth={depth + 1}
                            expanded={expanded}
                            onToggle={onToggle}
                            highlight={highlight}
                            drag={drag}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

/**
 * The confirmation. Its whole job is to say, in words rather than a generic
 * "are you sure?", what moving this person does to who can approve for whom.
 */
function ReparentConfirm({ pending, impact, error, saving, onCancel, onConfirm }) {
    if (!pending) return null;
    const i = impact || {};

    return (
        <>
            <div className="modal d-block" tabIndex="-1" role="dialog">
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">Change reporting line?</h5>
                            <button type="button" className="btn-close" onClick={onCancel} aria-label="Cancel"></button>
                        </div>

                        <div className="modal-body">
                            {error && <div className="alert alert-danger">{error}</div>}

                            {!error && !impact && <p>Working out what this changes…</p>}

                            {!error && impact && (
                                <>
                                    <p className="mb-3">
                                        <strong>{i.employee}</strong> will report to{" "}
                                        <strong>{i.to_manager || "nobody"}</strong>
                                        {i.from_manager ? <> instead of <strong>{i.from_manager}</strong></> : null}.
                                    </p>

                                    <div className="alert alert-warning">
                                        This changes who can approve for them. A manager on the reporting
                                        line can approve leave, expense claims, advances and loans, see
                                        payslips, and write appraisals.
                                    </div>

                                    {i.moves_with_them > 1 && (
                                        <p className="mb-2">
                                            <i className="fa-solid fa-users me-1 text-muted"></i>
                                            <strong>{i.moves_with_them} people</strong> move with them —
                                            everyone reporting up through {i.employee}:{" "}
                                            <span className="text-muted">{(i.moves_with_them_names || []).join(", ")}</span>
                                        </p>
                                    )}

                                    {i.gains_authority?.length > 0 && (
                                        <p className="mb-2">
                                            <i className="fa-solid fa-arrow-up text-success me-1"></i>
                                            <strong>Gains approval authority:</strong>{" "}
                                            {i.gains_authority.join(", ")}
                                        </p>
                                    )}

                                    {i.loses_authority?.length > 0 && (
                                        <p className="mb-2">
                                            <i className="fa-solid fa-arrow-down text-danger me-1"></i>
                                            <strong>Loses approval authority:</strong>{" "}
                                            {i.loses_authority.join(", ")}
                                        </p>
                                    )}

                                    {!i.gains_authority?.length && !i.loses_authority?.length && (
                                        <p className="mb-2 text-muted">
                                            No one gains or loses approval authority — both managers report
                                            up through the same people.
                                        </p>
                                    )}

                                    {i.via_secondary_lines?.length > 0 && (
                                        <p className="mb-2 small text-muted">
                                            Dotted-line managers on these chains also reach them:{" "}
                                            {i.via_secondary_lines.join(", ")}
                                        </p>
                                    )}

                                    {i.detaches_from_org && (
                                        <div className="alert alert-danger mb-0">
                                            {i.employee} will have no manager at all. Until someone is set,
                                            nobody but HR can approve for them — they will appear in the
                                            reporting-line gap report.
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={saving}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={onConfirm}
                                disabled={saving || !impact || Boolean(error)}
                            >
                                {saving ? "Saving…" : "Change reporting line"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="modal-backdrop show"></div>
        </>
    );
}

export default function OrgChart({ defaultView = "reporting", showViewToggle = true, editable = false }) {
    const { jwt } = useAuth();
    const [view, setView] = useState(defaultView);
    const [depth, setDepth] = useState(4);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState({});
    const [search, setSearch] = useState("");

    const [draggingId, setDraggingId] = useState(null);
    const [overId, setOverId] = useState(null);
    const [pending, setPending] = useState(null);      // {employee, manager}
    const [impact, setImpact] = useState(null);
    const [dropError, setDropError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [flash, setFlash] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await HrEmployeesEndpoints.getOrgChart({ view, depth });
            setData(res?.data || null);
            setError(null);
        } catch (err) {
            console.error("Failed to load org chart", err);
            setError("Could not load the org chart.");
        } finally {
            setLoading(false);
        }
    }, [view, depth]);

    useEffect(() => { if (jwt) load(); }, [jwt, load]);

    const onToggle = (id) => setExpanded((p) => ({ ...p, [id]: p[id] === false ? true : false }));

    // Only the reporting view is editable: dragging in the team view would have
    // to mean "change team membership", which is a different write with
    // different consequences, and one control doing both is a trap.
    const canEdit = editable && view === "reporting" && data?.editable === true;

    const requestReparent = useCallback(async (employee, manager) => {
        setPending({ employee, manager });
        setImpact(null);
        setDropError(null);
        try {
            const res = await HrEmployeesEndpoints.setReportingLine(
                employee.documentId, manager.documentId, true,
            );
            setImpact(res?.data?.impact || null);
        } catch (err) {
            console.error("Reporting-line dry run failed", err);
            setDropError(err?.response?.data?.error?.message || "Could not work out what this change would do.");
        }
    }, []);

    const confirmReparent = useCallback(async () => {
        if (!pending) return;
        setSaving(true);
        try {
            await HrEmployeesEndpoints.setReportingLine(
                pending.employee.documentId, pending.manager.documentId, false,
            );
            setFlash(`${pending.employee.name} now reports to ${pending.manager.name}.`);
            setPending(null);
            setImpact(null);
            await load();
        } catch (err) {
            console.error("Reporting-line change failed", err);
            setDropError(err?.response?.data?.error?.message || "Could not save the change.");
        } finally {
            setSaving(false);
        }
    }, [pending, load]);

    const drag = canEdit ? {
        draggingId,
        overId,
        onDragStart: (node) => { setDraggingId(node.documentId); setFlash(null); },
        onDragEnd: () => { setDraggingId(null); setOverId(null); },
        onDragOver: (node) => setOverId(node.documentId),
        onDrop: (node) => {
            const dragged = draggingId;
            setDraggingId(null);
            setOverId(null);
            if (!dragged || dragged === node.documentId) return;
            const employee = findNode(data?.tree || [], dragged);
            if (employee) requestReparent(employee, node);
        },
    } : null;

    const tree = data?.tree || [];
    const chain = data?.chain_upward || [];

    return (
        <div>
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                {showViewToggle && (
                    <div className="btn-group btn-group-sm" role="group">
                        <button
                            type="button"
                            className={`btn btn-outline-primary ${view === "reporting" ? "active" : ""}`}
                            onClick={() => setView("reporting")}
                        >
                            <i className="fa-solid fa-sitemap me-1"></i>Reporting line
                        </button>
                        <button
                            type="button"
                            className={`btn btn-outline-primary ${view === "team" ? "active" : ""}`}
                            onClick={() => setView("team")}
                        >
                            <i className="fa-solid fa-people-group me-1"></i>Team structure
                        </button>
                    </div>
                )}

                <div className="d-flex align-items-center gap-1">
                    <label className="small text-muted mb-0">Depth</label>
                    <select
                        className="form-select form-select-sm"
                        style={{ width: 72 }}
                        value={depth}
                        onChange={(e) => setDepth(Number(e.target.value))}
                    >
                        {[2, 3, 4, 6, 8, 10].map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>

                <input
                    className="form-control form-control-sm"
                    style={{ maxWidth: 220 }}
                    placeholder="Find a person…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                {data?.scope && (
                    <span className="badge bg-light text-dark border ms-auto">
                        {data.scope === "hr" ? "Whole organisation" : "Your position"}
                    </span>
                )}
            </div>

            {view === "reporting" && (
                <p className="small text-muted">
                    The reporting line is what grants approval authority — a manager here can approve
                    their reports&apos; time off and write their appraisals.
                    {canEdit && " Drag someone onto their new manager to move them; you will see what it changes before it saves."}
                </p>
            )}

            {flash && (
                <div className="alert alert-success alert-dismissible">
                    {flash}
                    <button type="button" className="btn-close" onClick={() => setFlash(null)}></button>
                </div>
            )}

            {loading && <p>Loading…</p>}
            {error && <div className="alert alert-warning">{error}</div>}

            {!loading && !error && chain.length > 0 && (
                <div className="mb-3 small">
                    <span className="text-muted me-2">You report up through:</span>
                    {chain.map((c, i) => (
                        <span key={c.documentId}>
                            {i > 0 && <i className="fa-solid fa-angle-right mx-1 text-muted"></i>}
                            {c.name}
                        </span>
                    ))}
                </div>
            )}

            {!loading && !error && tree.length === 0 && (
                <div className="alert alert-info">
                    Nothing to show yet.
                    {view === "reporting" && " Set who each employee reports to to build the chart."}
                </div>
            )}

            {!loading && !error && tree.length > 0 && (
                <ul className="list-unstyled mb-0">
                    {tree.map((n) => (
                        <Node
                            key={`${n.documentId}-${n.is_team ? "t" : "e"}`}
                            node={n}
                            depth={0}
                            expanded={expanded}
                            onToggle={onToggle}
                            highlight={search.trim() || null}
                            drag={drag}
                        />
                    ))}
                </ul>
            )}

            <ReparentConfirm
                pending={pending}
                impact={impact}
                error={dropError}
                saving={saving}
                onCancel={() => { setPending(null); setImpact(null); setDropError(null); }}
                onConfirm={confirmReparent}
            />
        </div>
    );
}

/** Depth-first lookup in the rendered tree (the dragged node is always in it). */
function findNode(nodes, documentId) {
    for (const n of nodes) {
        if (n.documentId === documentId) return n;
        const hit = findNode(n.children || [], documentId);
        if (hit) return hit;
    }
    return null;
}
