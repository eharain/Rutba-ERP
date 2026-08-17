import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Handle,
    Position,
    MarkerType,
    addEdge,
    useNodesState,
    useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { COLOR_HEX, hexFor } from "./colors";

/**
 * Visual designer for a definable workflow. Stages render as draggable nodes;
 * transitions render as arrows between them. Node positions persist via the
 * stage's pos_x / pos_y fields. The component owns its React Flow state for the
 * lifetime of the mount and mirrors every change back to the parent form via
 * onChange(stages, transitions) — mount it with a `key` tied to the edited
 * workflow so it re-seeds when you switch records or tabs.
 *
 * Props:
 *  - stages       workflow.stage[]  (seed; read once on mount)
 *  - transitions  workflow.transition[] (seed; read once on mount)
 *  - statuses     string[]          canonical statuses for the maps_to_status select
 *  - colors       string[]          bootstrap contextual color names
 *  - onChange     (stages, transitions) => void
 */

let _seq = 0;
const genId = (p = "n") => `${p}${++_seq}`;

// ── custom node ────────────────────────────────────────────
function StageNode({ data, selected }) {
    const hex = hexFor(data.color);
    return (
        <div
            style={{
                border: `2px solid ${hex}`,
                borderRadius: 8,
                background: "#fff",
                minWidth: 150,
                maxWidth: 220,
                boxShadow: selected ? `0 0 0 3px ${hex}55` : "0 1px 3px rgba(0,0,0,.15)",
                overflow: "hidden",
            }}
        >
            <Handle type="target" position={Position.Left} style={{ background: hex }} />
            <div
                style={{
                    background: hex,
                    color: data.color === "light" || data.color === "warning" || data.color === "info" ? "#212529" : "#fff",
                    padding: "4px 8px",
                    fontWeight: 600,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                {data.is_initial && <span title="Initial stage">▶</span>}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {data.name || data.key || "Unnamed"}
                </span>
                {data.is_terminal && <span title="Terminal stage" style={{ marginLeft: "auto" }}>⛔</span>}
            </div>
            <div style={{ padding: "6px 8px", fontSize: 12 }}>
                {data.key ? (
                    <div className="text-muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{data.key}</div>
                ) : (
                    <div className="text-danger" style={{ fontSize: 11 }}>set a key →</div>
                )}
                <span className="badge bg-light text-dark border" style={{ fontWeight: 400 }}>
                    {data.maps_to_status || "no status"}
                </span>
            </div>
            <Handle type="source" position={Position.Right} style={{ background: hex }} />
        </div>
    );
}

const nodeTypes = { stage: StageNode };
const defaultEdgeOptions = { markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.5 } };

// ── seeding ────────────────────────────────────────────────
function buildInitial(stages, transitions) {
    const ordered = [...(stages || [])].map((s, i) => ({ s, i }));
    // stable rank for auto-layout of stages lacking saved positions
    const rankByIndex = {};
    [...ordered]
        .sort((a, b) => (Number(a.s.sequence) || 0) - (Number(b.s.sequence) || 0))
        .forEach((o, rank) => { rankByIndex[o.i] = rank; });

    const keyToId = {};
    const nodes = ordered.map(({ s, i }) => {
        const id = genId("s");
        if (s.key) keyToId[s.key] = id;
        const rank = rankByIndex[i];
        const hasPos = s.pos_x != null && s.pos_y != null;
        return {
            id,
            type: "stage",
            position: hasPos
                ? { x: Number(s.pos_x), y: Number(s.pos_y) }
                : { x: 60 + rank * 230, y: 80 + (rank % 2) * 70 },
            data: {
                key: s.key || "",
                name: s.name || "",
                local_name: s.local_name || "",
                maps_to_status: s.maps_to_status || "",
                sequence: s.sequence ?? (i + 1) * 10,
                color: s.color || "secondary",
                is_initial: !!s.is_initial,
                is_terminal: !!s.is_terminal,
            },
        };
    });

    const edges = (transitions || [])
        .map((t) => {
            const source = keyToId[t.from_key];
            const target = keyToId[t.to_key];
            if (!source || !target) return null;
            return {
                id: genId("e"),
                source,
                target,
                label: t.label || "",
                data: { approles: t.approles || "" },
            };
        })
        .filter(Boolean);

    return { nodes, edges };
}

export default function WorkflowCanvas({ stages, transitions, statuses = [], colors = [], onChange }) {
    // seed once per mount — parent remounts via `key` when the record changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initial = useMemo(() => buildInitial(stages, transitions), []);
    const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState(null);
    const [fullscreen, setFullscreen] = useState(false);

    // mirror canvas state back to the parent form on every change
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    useEffect(() => {
        const keyById = {};
        nodes.forEach((n) => { keyById[n.id] = n.data.key || ""; });
        const outStages = nodes.map((n) => ({
            key: n.data.key || "",
            name: n.data.name || "",
            local_name: n.data.local_name || "",
            maps_to_status: n.data.maps_to_status || "",
            sequence: Number(n.data.sequence) || 0,
            color: n.data.color || "secondary",
            is_initial: !!n.data.is_initial,
            is_terminal: !!n.data.is_terminal,
            pos_x: Math.round(n.position.x),
            pos_y: Math.round(n.position.y),
        }));
        const outTransitions = edges.map((e) => ({
            from_key: keyById[e.source] || "",
            to_key: keyById[e.target] || "",
            label: e.label || "",
            approles: e.data?.approles || "",
        }));
        onChangeRef.current?.(outStages, outTransitions);
    }, [nodes, edges]);

    const onConnect = useCallback((conn) => {
        if (conn.source === conn.target) return; // no self-loops
        setEdges((eds) => addEdge({ ...conn, id: genId("e"), label: "", data: { approles: "" } }, eds));
    }, [setEdges]);

    const updateNodeData = useCallback((id, patch) => {
        setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    }, [setNodes]);

    const updateEdge = useCallback((id, patch) => {
        setEdges((eds) => eds.map((e) => {
            if (e.id !== id) return e;
            const next = { ...e };
            if (patch.label !== undefined) next.label = patch.label;
            if (patch.approles !== undefined) next.data = { ...e.data, approles: patch.approles };
            return next;
        }));
    }, [setEdges]);

    const addStage = useCallback(() => {
        const id = genId("s");
        const maxX = nodes.reduce((m, n) => Math.max(m, n.position.x), 0);
        setNodes((nds) => [
            ...nds,
            {
                id,
                type: "stage",
                position: { x: nds.length ? maxX + 230 : 60, y: 90 },
                data: {
                    key: "", name: "", local_name: "", maps_to_status: "",
                    sequence: (nds.length + 1) * 10, color: "secondary",
                    is_initial: nds.length === 0, is_terminal: false,
                },
            },
        ]);
        setSelectedNodeId(id);
        setSelectedEdgeId(null);
    }, [nodes, setNodes]);

    const deleteSelectedNode = useCallback(() => {
        if (!selectedNodeId) return;
        setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
        setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
        setSelectedNodeId(null);
    }, [selectedNodeId, setNodes, setEdges]);

    const deleteSelectedEdge = useCallback(() => {
        if (!selectedEdgeId) return;
        setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
        setSelectedEdgeId(null);
    }, [selectedEdgeId, setEdges]);

    const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
    const selectedEdge = edges.find((e) => e.id === selectedEdgeId) || null;
    const nodeLabel = (id) => {
        const n = nodes.find((x) => x.id === id);
        return n ? (n.data.name || n.data.key || "Unnamed") : "?";
    };

    const wrapperStyle = fullscreen
        ? { position: "fixed", inset: 0, zIndex: 1060, background: "#fff", padding: 12 }
        : {};
    const canvasHeight = fullscreen ? "calc(100vh - 24px)" : 540;

    return (
        <div className="d-flex gap-2 flex-wrap align-items-stretch" style={wrapperStyle}>
            <div style={{ flex: "1 1 420px", minWidth: 0, height: canvasHeight, border: "1px solid #dee2e6", borderRadius: 6 }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    defaultEdgeOptions={defaultEdgeOptions}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={(_, n) => { setSelectedNodeId(n.id); setSelectedEdgeId(null); }}
                    onEdgeClick={(_, e) => { setSelectedEdgeId(e.id); setSelectedNodeId(null); }}
                    onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
                    fitView
                    proOptions={{ hideAttribution: false }}
                >
                    <Background gap={16} />
                    <Controls />
                    <MiniMap pannable zoomable nodeColor={(n) => hexFor(n.data?.color)} />
                </ReactFlow>
            </div>

            {/* side panel */}
            <div style={{ flex: "0 0 300px", maxWidth: 320 }}>
                <div className="card h-100">
                    <div className="card-header d-flex justify-content-between align-items-center py-2">
                        <span className="fw-semibold">
                            {selectedNode ? "Stage" : selectedEdge ? "Transition" : "Designer"}
                        </span>
                        <div className="d-flex gap-1">
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={addStage}>
                                ＋ Stage
                            </button>
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
                    <div className="card-body" style={{ fontSize: 14, overflowY: "auto", maxHeight: fullscreen ? "calc(100vh - 80px)" : 492 }}>
                        {!selectedNode && !selectedEdge && (
                            <p className="text-muted mb-0">
                                Click <strong>＋ Stage</strong> to add a step, drag the dot on a stage's right edge
                                to another stage to create a transition, and click any node or arrow to edit it here.
                                Drag stages to arrange them — positions are saved with the workflow.
                            </p>
                        )}

                        {selectedNode && (
                            <div className="d-flex flex-column gap-2">
                                <div>
                                    <label className="form-label mb-1">Key *</label>
                                    <input
                                        className="form-control form-control-sm"
                                        value={selectedNode.data.key}
                                        onChange={(e) => updateNodeData(selectedNode.id, { key: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="form-label mb-1">Name</label>
                                    <input
                                        className="form-control form-control-sm"
                                        value={selectedNode.data.name}
                                        onChange={(e) => updateNodeData(selectedNode.id, { name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="form-label mb-1">Local Name</label>
                                    <input
                                        className="form-control form-control-sm"
                                        value={selectedNode.data.local_name}
                                        onChange={(e) => updateNodeData(selectedNode.id, { local_name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="form-label mb-1">Maps to Status *</label>
                                    <select
                                        className="form-select form-select-sm"
                                        value={selectedNode.data.maps_to_status}
                                        onChange={(e) => updateNodeData(selectedNode.id, { maps_to_status: e.target.value })}
                                    >
                                        <option value="">— status —</option>
                                        {statuses.map((st) => <option key={st} value={st}>{st}</option>)}
                                    </select>
                                </div>
                                <div className="row g-2">
                                    <div className="col-6">
                                        <label className="form-label mb-1">Sequence</label>
                                        <input
                                            type="number"
                                            className="form-control form-control-sm"
                                            value={selectedNode.data.sequence}
                                            onChange={(e) => updateNodeData(selectedNode.id, { sequence: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label mb-1">Color</label>
                                        <select
                                            className={`form-select form-select-sm text-${selectedNode.data.color === "light" ? "dark" : selectedNode.data.color}`}
                                            value={selectedNode.data.color}
                                            onChange={(e) => updateNodeData(selectedNode.id, { color: e.target.value })}
                                        >
                                            {colors.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-check">
                                    <input
                                        className="form-check-input" type="checkbox" id="wf-node-initial"
                                        checked={selectedNode.data.is_initial}
                                        onChange={(e) => updateNodeData(selectedNode.id, { is_initial: e.target.checked })}
                                    />
                                    <label className="form-check-label" htmlFor="wf-node-initial">Initial stage</label>
                                </div>
                                <div className="form-check">
                                    <input
                                        className="form-check-input" type="checkbox" id="wf-node-terminal"
                                        checked={selectedNode.data.is_terminal}
                                        onChange={(e) => updateNodeData(selectedNode.id, { is_terminal: e.target.checked })}
                                    />
                                    <label className="form-check-label" htmlFor="wf-node-terminal">Terminal stage</label>
                                </div>
                                <button type="button" className="btn btn-sm btn-outline-danger mt-1" onClick={deleteSelectedNode}>
                                    <i className="fa-solid fa-trash me-1"></i> Delete stage
                                </button>
                            </div>
                        )}

                        {selectedEdge && (
                            <div className="d-flex flex-column gap-2">
                                <div className="text-muted small">
                                    {nodeLabel(selectedEdge.source)} <i className="fa-solid fa-arrow-right mx-1"></i> {nodeLabel(selectedEdge.target)}
                                </div>
                                <div>
                                    <label className="form-label mb-1">Button Label</label>
                                    <input
                                        className="form-control form-control-sm"
                                        placeholder="defaults to target stage name"
                                        value={selectedEdge.label || ""}
                                        onChange={(e) => updateEdge(selectedEdge.id, { label: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="form-label mb-1">Allowed Roles</label>
                                    <input
                                        className="form-control form-control-sm"
                                        placeholder="e.g. admin,manager (blank = any)"
                                        value={selectedEdge.data?.approles || ""}
                                        onChange={(e) => updateEdge(selectedEdge.id, { approles: e.target.value })}
                                    />
                                </div>
                                <button type="button" className="btn btn-sm btn-outline-danger mt-1" onClick={deleteSelectedEdge}>
                                    <i className="fa-solid fa-trash me-1"></i> Delete transition
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
