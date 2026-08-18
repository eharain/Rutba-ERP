import { useEffect, useMemo, useRef, useState } from "react";
import { useEnumValues } from "@rutba/shared/lib/use-enum-values";
import { humanizeToken } from "./StatusBadge";

/**
 * Queue filter bar, plus the filter model the dashboard shares with it.
 *
 * Everything the user picks lives in the query string (see readFilterState),
 * so a filtered queue is a link an agent can paste into a chat, and a refresh
 * lands on the same view. buildTicketFilters turns that state into the Strapi
 * filter dialect the Core list handler speaks; both this bar and the dashboard
 * tiles go through it so a tile's count and its drill-through can never
 * disagree.
 *
 * WHY THE VIEW PRESETS NAME STATUSES. The picker options below are never
 * hardcoded — they come from /enums with the values present in the loaded page
 * as a fallback. The view presets are a different thing: they are named
 * business questions ("what is still open and mine?") and there is no way to
 * ask them without referring to the lifecycle. They are written as $notIn over
 * the CLOSED set rather than $in over an open set on purpose — a tenant that
 * invents a new stage still maps it to one of the seven canonical statuses
 * (RULE-3), and a new one would show up in "My Open" rather than silently
 * disappearing from every agent's queue.
 */

const CLOSED_STATUSES = ["resolved", "closed", "cancelled", "merged"];
const OPEN_WORK = { status: { $notIn: CLOSED_STATUSES } };

export const TICKET_VIEWS = [
    { key: "mine",       label: "My Open",          icon: "fa-user-check",         needsUser: true },
    { key: "unassigned", label: "Unassigned",       icon: "fa-inbox" },
    { key: "breaching",  label: "Breaching",        icon: "fa-triangle-exclamation" },
    { key: "waiting",    label: "Awaiting Customer", icon: "fa-hourglass-half" },
    { key: "all",        label: "All",              icon: "fa-list" },
];

const VIEW_KEYS = new Set(TICKET_VIEWS.map((v) => v.key));

/** The relation form for "nobody is assigned". */
const UNASSIGNED = { assigned_to: { id: { $null: true } } };

function assignedTo(userId) {
    return { assigned_to: { id: { $eq: userId } } };
}

function viewClauses(view, userId) {
    switch (view) {
        case "mine":
            // Without a resolved user there is no "mine"; the caller gates the
            // request on userId, so an empty clause here is never reached.
            return userId ? [assignedTo(userId), OPEN_WORK] : [OPEN_WORK];
        case "unassigned":
            return [UNASSIGNED, OPEN_WORK];
        case "breaching":
            return [{ sla_state: { $in: ["at_risk", "breached"] } }, OPEN_WORK];
        case "waiting":
            return [{ status: { $eq: "waiting" } }];
        default:
            return [];
    }
}

/**
 * Filter state → Strapi filters, or undefined when nothing is constrained.
 * Every clause is AND-ed; Core AND-s the result with its own desk/branch scope.
 */
export function buildTicketFilters({ view, desk, status, priority, assignee, sla, q, resolvedSince, userId } = {}) {
    const clauses = [...viewClauses(view, userId)];

    if (desk) clauses.push({ desk_id: { $eq: desk } });
    if (status) clauses.push({ status: { $eq: status } });
    if (priority) clauses.push({ priority: { $eq: priority } });
    if (sla) clauses.push({ sla_state: { $eq: sla } });
    if (resolvedSince) clauses.push({ resolved_at: { $gte: resolvedSince } });

    if (assignee === "none") clauses.push(UNASSIGNED);
    else if (assignee === "me" && userId) clauses.push(assignedTo(userId));
    else if (assignee) clauses.push(assignedTo(assignee));

    // Subject and ticket number only. The message body is a TEXT column and a
    // leading-wildcard LIKE over it is a full scan — the queue has to stay
    // usable at 500k rows, so full-text search waits for a real index.
    if (q) {
        clauses.push({
            $or: [
                { subject: { $containsi: q } },
                { ticket_no: { $containsi: q } },
            ],
        });
    }

    if (!clauses.length) return undefined;
    return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

/** router.query → normalised filter state. Unknown values fall back, never throw. */
export function readFilterState(query = {}) {
    const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");
    const view = str(query.view);
    return {
        view: VIEW_KEYS.has(view) ? view : "all",
        desk: str(query.desk),
        status: str(query.status),
        priority: str(query.priority),
        assignee: str(query.assignee),
        sla: str(query.sla),
        q: str(query.q),
        resolvedSince: str(query.resolvedSince),
    };
}

/** True when anything beyond the "All" view narrows the list. */
export function hasActiveFilters(state) {
    if (!state) return false;
    return Boolean(
        (state.view && state.view !== "all") ||
        state.desk || state.status || state.priority ||
        state.assignee || state.sla || state.q || state.resolvedSince
    );
}

/**
 * A select whose options come from /enums for the field, with the values
 * actually present in the loaded page as a fallback. Neither source is
 * hardcoded, and the currently selected value is always offered even if it has
 * since left the enum — otherwise a shared link would silently drop its filter.
 */
function EnumFilter({ label, field, observed, value, onChange, disabled }) {
    const { values, loading, error } = useEnumValues("contact-ticket", field);

    const options = useMemo(() => {
        const out = [];
        for (const v of (Array.isArray(values) ? values : [])) if (v && !out.includes(v)) out.push(v);
        for (const v of (observed || [])) if (v && !out.includes(v)) out.push(v);
        if (value && !out.includes(value)) out.push(value);
        return out;
    }, [values, observed, value]);

    return (
        <label className="w-100">
            <span className="form-label small text-muted mb-1 d-block">{label}</span>
            <select
                className="form-select form-select-sm"
                value={value || ""}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                aria-label={label}
            >
                <option value="">Any</option>
                {options.map((v) => (
                    <option key={v} value={v}>{humanizeToken(v)}</option>
                ))}
            </select>
            {!loading && error && options.length === 0 && (
                <span className="form-text text-warning small">Options unavailable</span>
            )}
        </label>
    );
}

/** Matches Topbar's convention for naming a user: username, then email. */
export function agentLabel(agent) {
    if (!agent) return "";
    return agent.username || agent.email || `User #${agent.id}`;
}

export default function TicketFilters({
    state,
    onChange,
    onClear,
    desks = [],
    desksLoading = false,
    agents = [],
    observed = {},
    userId,
}) {
    const stateRef = useRef(state);
    stateRef.current = state;

    // The search box types into a local draft and emits on a 350ms trailing
    // edge: every emit is a server round trip, and one per keystroke would put
    // a LIKE scan on the ticket table for every letter.
    const [draft, setDraft] = useState(state.q);
    const emitted = useRef(state.q);
    const timer = useRef(null);

    useEffect(() => {
        // The query string changed under us (Clear filters, back button, a
        // pasted link) — adopt it rather than keeping a stale draft.
        if (state.q !== emitted.current) {
            emitted.current = state.q;
            setDraft(state.q);
        }
    }, [state.q]);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const cancelPending = () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    };

    // Every other control commits whatever is sitting in the search box on its
    // way out. Without this, clicking a pill mid-word either drops the half
    // typed query or fires a second request 350ms later.
    const set = (patch) => {
        cancelPending();
        emitted.current = draft;
        onChange({ ...stateRef.current, q: draft, ...patch });
    };

    const emitSearch = (value) => {
        cancelPending();
        emitted.current = value;
        onChange({ ...stateRef.current, q: value });
    };

    const onSearchChange = (value) => {
        setDraft(value);
        cancelPending();
        timer.current = setTimeout(() => emitSearch(value), 350);
    };

    return (
        <div>
            {/* Quick views — the four questions an agent actually asks, plus All. */}
            <div className="btn-group btn-group-sm flex-wrap mb-3" role="group" aria-label="Quick views">
                {TICKET_VIEWS.map((v) => {
                    const active = state.view === v.key;
                    const disabled = v.needsUser && !userId;
                    return (
                        <button
                            key={v.key}
                            type="button"
                            className={`btn ${active ? "btn-primary" : "btn-outline-primary"}`}
                            disabled={disabled}
                            aria-pressed={active}
                            // A preset owns assignee and SLA; leaving stale values
                            // behind would produce a pill that contradicts itself.
                            onClick={() => set({ view: v.key, assignee: "", sla: "" })}
                        >
                            <i className={`fa-solid ${v.icon} me-1`} aria-hidden="true"></i>
                            {v.label}
                        </button>
                    );
                })}
            </div>

            <div className="row g-2 align-items-end">
                <div className="col-12 col-lg-3">
                    <form
                        onSubmit={(e) => { e.preventDefault(); emitSearch(draft); }}
                    >
                        <label className="w-100">
                            <span className="form-label small text-muted mb-1 d-block">Search</span>
                            <div className="input-group input-group-sm">
                                <span className="input-group-text"><i className="fa-solid fa-magnifying-glass"></i></span>
                                <input
                                    className="form-control"
                                    placeholder="Subject or ticket number"
                                    value={draft}
                                    onChange={(e) => onSearchChange(e.target.value)}
                                    aria-label="Search subject or ticket number"
                                />
                            </div>
                        </label>
                    </form>
                </div>

                <div className="col-6 col-md-4 col-lg-2">
                    <label className="w-100">
                        <span className="form-label small text-muted mb-1 d-block">Desk</span>
                        <select
                            className="form-select form-select-sm"
                            value={state.desk}
                            disabled={desksLoading}
                            onChange={(e) => set({ desk: e.target.value })}
                            aria-label="Desk"
                        >
                            <option value="">{desksLoading ? "Loading…" : "Any desk"}</option>
                            {desks.map((d) => (
                                <option key={d.id} value={d.id}>{d.name || d.key}</option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="col-6 col-md-4 col-lg-2">
                    <EnumFilter
                        label="Status"
                        field="status"
                        observed={observed.status}
                        value={state.status}
                        onChange={(v) => set({ status: v })}
                    />
                </div>

                <div className="col-6 col-md-4 col-lg-2">
                    <EnumFilter
                        label="Priority"
                        field="priority"
                        observed={observed.priority}
                        value={state.priority}
                        onChange={(v) => set({ priority: v })}
                    />
                </div>

                <div className="col-6 col-md-4 col-lg-2">
                    <EnumFilter
                        label="SLA state"
                        field="sla_state"
                        observed={observed.sla_state}
                        value={state.sla}
                        onChange={(v) => set({ sla: v })}
                    />
                </div>

                <div className="col-6 col-md-4 col-lg-2">
                    <label className="w-100">
                        <span className="form-label small text-muted mb-1 d-block">Assignee</span>
                        <select
                            className="form-select form-select-sm"
                            value={state.assignee}
                            onChange={(e) => set({ assignee: e.target.value })}
                            aria-label="Assignee"
                        >
                            <option value="">Anyone</option>
                            {userId && <option value="me">Assigned to me</option>}
                            <option value="none">Unassigned</option>
                            {agents.length > 0 && (
                                <optgroup label="Agents seen in this queue">
                                    {agents.map((a) => (
                                        <option key={a.id} value={a.id}>{agentLabel(a)}</option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                    </label>
                </div>

                <div className="col-6 col-md-4 col-lg-2">
                    <label className="w-100">
                        <span className="form-label small text-muted mb-1 d-block">Resolved since</span>
                        <input
                            type="date"
                            className="form-control form-control-sm"
                            value={state.resolvedSince}
                            onChange={(e) => set({ resolvedSince: e.target.value })}
                            aria-label="Resolved since"
                        />
                    </label>
                </div>

                {hasActiveFilters(state) && (
                    <div className="col-auto">
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClear}>
                            <i className="fa-solid fa-xmark me-1"></i>Clear filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
