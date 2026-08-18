import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import RoutingRuleForm from "../../components/RoutingRuleForm";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { HelpdeskConfigEndpoints, HelpdeskDesksEndpoints } from "@rutba/api-provider/endpoints";

function serverError(err) {
    return err?.response?.data?.error || { message: err?.message || "Request failed" };
}

const humanize = (v) =>
    String(v).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const csvToList = (text) =>
    String(text || "").split(",").map((s) => s.trim()).filter(Boolean);

function ErrorPanel({ error, onRetry, className = "" }) {
    if (!error) return null;
    return (
        <div className={`alert alert-danger d-flex justify-content-between align-items-start ${className}`}>
            <div>
                <div className="fw-semibold">
                    <i className="fas fa-triangle-exclamation me-2"></i>
                    {error.message || "The request failed."}
                </div>
                {error.details && (
                    <pre className="mb-0 mt-2 small text-break" style={{ whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(error.details, null, 2)}
                    </pre>
                )}
            </div>
            {onRetry && (
                <button className="btn btn-sm btn-outline-danger flex-shrink-0" onClick={onRetry}>Retry</button>
            )}
        </div>
    );
}

/**
 * The per-candidate eligibility outcome, rendered in full. This is the part that
 * makes routing debuggable rather than magical: every check the engine ran, its
 * verdict, and the server's own explanation of it.
 */
function ChecksList({ checks }) {
    if (!checks || !checks.length) return <span className="text-muted small">—</span>;
    return (
        <div className="d-flex flex-wrap gap-1">
            {checks.map((c, i) => (
                <span
                    key={`${c.check}-${i}`}
                    className={`badge ${c.ok ? "text-bg-light text-muted" : "text-bg-danger"}`}
                    title={c.detail || ""}
                >
                    <i className={`fas ${c.ok ? "fa-check" : "fa-xmark"} me-1`}></i>
                    {humanize(c.check)}
                    {c.detail ? <span className="ms-1 fw-normal">({c.detail})</span> : null}
                </span>
            ))}
        </div>
    );
}

function EligibleBadge({ eligible }) {
    return eligible
        ? <span className="badge text-bg-success"><i className="fas fa-check me-1"></i>Eligible</span>
        : <span className="badge text-bg-secondary"><i className="fas fa-ban me-1"></i>Excluded</span>;
}

function deskLabel(desks, id) {
    const desk = (desks || []).find((d) => d.id === Number(id));
    return desk ? `${desk.name} (${desk.key})` : id ? `#${id}` : "—";
}

const EMPTY_PROBE = {
    desk_id: "",
    subject: "",
    message: "",
    priority: "",
    source: "",
    category: "",
    requester_kind: "",
    tags: "",
    branch_id: "",
    team_id: "",
};

/**
 * The dry run (§14.8). Writes nothing: it reports the decision the engine WOULD
 * make for a ticket shaped like the one described here, together with every rule
 * it evaluated and every candidate it rejected.
 */
function PreviewPanel({ desks, priorities }) {
    const [probe, setProbe] = useState(EMPTY_PROBE);
    const [result, setResult] = useState(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState(null);

    const set = (field) => (e) => setProbe((p) => ({ ...p, [field]: e.target.value }));

    const run = async (e) => {
        e.preventDefault();
        setRunning(true);
        setError(null);
        try {
            // A ticket ROW shape, not the create payload: the condition namespace
            // reads `message`, and the engine maps the object straight onto a
            // synthetic ticket.
            const ticket = {
                ...(probe.desk_id ? { desk_id: Number(probe.desk_id) } : {}),
                ...(probe.subject.trim() ? { subject: probe.subject.trim() } : {}),
                ...(probe.message.trim() ? { message: probe.message.trim() } : {}),
                ...(probe.priority.trim() ? { priority: probe.priority.trim() } : {}),
                ...(probe.source.trim() ? { source: probe.source.trim() } : {}),
                ...(probe.category.trim() ? { category: probe.category.trim() } : {}),
                ...(probe.requester_kind.trim() ? { requester_kind: probe.requester_kind.trim() } : {}),
                ...(probe.branch_id ? { branch_id: Number(probe.branch_id) } : {}),
                ...(probe.team_id ? { team_id: Number(probe.team_id) } : {}),
                tags: csvToList(probe.tags),
            };
            const res = await HelpdeskConfigEndpoints.runRoutingPreview({ ticket });
            setResult(res?.data || null);
        } catch (err) {
            setError(serverError(err));
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="card h-100">
            <div className="card-header">
                <strong><i className="fas fa-flask me-2"></i>Preview</strong>
                <span className="d-block small text-muted">
                    Who would get this ticket, and why. Nothing is written.
                </span>
            </div>
            <div className="card-body">
                <form onSubmit={run}>
                    <div className="row g-2">
                        <div className="col-md-6">
                            <label className="form-label small" htmlFor="probe-desk">Desk</label>
                            <select id="probe-desk" className="form-select form-select-sm" value={probe.desk_id} onChange={set("desk_id")}>
                                <option value="">Let the engine resolve it</option>
                                {(desks || []).map((d) => (
                                    <option key={d.id} value={d.id}>{d.name} ({d.key})</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-6">
                            <label className="form-label small" htmlFor="probe-priority">Priority</label>
                            <input
                                id="probe-priority"
                                className="form-control form-control-sm"
                                list={priorities.length ? "probe-priority-options" : undefined}
                                value={probe.priority}
                                onChange={set("priority")}
                            />
                            {priorities.length > 0 && (
                                <datalist id="probe-priority-options">
                                    {priorities.map((p) => <option key={p} value={p} />)}
                                </datalist>
                            )}
                        </div>
                        <div className="col-12">
                            <label className="form-label small" htmlFor="probe-subject">Subject</label>
                            <input id="probe-subject" className="form-control form-control-sm" value={probe.subject} onChange={set("subject")} />
                        </div>
                        <div className="col-12">
                            <label className="form-label small" htmlFor="probe-message">Message</label>
                            <textarea id="probe-message" className="form-control form-control-sm" rows={2} value={probe.message} onChange={set("message")} />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label small" htmlFor="probe-source">Source</label>
                            <input id="probe-source" className="form-control form-control-sm" value={probe.source} onChange={set("source")} />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label small" htmlFor="probe-category">Category</label>
                            <input id="probe-category" className="form-control form-control-sm" value={probe.category} onChange={set("category")} />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label small" htmlFor="probe-kind">Requester kind</label>
                            <input id="probe-kind" className="form-control form-control-sm" value={probe.requester_kind} onChange={set("requester_kind")} />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label small" htmlFor="probe-tags">Tags</label>
                            <input id="probe-tags" className="form-control form-control-sm" value={probe.tags} onChange={set("tags")} placeholder="vip, refund" />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label small" htmlFor="probe-branch">Branch id</label>
                            <input id="probe-branch" type="number" min="1" className="form-control form-control-sm" value={probe.branch_id} onChange={set("branch_id")} />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label small" htmlFor="probe-team">Team id</label>
                            <input id="probe-team" type="number" min="1" className="form-control form-control-sm" value={probe.team_id} onChange={set("team_id")} />
                        </div>
                    </div>
                    <div className="d-flex justify-content-end gap-2 mt-3">
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setProbe(EMPTY_PROBE); setResult(null); setError(null); }}>
                            Reset
                        </button>
                        <button className="btn btn-sm btn-primary" disabled={running}>
                            {running && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>}
                            Run preview
                        </button>
                    </div>
                </form>

                <ErrorPanel error={error} className="mt-3" />

                {result && (
                    <div className="mt-4">
                        <dl className="row mb-3 small">
                            <dt className="col-4">Desk</dt>
                            <dd className="col-8">
                                {result.desk ? result.desk.key : "—"}
                                {result.desk?.matchedBy && (
                                    <span className="badge text-bg-light text-muted ms-2">matched by {humanize(result.desk.matchedBy)}</span>
                                )}
                            </dd>

                            <dt className="col-4">Team</dt>
                            <dd className="col-8">
                                {result.team && result.team.id ? (result.team.key || `#${result.team.id}`) : "—"}
                                {result.team?.matchedBy && (
                                    <span className="badge text-bg-light text-muted ms-2">{humanize(result.team.matchedBy)}</span>
                                )}
                            </dd>

                            <dt className="col-4">Rule</dt>
                            <dd className="col-8">
                                {result.rule
                                    ? <>{result.rule.name} <span className="text-muted">#{result.rule.id}</span></>
                                    : <span className="text-muted">no rule matched</span>}
                            </dd>

                            <dt className="col-4">Strategy</dt>
                            <dd className="col-8">
                                {result.strategy ? humanize(result.strategy) : "—"}
                                {result.strategyFrom && (
                                    <span className="badge text-bg-light text-muted ms-2">from {humanize(result.strategyFrom)}</span>
                                )}
                            </dd>

                            <dt className="col-4">Would assign</dt>
                            <dd className="col-8">
                                {result.wouldAssign
                                    ? <span className="badge text-bg-success">{result.wouldAssign.label} (user #{result.wouldAssign.userId})</span>
                                    : <span className="badge text-bg-warning text-dark">nobody</span>}
                            </dd>

                            <dt className="col-4">Why</dt>
                            <dd className="col-8">{result.why || "—"}</dd>

                            {result.overCapacity && (
                                <>
                                    <dt className="col-4">Capacity</dt>
                                    <dd className="col-8">
                                        <span className="badge text-bg-danger">
                                            Every candidate is at their open-ticket cap
                                        </span>
                                    </dd>
                                </>
                            )}

                            {result.evaluatedAt && (
                                <>
                                    <dt className="col-4">Evaluated at</dt>
                                    <dd className="col-8">{new Date(result.evaluatedAt).toLocaleString()}</dd>
                                </>
                            )}
                        </dl>

                        {result.strategyTrace?.length > 0 && (
                            <>
                                <h6 className="small text-uppercase text-muted">Strategy trace</h6>
                                <ul className="list-group list-group-flush mb-3 small">
                                    {result.strategyTrace.map((t, i) => (
                                        <li key={i} className="list-group-item px-0 py-1">
                                            <span className="fw-semibold me-2">{humanize(t.step || t.strategy || "step")}</span>
                                            <span className="text-muted">{t.detail || JSON.stringify(t)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {result.rulesEvaluated?.length > 0 && (
                            <>
                                <h6 className="small text-uppercase text-muted">Rules evaluated</h6>
                                <div className="table-responsive mb-3">
                                    <table className="table table-sm align-middle small">
                                        <thead>
                                            <tr>
                                                <th>Seq</th>
                                                <th>Rule</th>
                                                <th>Matched</th>
                                                <th>Trace</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.rulesEvaluated.map((r) => (
                                                <tr key={r.ruleId}>
                                                    <td>{r.sequence}</td>
                                                    <td>{r.name}</td>
                                                    <td>
                                                        {r.matched
                                                            ? <span className="badge text-bg-success">Yes</span>
                                                            : <span className="badge text-bg-light text-muted">No</span>}
                                                    </td>
                                                    <td>
                                                        <details>
                                                            <summary className="text-muted">Condition tree</summary>
                                                            <pre className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>
                                                                {JSON.stringify(r.trace, null, 2)}
                                                            </pre>
                                                        </details>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        <h6 className="small text-uppercase text-muted">Candidates</h6>
                        {result.candidates?.length ? (
                            <div className="table-responsive">
                                <table className="table table-sm align-middle small">
                                    <thead>
                                        <tr>
                                            <th>Agent</th>
                                            <th>Team</th>
                                            <th>Verdict</th>
                                            <th>Checks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.candidates.map((c) => (
                                            <tr key={c.userId}>
                                                <td>{c.label} <span className="text-muted">#{c.userId}</span></td>
                                                <td>{c.teamId ? `#${c.teamId}` : "—"}</td>
                                                <td><EligibleBadge eligible={c.eligible} /></td>
                                                <td><ChecksList checks={c.checks} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-muted small mb-0">
                                No candidates at all — nobody holds a role on the resolved desk, so there is
                                nothing for a strategy to choose between.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/** The same eligibility checks route() runs, reported for a whole desk. */
function AvailabilityPanel({ desks }) {
    const [deskId, setDeskId] = useState("");
    const [teamId, setTeamId] = useState("");
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const run = async (e) => {
        e.preventDefault();
        if (!deskId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await HelpdeskConfigEndpoints.getRoutingAvailability({
                deskId: Number(deskId),
                ...(teamId ? { teamId: Number(teamId) } : {}),
            });
            setSnapshot(res?.data || null);
        } catch (err) {
            setError(serverError(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card h-100">
            <div className="card-header">
                <strong><i className="fas fa-user-clock me-2"></i>Agent availability</strong>
                <span className="d-block small text-muted">
                    Why nobody is available, answered by the checks routing itself runs.
                </span>
            </div>
            <div className="card-body">
                <form className="row g-2 align-items-end" onSubmit={run}>
                    <div className="col-md-6">
                        <label className="form-label small" htmlFor="availability-desk">Desk</label>
                        <select
                            id="availability-desk"
                            className="form-select form-select-sm"
                            value={deskId}
                            onChange={(e) => setDeskId(e.target.value)}
                        >
                            <option value="">Choose a desk</option>
                            {(desks || []).map((d) => (
                                <option key={d.id} value={d.id}>{d.name} ({d.key})</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-md-3">
                        <label className="form-label small" htmlFor="availability-team">Team id</label>
                        <input
                            id="availability-team"
                            type="number"
                            min="1"
                            className="form-control form-control-sm"
                            value={teamId}
                            onChange={(e) => setTeamId(e.target.value)}
                        />
                    </div>
                    <div className="col-md-3">
                        <button className="btn btn-sm btn-outline-primary w-100" disabled={loading || !deskId}>
                            {loading && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>}
                            Snapshot
                        </button>
                    </div>
                </form>

                <ErrorPanel error={error} className="mt-3" />

                {snapshot && (
                    <div className="mt-3">
                        <p className="small text-muted">
                            {deskLabel(desks, snapshot.deskId)}
                            {snapshot.teamId ? ` · team #${snapshot.teamId}` : ""}
                            {snapshot.at ? ` · as at ${new Date(snapshot.at).toLocaleString()}` : ""}
                        </p>
                        {snapshot.agents?.length ? (
                            <div className="table-responsive">
                                <table className="table table-sm align-middle small">
                                    <thead>
                                        <tr>
                                            <th>Agent</th>
                                            <th>Team</th>
                                            <th className="text-end">Load</th>
                                            <th className="text-end">Weight</th>
                                            <th>Verdict</th>
                                            <th>Checks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {snapshot.agents.map((a) => (
                                            <tr key={a.userId}>
                                                <td>{a.label} <span className="text-muted">#{a.userId}</span></td>
                                                <td>{a.teamId ? `#${a.teamId}` : "—"}</td>
                                                <td className="text-end">{a.openTickets}/{a.cap}</td>
                                                <td className="text-end">{a.capacityWeight ?? "—"}</td>
                                                <td><EligibleBadge eligible={a.eligible} /></td>
                                                <td><ChecksList checks={a.checks} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="alert alert-warning mb-0">
                                Nobody holds a role on this desk. Routing has no pool to choose from, so every
                                ticket here stays unassigned until someone joins a team on it.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function RoutingPage() {
    const { jwt } = useAuth();
    const [rules, setRules] = useState([]);
    const [desks, setDesks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [rulesError, setRulesError] = useState(null);
    const [desksError, setDesksError] = useState(null);
    const [editing, setEditing] = useState(null);      // rule row, or "new"
    const [notice, setNotice] = useState(null);

    const loadRules = () => {
        if (!jwt) return Promise.resolve();
        setRulesError(null);
        return HelpdeskConfigEndpoints.listRoutingRules({})
            .then((res) => setRules(res?.data || []))
            .catch((err) => setRulesError(serverError(err)));
    };

    const loadDesks = () => {
        if (!jwt) return Promise.resolve();
        setDesksError(null);
        return HelpdeskDesksEndpoints.list({})
            .then((res) => setDesks(res?.data || []))
            .catch((err) => setDesksError(serverError(err)));
    };

    useEffect(() => {
        if (!jwt) return;
        setLoading(true);
        // Partial rendering is deliberate: a desk-list failure must not hide the
        // rules, and vice versa. Each panel carries its own banner.
        Promise.all([loadRules(), loadDesks()]).finally(() => setLoading(false));
    }, [jwt]);

    const handleSaved = (saved) => {
        setEditing(null);
        setNotice(saved ? `Rule "${saved.name}" saved.` : "Rule saved.");
        loadRules();
    };

    const strategies = [...new Set(rules.map((r) => r.strategy).filter(Boolean))];
    const priorities = [...new Set(desks.map((d) => d.default_priority).filter(Boolean))];

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h2 className="mb-0">Routing</h2>
                        <span className="text-muted small">
                            Rules choose the desk, the team and the strategy. A strategy proposes and
                            eligibility disposes — the preview below shows both halves.
                        </span>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={() => { setEditing("new"); setNotice(null); }}
                        disabled={editing === "new"}
                    >
                        <i className="fas fa-plus me-1"></i>New Rule
                    </button>
                </div>

                {notice && (
                    <div className="alert alert-success d-flex justify-content-between align-items-center">
                        <span><i className="fas fa-circle-check me-2"></i>{notice}</span>
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                <ErrorPanel error={desksError} onRetry={loadDesks} />

                {editing && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>{editing === "new" ? "New routing rule" : `Edit ${editing.name}`}</strong>
                            <button className="btn-close" onClick={() => setEditing(null)} aria-label="Close"></button>
                        </div>
                        <div className="card-body">
                            <RoutingRuleForm
                                rule={editing === "new" ? null : editing}
                                desks={desks}
                                strategies={strategies}
                                onSaved={handleSaved}
                                onCancel={() => setEditing(null)}
                            />
                        </div>
                    </div>
                )}

                <div className="card mb-4">
                    <div className="card-header">
                        <strong>Rules</strong>
                        <span className="d-block small text-muted">
                            Evaluated in sequence; the first match wins. Only active rules are returned by
                            the API, so a deactivated rule disappears from this list.
                        </span>
                    </div>
                    <div className="card-body p-0">
                        <ErrorPanel error={rulesError} onRetry={loadRules} className="m-3" />

                        <div className="table-responsive">
                            <table className="table table-hover align-middle mb-0">
                                <thead className="table-dark">
                                    <tr>
                                        <th className="text-end">Seq</th>
                                        <th>Name</th>
                                        <th>Key</th>
                                        <th>Applies to</th>
                                        <th>Strategy</th>
                                        <th>Targets</th>
                                        <th>Conditions</th>
                                        <th className="text-end"></th>
                                    </tr>
                                </thead>
                                {loading && rules.length === 0 ? (
                                    <tbody className="placeholder-glow">
                                        {Array.from({ length: 3 }).map((_, r) => (
                                            <tr key={r}>
                                                {Array.from({ length: 8 }).map((__, c) => (
                                                    <td key={c}><span className="placeholder col-8"></span></td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                ) : (
                                    <tbody>
                                        {rules.map((rule) => (
                                            <tr key={rule.id}>
                                                <td className="text-end">{rule.sequence}</td>
                                                <td>{rule.name}</td>
                                                <td>{rule.key ? <code>{rule.key}</code> : "—"}</td>
                                                <td>{rule.desk_id ? deskLabel(desks, rule.desk_id) : <span className="text-muted">Tenant-wide</span>}</td>
                                                <td>{rule.strategy ? humanize(rule.strategy) : <span className="text-muted">inherited</span>}</td>
                                                <td className="small">
                                                    {rule.target_desk_id ? <div>Desk: {deskLabel(desks, rule.target_desk_id)}</div> : null}
                                                    {rule.target_team_id ? <div>Team: #{rule.target_team_id}</div> : null}
                                                    {rule.target_agent_id ? <div>Agent: #{rule.target_agent_id}</div> : null}
                                                    {!rule.target_desk_id && !rule.target_team_id && !rule.target_agent_id && (
                                                        <span className="text-muted">—</span>
                                                    )}
                                                </td>
                                                <td style={{ maxWidth: "22rem" }}>
                                                    {rule.conditions ? (
                                                        <details>
                                                            <summary className="text-muted small">View</summary>
                                                            <pre className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>
                                                                {JSON.stringify(rule.conditions, null, 2)}
                                                            </pre>
                                                        </details>
                                                    ) : (
                                                        <span className="badge text-bg-warning text-dark">Catch-all</span>
                                                    )}
                                                </td>
                                                <td className="text-end">
                                                    <button
                                                        className="btn btn-sm btn-outline-primary"
                                                        onClick={() => { setEditing(rule); setNotice(null); }}
                                                    >
                                                        Edit
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                )}
                            </table>
                        </div>

                        {!loading && rules.length === 0 && !rulesError && (
                            <div className="alert alert-info m-3 mb-0">
                                <div className="fw-semibold">No routing rules.</div>
                                Routing still works — every ticket falls through to its desk&apos;s defaults and
                                the tenant strategy. Add a rule when a subset of tickets needs to go somewhere
                                else, and use the preview below to check it before it matters.
                            </div>
                        )}
                    </div>
                </div>

                <div className="row g-4">
                    <div className="col-xl-7">
                        <PreviewPanel desks={desks} priorities={priorities} />
                    </div>
                    <div className="col-xl-5">
                        <AvailabilityPanel desks={desks} />
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
