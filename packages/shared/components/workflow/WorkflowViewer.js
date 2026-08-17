import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls, Handle, Position, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { hexFor } from "./colors";

function ViewNode({ data }) {
    const hex = hexFor(data.color);
    const isCurrent = data.isCurrent;
    return (
        <div
            style={{
                border: `2px solid ${hex}`,
                borderRadius: 8,
                background: isCurrent ? "#fffbe6" : "#fff",
                minWidth: 130,
                maxWidth: 200,
                boxShadow: isCurrent ? `0 0 0 4px ${hex}66, 0 2px 8px rgba(0,0,0,.2)` : "0 1px 3px rgba(0,0,0,.15)",
                overflow: "hidden",
                opacity: data.dimmed ? 0.55 : 1,
            }}
        >
            <Handle type="target" position={Position.Left} style={{ background: hex }} isConnectable={false} />
            <div
                style={{
                    background: hex,
                    color: ["light", "warning", "info"].includes(data.color) ? "#212529" : "#fff",
                    padding: "3px 8px",
                    fontWeight: 600,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                {isCurrent && <i className="fa-solid fa-location-dot" title="Current stage"></i>}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {data.name || data.key}
                </span>
            </div>
            <div style={{ padding: "4px 8px", fontSize: 11 }}>
                {data.local_name && <div className="text-muted">{data.local_name}</div>}
                <span className="badge bg-light text-dark border" style={{ fontWeight: 400 }}>
                    {data.maps_to_status}
                </span>
            </div>
            <Handle type="source" position={Position.Right} style={{ background: hex }} isConnectable={false} />
        </div>
    );
}
const nodeTypes = { viewStage: ViewNode };

/**
 * Read-only visual map of a definable workflow with the entity's current
 * stage highlighted, plus (optionally) the allowed transition buttons.
 *
 * Props:
 *  - workflow      api::workflow.workflow record (stages + transitions populated)
 *  - currentKey    the entity's stage_key (may be null)
 *  - currentStatus the entity's canonical status — fallback stage resolution
 *  - onTransition  (toKey) => void — when given, allowed moves render as buttons
 *  - busy          disables the buttons
 *  - height        canvas height (default 300)
 */
export default function WorkflowViewer({ workflow, currentKey, currentStatus, onTransition, busy = false, height = 300 }) {
    const [fullscreen, setFullscreen] = useState(false);

    const { nodes, edges, current, moves } = useMemo(() => {
        const stages = [...(workflow?.stages || [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
        const cur =
            stages.find((s) => s.key === currentKey) ||
            stages.find((s) => s.maps_to_status === currentStatus) ||
            null;

        const nodes = stages.map((s, rank) => ({
            id: s.key,
            type: "viewStage",
            position: s.pos_x != null && s.pos_y != null
                ? { x: Number(s.pos_x), y: Number(s.pos_y) }
                : { x: 40 + rank * 210, y: 60 + (rank % 2) * 90 },
            data: {
                key: s.key,
                name: s.name,
                local_name: s.local_name,
                maps_to_status: s.maps_to_status,
                color: s.color || "secondary",
                isCurrent: cur?.key === s.key,
                dimmed: !!cur && cur.key !== s.key && !!s.is_terminal,
            },
            draggable: false,
            connectable: false,
        }));

        const keySet = new Set(stages.map((s) => s.key));
        const edges = (workflow?.transitions || [])
            .filter((t) => keySet.has(t.from_key) && keySet.has(t.to_key))
            .map((t, i) => {
                const fromCurrent = cur && t.from_key === cur.key;
                return {
                    id: `e${i}`,
                    source: t.from_key,
                    target: t.to_key,
                    label: t.label || "",
                    animated: !!fromCurrent,
                    style: fromCurrent
                        ? { strokeWidth: 2.5, stroke: "#0d6efd" }
                        : { strokeWidth: 1.2, stroke: "#adb5bd" },
                    labelStyle: { fontSize: 10 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: fromCurrent ? "#0d6efd" : "#adb5bd" },
                };
            });

        const stageByKey = Object.fromEntries(stages.map((s) => [s.key, s]));
        const moves = cur
            ? (workflow?.transitions || [])
                .filter((t) => t.from_key === cur.key && stageByKey[t.to_key])
                .map((t) => ({ ...t, stage: stageByKey[t.to_key] }))
            : [];

        return { nodes, edges, current: cur, moves };
    }, [workflow, currentKey, currentStatus]);

    if (!workflow || !(workflow.stages || []).length) return null;

    const wrapperStyle = fullscreen
        ? { position: "fixed", inset: 0, zIndex: 1060, background: "#fff", padding: 12, display: "flex", flexDirection: "column" }
        : {};
    const canvasHeight = fullscreen ? "100%" : height;

    return (
        <div style={wrapperStyle}>
            {fullscreen && (
                <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong>
                        <i className="fa-solid fa-diagram-project me-2"></i>
                        {workflow.name}
                        {current && (
                            <span className={`badge ms-2 bg-${current.color || "primary"}`}>
                                {current.name || current.key}
                            </span>
                        )}
                    </strong>
                </div>
            )}
            <div style={{ position: "relative", flex: fullscreen ? "1 1 auto" : undefined, minHeight: 0 }}>
                <div style={{ height: canvasHeight, border: "1px solid #dee2e6", borderRadius: 6 }}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        fitView
                        nodesDraggable={false}
                        nodesConnectable={false}
                        elementsSelectable={false}
                        panOnDrag
                        zoomOnScroll
                        proOptions={{ hideAttribution: false }}
                    >
                        <Background gap={16} />
                        <Controls showInteractive={false} />
                    </ReactFlow>
                </div>
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    style={{ position: "absolute", top: 8, right: 8, zIndex: 10, background: "#fff" }}
                    title={fullscreen ? "Exit full screen" : "Full screen"}
                    onClick={() => setFullscreen((f) => !f)}
                >
                    <i className={`fa-solid ${fullscreen ? "fa-compress" : "fa-expand"}`}></i>
                </button>
            </div>
            {onTransition && (
                <div className="d-flex gap-2 flex-wrap align-items-center mt-2">
                    {moves.length === 0 && (
                        <span className="text-muted small">
                            {current ? "No further transitions from this stage." : "Current status is not mapped to any workflow stage."}
                        </span>
                    )}
                    {moves.map((t) => (
                        <button
                            key={`${t.from_key}-${t.to_key}`}
                            className={`btn btn-sm btn-${t.stage.color || "primary"}`}
                            disabled={busy}
                            onClick={() => onTransition(t.to_key)}
                        >
                            {t.label || t.stage.name || t.to_key}
                            <i className="fa-solid fa-arrow-right ms-1 small"></i>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
