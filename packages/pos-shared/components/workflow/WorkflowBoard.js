import { useMemo, useState } from "react";
import Link from "next/link";

const COLOR_HEX = {
    secondary: "#6c757d",
    info: "#0dcaf0",
    primary: "#0d6efd",
    warning: "#ffc107",
    success: "#198754",
    danger: "#dc3545",
    dark: "#212529",
    light: "#adb5bd",
};
const hexFor = (c) => COLOR_HEX[c] || COLOR_HEX.secondary;

const DAY_MS = 24 * 60 * 60 * 1000;

function dueInfo(dueRaw) {
    if (!dueRaw) return null;
    const due = new Date(dueRaw);
    if (Number.isNaN(due.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((due - today) / DAY_MS);
    return {
        date: due,
        days,
        label: due.toLocaleDateString(),
        variant: days < 0 ? "danger" : days <= 3 ? "warning" : "light",
    };
}

/**
 * Kanban / sprint board over a definable workflow. One column per stage,
 * cards are entity records. Cards move via drag-and-drop or the per-card
 * "Move" menu — both only offer transitions the workflow allows, and the
 * server state machine still validates every move. Each card links to the
 * record's detail form.
 *
 * Props:
 *  - workflow      api::workflow.workflow (stages + transitions)
 *  - items         entity records
 *  - card          { title(r), meta?(r) → node, href(r), due?(r) → date-ish }
 *  - stageOf       (r) => stage key            (default r.stage_key)
 *  - statusOf      (r) => canonical status     (fallback stage resolution)
 *  - onTransition  async (record, toKey) — omit for a read-only board
 *  - busy          external busy flag
 */
export default function WorkflowBoard({
    workflow,
    items = [],
    card,
    stageOf = (r) => r.stage_key,
    statusOf = (r) => r.status,
    onTransition,
    busy = false,
}) {
    const [fullscreen, setFullscreen] = useState(false);
    const [sprint, setSprint] = useState("all"); // all | week | overdue
    const [dragging, setDragging] = useState(null); // { id, fromKey }
    const [menuFor, setMenuFor] = useState(null); // record id with open move-menu
    const [movingId, setMovingId] = useState(null);

    const stages = useMemo(
        () => [...(workflow?.stages || [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
        [workflow],
    );
    const stageByKey = useMemo(() => Object.fromEntries(stages.map((s) => [s.key, s])), [stages]);

    const resolveStage = (r) =>
        stageByKey[stageOf(r)] || stages.find((s) => s.maps_to_status === statusOf(r)) || null;

    const allowedFrom = (fromKey) =>
        (workflow?.transitions || [])
            .filter((t) => t.from_key === fromKey && stageByKey[t.to_key])
            .map((t) => ({ ...t, stage: stageByKey[t.to_key] }));

    const canMove = (r, toKey) => {
        const from = resolveStage(r);
        return !!from && allowedFrom(from.key).some((t) => t.to_key === toKey);
    };

    // sprint filter
    const visible = items.filter((r) => {
        if (sprint === "all") return true;
        const info = dueInfo(card?.due?.(r));
        if (!info) return false;
        if (sprint === "overdue") return info.days < 0;
        return info.days >= 0 && info.days <= 7; // due this week
    });

    const columns = stages.map((s) => ({
        stage: s,
        cards: visible.filter((r) => resolveStage(r)?.key === s.key),
    }));
    const unmapped = visible.filter((r) => !resolveStage(r));

    async function move(r, toKey) {
        if (!onTransition) return;
        setMenuFor(null);
        setMovingId(r.documentId || r.id);
        try {
            await onTransition(r, toKey);
        } finally {
            setMovingId(null);
        }
    }

    const wrapperStyle = fullscreen
        ? { position: "fixed", inset: 0, zIndex: 1060, background: "#f8f9fa", padding: 12, display: "flex", flexDirection: "column" }
        : {};

    const renderCard = (r) => {
        const id = r.documentId || r.id;
        const from = resolveStage(r);
        const moves = from ? allowedFrom(from.key) : [];
        const info = dueInfo(card?.due?.(r));
        const isMoving = movingId === id;
        return (
            <div
                key={id}
                draggable={!!onTransition && !busy && !isMoving}
                onDragStart={() => setDragging({ id, record: r })}
                onDragEnd={() => setDragging(null)}
                className="card mb-2 shadow-sm"
                style={{ cursor: onTransition ? "grab" : "default", opacity: isMoving ? 0.5 : 1, fontSize: 13 }}
            >
                <div className="card-body p-2">
                    <div className="d-flex justify-content-between align-items-start gap-1">
                        <Link href={card.href(r)} className="fw-semibold text-decoration-none" style={{ minWidth: 0 }}>
                            {card.title(r)}
                        </Link>
                        {onTransition && moves.length > 0 && (
                            <div style={{ position: "relative" }}>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary py-0 px-1"
                                    disabled={busy || isMoving}
                                    title="Move to…"
                                    onClick={() => setMenuFor(menuFor === id ? null : id)}
                                >
                                    {isMoving
                                        ? <span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12 }}></span>
                                        : <i className="fa-solid fa-arrow-right-arrow-left small"></i>}
                                </button>
                                {menuFor === id && (
                                    <div
                                        className="card shadow"
                                        style={{ position: "absolute", right: 0, top: "100%", zIndex: 30, minWidth: 170 }}
                                    >
                                        <div className="list-group list-group-flush">
                                            {moves.map((t) => (
                                                <button
                                                    key={t.to_key}
                                                    type="button"
                                                    className="list-group-item list-group-item-action py-1 px-2 d-flex align-items-center gap-2"
                                                    style={{ fontSize: 13 }}
                                                    onClick={() => move(r, t.to_key)}
                                                >
                                                    <span style={{ width: 10, height: 10, borderRadius: 5, background: hexFor(t.stage.color), flex: "0 0 auto" }}></span>
                                                    {t.label || t.stage.name || t.to_key}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {card.meta && <div className="text-muted mt-1">{card.meta(r)}</div>}
                    {info && (
                        <span className={`badge mt-1 bg-${info.variant} ${info.variant === "light" ? "text-dark border" : info.variant === "warning" ? "text-dark" : ""}`}>
                            <i className="fa-regular fa-clock me-1"></i>
                            {info.days < 0 ? `${-info.days}d overdue` : info.days === 0 ? "due today" : info.label}
                        </span>
                    )}
                </div>
            </div>
        );
    };

    const renderColumn = (stage, cards, droppable) => {
        const hex = hexFor(stage?.color);
        const validTarget = droppable && dragging && canMove(dragging.record, stage.key) && resolveStage(dragging.record)?.key !== stage.key;
        return (
            <div
                key={stage?.key || "__unmapped"}
                style={{ flex: "0 0 270px", maxWidth: 270, display: "flex", flexDirection: "column", minHeight: 0 }}
                onDragOver={(e) => { if (validTarget) e.preventDefault(); }}
                onDrop={() => { if (validTarget) move(dragging.record, stage.key); }}
            >
                <div
                    className="rounded-top px-2 py-1 d-flex justify-content-between align-items-center"
                    style={{
                        background: hex,
                        color: ["light", "warning", "info"].includes(stage?.color) ? "#212529" : "#fff",
                        fontWeight: 600,
                        fontSize: 13,
                    }}
                >
                    <span>
                        {stage ? (stage.name || stage.key) : "Unmapped"}
                        {stage?.local_name ? <span className="ms-1 fw-normal">· {stage.local_name}</span> : null}
                    </span>
                    <span className="badge bg-light text-dark">{cards.length}</span>
                </div>
                <div
                    className="border border-top-0 rounded-bottom p-2"
                    style={{
                        background: validTarget ? `${hex}22` : "#f1f3f5",
                        outline: validTarget ? `2px dashed ${hex}` : "none",
                        flex: "1 1 auto",
                        minHeight: 120,
                        overflowY: "auto",
                    }}
                >
                    {cards.length === 0 && <div className="text-muted small text-center py-3">—</div>}
                    {cards.map(renderCard)}
                </div>
            </div>
        );
    };

    if (!workflow || !stages.length) {
        return <div className="alert alert-info">No workflow defined for this entity — the board needs one.</div>;
    }

    return (
        <div style={wrapperStyle} onClick={() => menuFor && setMenuFor(null)}>
            <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <div className="btn-group btn-group-sm" role="group">
                    {[
                        { key: "all", label: "All" },
                        { key: "week", label: "Sprint · due 7 days" },
                        { key: "overdue", label: "Overdue" },
                    ].map((o) => (
                        <button
                            key={o.key}
                            type="button"
                            className={`btn ${sprint === o.key ? "btn-primary" : "btn-outline-primary"}`}
                            onClick={() => setSprint(o.key)}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
                <div className="d-flex align-items-center gap-2">
                    <span className="text-muted small">{visible.length} of {items.length} shown</span>
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        title={fullscreen ? "Exit full screen" : "Full screen"}
                        onClick={() => setFullscreen((f) => !f)}
                    >
                        <i className={`fa-solid ${fullscreen ? "fa-compress" : "fa-expand"}`}></i>
                    </button>
                </div>
            </div>
            <div
                className="d-flex gap-2 align-items-stretch"
                style={{
                    overflowX: "auto",
                    flex: fullscreen ? "1 1 auto" : undefined,
                    minHeight: fullscreen ? 0 : 420,
                    paddingBottom: 8,
                }}
            >
                {columns.map(({ stage, cards }) => renderColumn(stage, cards, !!onTransition))}
                {unmapped.length > 0 && renderColumn({ key: "__unmapped", name: "Unmapped", color: "light" }, unmapped, false)}
            </div>
        </div>
    );
}
