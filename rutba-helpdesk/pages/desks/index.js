import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import DeskForm from "../../components/DeskForm";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HelpdeskDesksEndpoints } from "@rutba/api-provider/endpoints";

function serverError(err) {
    return err?.response?.data?.error || { message: err?.message || "Request failed" };
}

const humanize = (v) =>
    String(v).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function YesNo({ value }) {
    return value
        ? <span className="badge text-bg-success"><i className="fas fa-check me-1"></i>Yes</span>
        : <span className="badge text-bg-light text-muted"><i className="fas fa-minus me-1"></i>No</span>;
}

function ErrorPanel({ error, onRetry }) {
    if (!error) return null;
    return (
        <div className="alert alert-danger d-flex justify-content-between align-items-start">
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
                <button className="btn btn-sm btn-outline-danger flex-shrink-0" onClick={onRetry}>
                    Retry
                </button>
            )}
        </div>
    );
}

function TableSkeleton({ columns, rows = 4 }) {
    return (
        <tbody className="placeholder-glow">
            {Array.from({ length: rows }).map((_, r) => (
                <tr key={r}>
                    {Array.from({ length: columns }).map((__, c) => (
                        <td key={c}><span className="placeholder col-8"></span></td>
                    ))}
                </tr>
            ))}
        </tbody>
    );
}

/**
 * §32.4: a desk holding open tickets cannot be switched off without nominating
 * where its work goes. The open count is NOT fetched up front — counting open
 * tickets client-side would mean hardcoding which statuses are terminal, and the
 * server already reports the exact number when it refuses. So the first attempt
 * is made without a target and the refusal is what asks for one.
 */
function DeactivateDialog({ desk, desks, onDone, onCancel }) {
    const [targetDeskId, setTargetDeskId] = useState("");
    const [reason, setReason] = useState("");
    const [working, setWorking] = useState(false);
    const [error, setError] = useState(null);

    const targets = (desks || []).filter((d) => d.is_active && d.id !== desk.id);

    const submit = async (e) => {
        e.preventDefault();
        setWorking(true);
        setError(null);
        try {
            const payload = {
                ...(targetDeskId ? { targetDeskId: Number(targetDeskId) } : {}),
                ...(reason.trim() ? { reason: reason.trim() } : {}),
            };
            const res = await HelpdeskDesksEndpoints.runDeactivate(desk.id, payload);
            onDone(res?.data || null);
        } catch (err) {
            setError(serverError(err));
        } finally {
            setWorking(false);
        }
    };

    return (
        <>
            <div className="modal-backdrop fade show" style={{ zIndex: 1055 }}></div>
            <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ zIndex: 1060 }}>
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content">
                        <form onSubmit={submit}>
                            <div className="modal-header">
                                <h5 className="modal-title">Deactivate {desk.name}</h5>
                                <button type="button" className="btn-close" onClick={onCancel} aria-label="Close"></button>
                            </div>
                            <div className="modal-body">
                                <p className="text-muted">
                                    A desk is archived, never deleted — its tickets keep pointing at it. If this desk
                                    still holds open tickets the server will refuse until you nominate a desk to move
                                    them to.
                                </p>

                                <ErrorPanel error={error} />

                                <div className="mb-3">
                                    <label className="form-label" htmlFor="deactivate-target">Move open tickets to</label>
                                    <select
                                        id="deactivate-target"
                                        className="form-select"
                                        value={targetDeskId}
                                        onChange={(e) => setTargetDeskId(e.target.value)}
                                    >
                                        <option value="">Not needed — this desk has no open tickets</option>
                                        {targets.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name} ({d.key})</option>
                                        ))}
                                    </select>
                                    {targets.length === 0 && (
                                        <div className="form-text text-warning">
                                            There is no other active desk to move work to. Activate one first.
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="form-label" htmlFor="deactivate-reason">Reason</label>
                                    <input
                                        id="deactivate-reason"
                                        className="form-control"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Recorded on every moved ticket's timeline"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={working}>
                                    Cancel
                                </button>
                                <button className="btn btn-danger" disabled={working}>
                                    {working && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>}
                                    Deactivate desk
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}

export default function DesksPage() {
    const { jwt } = useAuth();
    const [desks, setDesks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [includeInactive, setIncludeInactive] = useState(true);
    const [editing, setEditing] = useState(null);      // desk row, or "new"
    const [deactivating, setDeactivating] = useState(null);
    const [notice, setNotice] = useState(null);
    const [rowError, setRowError] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const load = () => {
        if (!jwt) return;
        setLoading(true);
        setLoadError(null);
        HelpdeskDesksEndpoints.list({ includeInactive })
            .then((res) => setDesks(res?.data || []))
            // Stale-data-wins: the rows already on screen stay, the banner explains.
            .catch((err) => setLoadError(serverError(err)))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
    }, [jwt, includeInactive]);

    const handleSaved = (saved) => {
        setEditing(null);
        setNotice(saved ? `Desk "${saved.key}" saved.` : "Desk saved.");
        load();
    };

    const handleActivate = async (desk) => {
        setRowError(null);
        setBusyId(desk.id);
        try {
            await HelpdeskDesksEndpoints.runActivate(desk.id);
            setNotice(`Desk "${desk.key}" is active again.`);
            load();
        } catch (err) {
            setRowError(serverError(err));
        } finally {
            setBusyId(null);
        }
    };

    const handleDeactivated = (result) => {
        setDeactivating(null);
        const moved = result && result.moved ? result.moved : 0;
        const target = result && result.target ? result.target.key : null;
        setNotice(moved
            ? `Desk deactivated. ${moved} open ticket(s) moved to ${target}.`
            : "Desk deactivated.");
        load();
    };

    const showSkeleton = loading && desks.length === 0;

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h2 className="mb-0">Desks</h2>
                        <span className="text-muted small">
                            Every ticket belongs to a desk. A desk decides visibility, the workflow it moves
                            through and the promise it is measured against.
                        </span>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={() => { setEditing("new"); setNotice(null); }}
                        disabled={editing === "new"}
                    >
                        <i className="fas fa-plus me-1"></i>New Desk
                    </button>
                </div>

                {notice && (
                    <div className="alert alert-success alert-dismissible d-flex justify-content-between align-items-center">
                        <span><i className="fas fa-circle-check me-2"></i>{notice}</span>
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                <ErrorPanel error={loadError} onRetry={load} />
                <ErrorPanel error={rowError} />

                {editing && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>{editing === "new" ? "New desk" : `Edit ${editing.name}`}</strong>
                            <button className="btn-close" onClick={() => setEditing(null)} aria-label="Close"></button>
                        </div>
                        <div className="card-body">
                            <DeskForm
                                desk={editing === "new" ? null : editing}
                                desks={desks}
                                onSaved={handleSaved}
                                onCancel={() => setEditing(null)}
                            />
                        </div>
                    </div>
                )}

                <div className="form-check mb-2">
                    <input
                        id="desks-include-inactive"
                        className="form-check-input"
                        type="checkbox"
                        checked={includeInactive}
                        onChange={(e) => setIncludeInactive(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="desks-include-inactive">
                        Include archived desks
                    </label>
                </div>

                <div className="table-responsive">
                    <table className="table table-hover align-middle">
                        <thead className="table-dark">
                            <tr>
                                <th>Key</th>
                                <th>Name</th>
                                <th>Visibility</th>
                                <th>Default priority</th>
                                <th>Anonymous</th>
                                <th>Line manager</th>
                                <th className="text-end">Reopen (d)</th>
                                <th className="text-end">Auto-close (d)</th>
                                <th>State</th>
                                <th className="text-end"></th>
                            </tr>
                        </thead>
                        {showSkeleton ? (
                            <TableSkeleton columns={10} />
                        ) : (
                            <tbody>
                                {desks.map((desk) => (
                                    <tr key={desk.id} className={desk.is_active ? "" : "table-light text-muted"}>
                                        <td><code>{desk.key}</code></td>
                                        <td>
                                            {desk.name}
                                            {desk.email_address && (
                                                <span className="d-block small text-muted">{desk.email_address}</span>
                                            )}
                                        </td>
                                        <td>{desk.visibility_mode ? humanize(desk.visibility_mode) : "—"}</td>
                                        <td>{desk.default_priority ? humanize(desk.default_priority) : "—"}</td>
                                        <td><YesNo value={desk.allow_anonymous} /></td>
                                        <td><YesNo value={desk.grant_line_manager_access} /></td>
                                        <td className="text-end">{desk.reopen_window_days ?? "—"}</td>
                                        <td className="text-end">{desk.auto_close_after_days ?? "—"}</td>
                                        <td>
                                            {desk.is_active
                                                ? <span className="badge text-bg-success">Active</span>
                                                : <span className="badge text-bg-secondary">Archived</span>}
                                        </td>
                                        <td className="text-end text-nowrap">
                                            <button
                                                className="btn btn-sm btn-outline-primary me-1"
                                                onClick={() => { setEditing(desk); setNotice(null); }}
                                            >
                                                Edit
                                            </button>
                                            {desk.is_active ? (
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => { setDeactivating(desk); setRowError(null); }}
                                                >
                                                    Deactivate
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn btn-sm btn-outline-success"
                                                    onClick={() => handleActivate(desk)}
                                                    disabled={busyId === desk.id}
                                                >
                                                    {busyId === desk.id && (
                                                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                                    )}
                                                    Activate
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        )}
                    </table>
                </div>

                {!loading && desks.length === 0 && !loadError && (
                    <div className="alert alert-info">
                        <div className="fw-semibold">No desks yet.</div>
                        A desk is what every ticket belongs to, and a ticket cannot be created until one
                        exists. The helpdesk seed migration creates the first ones together with the
                        workflow, SLA policy and business calendar a desk needs — run it, or create a desk
                        here once those ids exist.
                    </div>
                )}

                {deactivating && (
                    <DeactivateDialog
                        desk={deactivating}
                        desks={desks}
                        onDone={handleDeactivated}
                        onCancel={() => setDeactivating(null)}
                    />
                )}
            </Layout>
        </ProtectedRoute>
    );
}
