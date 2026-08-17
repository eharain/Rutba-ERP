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
 */

function Node({ node, depth, expanded, onToggle, highlight }) {
    const kids = node.children || [];
    const hasKids = kids.length > 0;
    const isOpen = expanded[node.documentId] !== false; // default open
    const isMatch = highlight && node.name
        && node.name.toLowerCase().includes(highlight.toLowerCase());

    return (
        <li className="org-node">
            <div
                className={`d-flex align-items-center gap-2 py-1 ${isMatch ? "bg-warning-subtle rounded px-1" : ""}`}
                style={{ paddingLeft: depth * 4 }}
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
                {node.is_team && node.manager && (
                    <span className="small text-muted">managed by {node.manager.name}</span>
                )}
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
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

export default function OrgChart({ defaultView = "reporting", showViewToggle = true }) {
    const { jwt } = useAuth();
    const [view, setView] = useState(defaultView);
    const [depth, setDepth] = useState(4);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState({});
    const [search, setSearch] = useState("");

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
                </p>
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
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
