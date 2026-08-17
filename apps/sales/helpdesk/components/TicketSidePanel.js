import { useCallback, useEffect, useState } from "react";
import { HelpdeskTicketsEndpoints } from "@rutba/api-provider/endpoints";

function apiError(err) {
    const res = err && err.response;
    const payload = res && res.data && res.data.error;
    return {
        status: res ? res.status : 0,
        message: (payload && payload.message) || (err && err.message) || "Request failed",
    };
}

function when(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function duration(ms) {
    if (ms === null || ms === undefined) return "—";
    const negative = ms < 0;
    const total = Math.floor(Math.abs(ms) / 60000);
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    const minutes = total % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (!days) parts.push(`${minutes}m`);
    return `${negative ? "-" : ""}${parts.join(" ")}`;
}

// Spec 38.4 pins these colours, and 38.4 also forbids colour as the sole
// carrier — so every entry ships a label and an icon too. Unknown keys fall
// through to a neutral chip rather than disappearing: SLA states are server
// vocabulary and a new one must still render.
const SLA_STATE = {
    ok: { label: "On track", icon: "fa-circle-check", css: "text-bg-success" },
    at_risk: { label: "At risk", icon: "fa-triangle-exclamation", css: "text-bg-warning" },
    breached: { label: "Breached", icon: "fa-circle-xmark", css: "text-bg-danger" },
    paused: { label: "Paused", icon: "fa-circle-pause", css: "text-bg-secondary" },
    indeterminate: { label: "Not measured", icon: "fa-circle-question", css: "text-bg-light border" },
};

function slaChip(state) {
    const chip = SLA_STATE[state] || { label: state || "Unknown", icon: "fa-circle-question", css: "text-bg-light border" };
    return (
        <span className={`badge ${chip.css}`}>
            <i className={`fa-solid ${chip.icon} me-1`}></i>{chip.label}
        </span>
    );
}

/**
 * One independently-loading rail section. Each keeps its own error, so a
 * failing watcher read never blanks the SLA panel next to it (spec 38.7
 * "Partial"), and a failed refresh keeps the last good data with a stale mark
 * instead of replacing it with an error card.
 */
function useSection(load, refreshKey) {
    const [state, setState] = useState({ data: null, loading: true, error: null, stale: false, loadedAt: null });

    const run = useCallback(async () => {
        if (!load) return;
        setState((s) => ({ ...s, loading: true }));
        try {
            const data = await load();
            setState({ data, loading: false, error: null, stale: false, loadedAt: Date.now() });
        } catch (err) {
            const info = apiError(err);
            setState((s) => (s.data
                ? { ...s, loading: false, stale: true, error: info.message }
                : { data: null, loading: false, error: info.message, stale: false, loadedAt: null }));
        }
    }, [load]);

    useEffect(() => {
        run();
    }, [run, refreshKey]);

    return { ...state, reload: run };
}

function Section({ title, icon, count, children, loading, error, stale, onRetry }) {
    return (
        <div className="card mb-3">
            <div className="card-header d-flex align-items-center gap-2 py-2">
                <strong className="small text-uppercase">
                    <i className={`fa-solid ${icon} me-2`}></i>{title}
                </strong>
                {count !== undefined && count !== null && (
                    <span className="badge text-bg-secondary">{count}</span>
                )}
                {loading && <span className="spinner-border spinner-border-sm ms-auto" role="status"></span>}
                {!loading && onRetry && (
                    <button type="button" className="btn btn-sm btn-link ms-auto p-0" onClick={onRetry} title="Reload">
                        <i className="fa-solid fa-rotate"></i>
                    </button>
                )}
            </div>
            {stale && (
                <div className="alert alert-warning rounded-0 mb-0 py-1 px-3 small">
                    <i className="fa-solid fa-triangle-exclamation me-1"></i>Last refresh failed — showing cached data.
                </div>
            )}
            <div className="card-body py-2">
                {error && !stale ? (
                    <div className="text-danger small">
                        <i className="fa-solid fa-triangle-exclamation me-1"></i>{error}
                    </div>
                ) : children}
            </div>
        </div>
    );
}

function Clock({ title, clock }) {
    if (!clock) return <div className="text-muted small">Not measured.</div>;
    const pct = clock.elapsed_pct === null || clock.elapsed_pct === undefined
        ? null
        : Math.max(0, Math.min(100, Math.round(clock.elapsed_pct)));
    const bar = clock.breached ? "bg-danger" : clock.at_risk ? "bg-warning" : "bg-success";
    return (
        <div className="mb-2">
            <div className="d-flex justify-content-between small">
                <span className="fw-semibold">{title}</span>
                <span>
                    {clock.met === true && <span className="badge text-bg-success me-1"><i className="fa-solid fa-check me-1"></i>Met</span>}
                    {clock.breached && <span className="badge text-bg-danger me-1"><i className="fa-solid fa-circle-xmark me-1"></i>Breached</span>}
                    {!clock.breached && clock.at_risk && <span className="badge text-bg-warning me-1"><i className="fa-solid fa-triangle-exclamation me-1"></i>At risk</span>}
                </span>
            </div>
            <div className="small text-muted">
                Due {when(clock.due_at)}
                {clock.remaining_business_ms !== null && clock.remaining_business_ms !== undefined && (
                    <> · {clock.remaining_business_ms < 0 ? "over by" : "remaining"} {duration(clock.remaining_business_ms)}</>
                )}
            </div>
            {pct !== null && (
                <div className="progress mt-1" style={{ height: "6px" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`progress-bar ${bar}`} style={{ width: `${pct}%` }}></div>
                </div>
            )}
        </div>
    );
}

const ACTIVITY_ICON = {
    created: "fa-plus",
    transition: "fa-arrow-right-arrow-left",
    assigned: "fa-user-check",
    unassigned: "fa-user-slash",
    watch: "fa-eye",
    unwatch: "fa-eye-slash",
    comment: "fa-comment",
    note: "fa-note-sticky",
};

export default function TicketSidePanel({ documentId, ticket, desk, currentUserId, refreshKey, onChanged }) {
    const [watcherId, setWatcherId] = useState("");
    const [watcherBusy, setWatcherBusy] = useState(false);
    const [watcherError, setWatcherError] = useState(null);

    const loadSla = useCallback(() => HelpdeskTicketsEndpoints.getSla(documentId), [documentId]);
    const loadWatchers = useCallback(() => HelpdeskTicketsEndpoints.listWatchers(documentId), [documentId]);
    const loadActivity = useCallback(
        () => HelpdeskTicketsEndpoints.listActivity(documentId, { pageSize: 50 }),
        [documentId]
    );

    // Passing null until the route settles keeps each section in its loading
    // state rather than briefly claiming there is nothing to show.
    const sla = useSection(documentId ? loadSla : null, refreshKey);
    const watchers = useSection(documentId ? loadWatchers : null, refreshKey);
    const activity = useSection(documentId ? loadActivity : null, refreshKey);

    const slaDetail = sla.data && sla.data.data ? sla.data.data : null;
    const watcherRows = watchers.data && Array.isArray(watchers.data.data) ? watchers.data.data : [];
    const activityRows = activity.data && Array.isArray(activity.data.data) ? activity.data.data : [];

    const watchingSelf = currentUserId
        ? watcherRows.some((w) => w.user && Number(w.user.id) === Number(currentUserId))
        : false;

    const runWatcher = async (fn) => {
        setWatcherBusy(true);
        setWatcherError(null);
        try {
            await fn();
            await watchers.reload();
            if (onChanged) onChanged();
        } catch (err) {
            setWatcherError(apiError(err).message);
        } finally {
            setWatcherBusy(false);
        }
    };

    const addSelf = () => runWatcher(() => HelpdeskTicketsEndpoints.createWatcher(documentId, {}));
    const removeSelf = () => runWatcher(() => HelpdeskTicketsEndpoints.removeWatcher(documentId, currentUserId));
    const addOther = (e) => {
        e.preventDefault();
        const id = watcherId.trim();
        if (!id) return;
        return runWatcher(async () => {
            await HelpdeskTicketsEndpoints.createWatcher(documentId, { user_id: Number(id) });
            setWatcherId("");
        });
    };

    return (
        <div>
            <Section title="Requester" icon="fa-user">
                {!ticket ? (
                    <div className="placeholder-glow">
                        <span className="placeholder col-8 d-block mb-1"></span>
                        <span className="placeholder col-5 d-block"></span>
                    </div>
                ) : (
                    <dl className="row mb-0 small">
                        <dt className="col-5 text-muted fw-normal">Name</dt>
                        <dd className="col-7 mb-1">
                            {(ticket.user && (ticket.user.display_name || ticket.user.username)) || "—"}
                        </dd>
                        <dt className="col-5 text-muted fw-normal">Email</dt>
                        <dd className="col-7 mb-1">{(ticket.user && ticket.user.email) || "—"}</dd>
                        <dt className="col-5 text-muted fw-normal">Kind</dt>
                        <dd className="col-7 mb-1">{ticket.requester_kind || "—"}</dd>
                        <dt className="col-5 text-muted fw-normal">Source</dt>
                        <dd className="col-7 mb-1">{ticket.source || "—"}</dd>
                        {ticket.person_id && (
                            <>
                                <dt className="col-5 text-muted fw-normal">Person</dt>
                                <dd className="col-7 mb-1">#{ticket.person_id}</dd>
                            </>
                        )}
                        {ticket.employee_id && (
                            <>
                                <dt className="col-5 text-muted fw-normal">Employee</dt>
                                <dd className="col-7 mb-1">#{ticket.employee_id}</dd>
                            </>
                        )}
                    </dl>
                )}
            </Section>

            <Section title="Linked record" icon="fa-link">
                {!ticket ? (
                    <span className="placeholder col-8 d-block"></span>
                ) : ticket.subject_entity_uid ? (
                    <div className="small">
                        <div className="fw-semibold text-break">{ticket.subject_entity_uid}</div>
                        <div className="text-muted text-break">{ticket.subject_document_id || "—"}</div>
                        {/* Spec 18.5 asks for a per-entity projection here. No
                            projection service is exposed yet, so this is the
                            "generic link rather than an error" fallback the same
                            section prescribes for unregistered types. */}
                        <div className="text-muted mt-1">
                            <i className="fa-solid fa-circle-info me-1"></i>
                            No live projection for this record type yet.
                        </div>
                    </div>
                ) : (
                    <span className="text-muted small">Nothing linked. Use “Link record” in Actions.</span>
                )}
            </Section>

            <Section
                title="SLA"
                icon="fa-stopwatch"
                loading={sla.loading && !slaDetail}
                error={sla.error}
                stale={sla.stale}
                onRetry={sla.reload}
            >
                {slaDetail ? (
                    <>
                        <div className="mb-2">
                            {slaChip(slaDetail.sla_state)}
                            {slaDetail.policy && (
                                <span className="ms-2 small text-muted">{slaDetail.policy.name || slaDetail.policy.key}</span>
                            )}
                        </div>
                        {!slaDetail.measured && (
                            <div className="text-muted small mb-2">
                                <i className="fa-solid fa-circle-info me-1"></i>
                                No SLA policy applies to this ticket.
                            </div>
                        )}
                        <Clock title="First response" clock={slaDetail.first_response} />
                        <Clock title="Resolution" clock={slaDetail.resolution} />
                        {slaDetail.paused && slaDetail.paused.at && (
                            <div className="small text-muted">
                                <i className="fa-solid fa-circle-pause me-1"></i>
                                Paused since {when(slaDetail.paused.at)}
                            </div>
                        )}
                        {slaDetail.calendar && (
                            <div className="small text-muted">
                                <i className="fa-solid fa-calendar me-1"></i>
                                {slaDetail.calendar.key} · {slaDetail.calendar.timezone}
                            </div>
                        )}
                    </>
                ) : (
                    !sla.loading && <span className="text-muted small">No SLA information.</span>
                )}
            </Section>

            <Section
                title="Watchers"
                icon="fa-eye"
                count={watcherRows.length}
                loading={watchers.loading && !watchers.data}
                error={watchers.error}
                stale={watchers.stale}
                onRetry={watchers.reload}
            >
                {watcherRows.length === 0 && !watchers.loading && (
                    <div className="text-muted small mb-2">Nobody is watching this ticket.</div>
                )}
                {watcherRows.length > 0 && (
                    <ul className="list-unstyled mb-2 small">
                        {watcherRows.map((w) => (
                            <li key={w.documentId || (w.user && w.user.id)} className="d-flex align-items-center gap-2 mb-1">
                                <i className="fa-solid fa-user text-muted"></i>
                                <span>{w.user_label || (w.user && (w.user.display_name || w.user.username)) || `#${w.user && w.user.id}`}</span>
                                {w.user && w.user.id && (
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-link text-danger ms-auto p-0"
                                        disabled={watcherBusy}
                                        onClick={() => runWatcher(() => HelpdeskTicketsEndpoints.removeWatcher(documentId, w.user.id))}
                                        title="Remove watcher"
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                <button
                    type="button"
                    className={`btn btn-sm w-100 mb-2 ${watchingSelf ? "btn-outline-secondary" : "btn-outline-primary"}`}
                    disabled={watcherBusy || !documentId}
                    onClick={watchingSelf ? removeSelf : addSelf}
                >
                    <i className={`fa-solid ${watchingSelf ? "fa-eye-slash" : "fa-eye"} me-1`}></i>
                    {watchingSelf ? "Stop watching" : "Watch this ticket"}
                </button>

                <form className="input-group input-group-sm" onSubmit={addOther}>
                    {/* The watcher table keys on the UP user id, not a documentId
                        — the service compares it numerically, so anything else
                        silently matches nothing. */}
                    <input
                        className="form-control"
                        placeholder="Add watcher by user id"
                        value={watcherId}
                        onChange={(e) => setWatcherId(e.target.value)}
                        inputMode="numeric"
                        aria-label="Add watcher by user id"
                    />
                    <button className="btn btn-outline-secondary" type="submit" disabled={watcherBusy || !watcherId.trim()}>
                        Add
                    </button>
                </form>
                {watcherError && <div className="text-danger small mt-1">{watcherError}</div>}
            </Section>

            <Section
                title="Activity"
                icon="fa-clock-rotate-left"
                count={activityRows.length}
                loading={activity.loading && !activity.data}
                error={activity.error}
                stale={activity.stale}
                onRetry={activity.reload}
            >
                {activityRows.length === 0 && !activity.loading && (
                    <span className="text-muted small">No recorded activity.</span>
                )}
                {activityRows.length > 0 && (
                    <ul className="list-unstyled mb-0 small">
                        {activityRows.map((row) => (
                            <li key={row.documentId || row.id} className="mb-2">
                                <div>
                                    <i className={`fa-solid ${ACTIVITY_ICON[row.kind] || "fa-note-sticky"} me-2 text-muted`}></i>
                                    <span>{row.summary || row.kind}</span>
                                </div>
                                <div className="text-muted ms-4">
                                    {row.actor_label || "System"} · {when(row.createdAt)}
                                    {row.from_value || row.to_value
                                        ? ` · ${row.from_value || "—"} → ${row.to_value || "—"}`
                                        : ""}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Section>

            {desk && (
                <Section title="Desk" icon="fa-inbox">
                    <dl className="row mb-0 small">
                        <dt className="col-5 text-muted fw-normal">Name</dt>
                        <dd className="col-7 mb-1">{desk.name}</dd>
                        <dt className="col-5 text-muted fw-normal">Key</dt>
                        <dd className="col-7 mb-1">{desk.key}</dd>
                        {desk.require_resolution_note && (
                            <dd className="col-12 mb-0 text-muted">
                                <i className="fa-solid fa-circle-info me-1"></i>
                                A resolution note is required on this desk.
                            </dd>
                        )}
                    </dl>
                </Section>
            )}
        </div>
    );
}
