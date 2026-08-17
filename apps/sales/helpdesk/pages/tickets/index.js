import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import ListPageLayout from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import { HelpdeskTicketsEndpoints, HelpdeskDesksEndpoints } from "@rutba/api-provider/endpoints";
import TicketFilters, {
    agentLabel,
    buildTicketFilters,
    hasActiveFilters,
    readFilterState,
} from "../../components/TicketFilters";
import SlaChip, { formatRelativeTime } from "../../components/SlaChip";
import StatusBadge, { PriorityBadge, humanizeToken } from "../../components/StatusBadge";

// Core clamps pageSize at MAX_LIST_PAGE_SIZE (100); offering 200 would silently
// serve 100 and make the page arithmetic lie. MAX_BULK is also 100, so a
// full-page selection is always inside the bulk limit.
const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const POLL_MS = 60_000;
const CLOCK_MS = 30_000;

/**
 * Default order: SLA urgency, then age.
 *
 * The list API sorts by column, and neither `sla_state` nor `priority` is
 * stored as anything but a string enum — so a CASE ordering is not expressible
 * over this contract. Sorting `sla_state` ascending happens to land on the
 * order that is operationally right anyway: at_risk (still saveable) →
 * breached → indeterminate → ok → paused, with the soonest deadline first
 * inside each band. Priority is deliberately NOT in the default sort: its
 * alphabetical order is high, low, normal, urgent, which is not its urgency
 * order, and a sort that claims to rank urgency while doing nothing of the kind
 * is worse than no sort at all. It is offered as a filter instead.
 */
const DEFAULT_SORT = ["sla_state:asc", "resolution_due_at:asc", "createdAt:asc"];

// Only scalar columns: the documents layer throws on a sort it cannot map, and
// a crafted URL must degrade to the default rather than 500 the queue.
const SORTABLE = {
    ticket_no: "ticket_no",
    subject: "subject",
    sla: "resolution_due_at",
    activity: "updatedAt",
    created: "createdAt",
};

function errorText(err) {
    return err?.response?.data?.error?.message
        || err?.response?.data?.message
        || err?.message
        || "Something went wrong.";
}

function uniqueValues(rows, key) {
    const out = [];
    for (const row of rows) {
        const v = row?.[key];
        if (v && !out.includes(v)) out.push(v);
    }
    return out;
}

/**
 * The list handler populates person and employee with an id-only projection, so
 * a named requester is only available when the ticket is linked to a portal
 * user. The reference is shown rather than a bare dash so the row still says
 * who it is about.
 */
function requesterLabel(ticket) {
    if (ticket.user) return ticket.user.username || ticket.user.email || `User #${ticket.user.id}`;
    if (ticket.person_id) return `Person #${ticket.person_id}`;
    if (ticket.employee_id) return `Employee #${ticket.employee_id}`;
    return ticket.requester_kind ? humanizeToken(ticket.requester_kind) : "—";
}

function parseSort(raw) {
    if (typeof raw !== "string" || !raw) return null;
    const [key, dir] = raw.split(":");
    if (!SORTABLE[key]) return null;
    return { key, dir: dir === "desc" ? "desc" : "asc" };
}

function SortHeader({ colKey, label, sort, onSort, className }) {
    const active = sort?.key === colKey;
    const icon = active
        ? (sort.dir === "asc" ? "fa-arrow-up-short-wide" : "fa-arrow-down-wide-short")
        : "fa-sort opacity-25";
    return (
        <th scope="col" className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
            <button
                type="button"
                className="btn btn-sm btn-link p-0 text-reset text-decoration-none fw-semibold"
                onClick={() => onSort(colKey)}
            >
                {label}
                <i className={`fa-solid ms-1 ${icon}`} aria-hidden="true"></i>
            </button>
        </th>
    );
}

/**
 * Skeleton rows carry the same responsive visibility classes as the real
 * columns — otherwise the loading state shows twelve cells against a header
 * showing seven, and the table looks broken exactly when it is working.
 */
function SkeletonRows({ rows = 8, columns }) {
    return (
        <>
            {Array.from({ length: rows }).map((_, r) => (
                <tr key={r} className="placeholder-glow">
                    {columns.map(([width, className], c) => (
                        <td key={c} className={className}>
                            <span className="placeholder" style={{ width }}></span>
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

function EmptyState({ icon, title, children }) {
    return (
        <div className="text-center text-muted py-5 px-3">
            <i className={`fa-solid ${icon} fa-2x mb-3 d-block opacity-50`} aria-hidden="true"></i>
            <h6 className="text-body">{title}</h6>
            <div className="small">{children}</div>
        </div>
    );
}

export default function TicketQueue() {
    const router = useRouter();
    const { jwt, user } = useAuth();
    const userId = user?.id ?? null;

    const [rows, setRows] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fetchedAt, setFetchedAt] = useState(null);

    const [desks, setDesks] = useState([]);
    const [desksLoading, setDesksLoading] = useState(true);
    const [desksLoaded, setDesksLoaded] = useState(false);

    const [selected, setSelected] = useState([]);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [bulkResult, setBulkResult] = useState(null);
    const [assignPick, setAssignPick] = useState("");

    // One clock for the whole page — 25 self-ticking SLA chips would be 25
    // intervals doing the same arithmetic.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), CLOCK_MS);
        return () => clearInterval(id);
    }, []);

    // Query string is the single source of filter truth, so the URL is always
    // shareable and a refresh lands on the same queue.
    const filters = useMemo(() => readFilterState(router.query), [
        router.query.view, router.query.desk, router.query.status, router.query.priority,
        router.query.assignee, router.query.sla, router.query.q, router.query.resolvedSince,
    ]);

    const page = Math.max(1, parseInt(router.query.page, 10) || 1);
    const pageSize = PAGE_SIZES.includes(parseInt(router.query.pageSize, 10))
        ? parseInt(router.query.pageSize, 10)
        : DEFAULT_PAGE_SIZE;
    const sort = useMemo(() => parseSort(router.query.sort), [router.query.sort]);

    const sortParam = useMemo(() => (
        sort ? [`${SORTABLE[sort.key]}:${sort.dir}`, "createdAt:desc"] : DEFAULT_SORT
    ), [sort]);

    // "Mine" is meaningless before the profile resolves, and firing without the
    // id would quietly return everyone's open tickets under a "My Open" pill.
    const needsUser = filters.view === "mine" || filters.assignee === "me";
    const ready = router.isReady && !!jwt && (!needsUser || !!userId);

    const listParams = useMemo(() => ({
        page,
        pageSize,
        sort: sortParam,
        filters: buildTicketFilters({ ...filters, userId }),
    }), [page, pageSize, sortParam, filters, userId]);

    const load = useCallback(async ({ silent } = {}) => {
        if (!silent) setLoading(true);
        try {
            const res = await HelpdeskTicketsEndpoints.list(listParams);
            setRows(res?.data || []);
            setPagination(res?.meta?.pagination || null);
            setFetchedAt(Date.now());
            setError(null);
        } catch (err) {
            // Stale-data-wins: a failed refresh must never wipe the queue an
            // agent is working from. The banner says what happened instead.
            setError(err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [listParams]);

    useEffect(() => {
        if (!ready) return;
        load();
    }, [ready, load]);

    useEffect(() => { setSelected([]); }, [listParams]);

    useEffect(() => {
        if (!jwt) return;
        setDesksLoading(true);
        HelpdeskDesksEndpoints.list({})
            .then((res) => setDesks(Array.isArray(res?.data) ? res.data : []))
            .catch(() => setDesks([]))
            .finally(() => { setDesksLoading(false); setDesksLoaded(true); });
    }, [jwt]);

    // 60s refresh, paused while the tab is hidden (spec 6.3).
    useEffect(() => {
        if (!ready) return;
        const id = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            load({ silent: true });
        }, POLL_MS);
        return () => clearInterval(id);
    }, [ready, load]);

    /**
     * Assignees are harvested from the rows already on screen and kept for the
     * session. There is no desk-membership endpoint yet, so this is the only
     * honest agent directory available — and "people already working in this
     * queue" is usually the set you want to hand a ticket to anyway.
     */
    const [agentPool, setAgentPool] = useState([]);
    useEffect(() => {
        if (!rows.length) return;
        setAgentPool((prev) => {
            const byId = new Map(prev.map((a) => [a.id, a]));
            let changed = false;
            for (const t of rows) {
                const a = t.assigned_to;
                if (a && a.id != null && !byId.has(a.id)) { byId.set(a.id, a); changed = true; }
            }
            if (!changed) return prev;
            return [...byId.values()].sort((x, y) => agentLabel(x).localeCompare(agentLabel(y)));
        });
    }, [rows]);

    const deskById = useMemo(() => new Map(desks.map((d) => [String(d.id), d])), [desks]);
    const observed = useMemo(() => ({
        status: uniqueValues(rows, "status"),
        priority: uniqueValues(rows, "priority"),
        sla_state: uniqueValues(rows, "sla_state"),
    }), [rows]);

    const pushQuery = useCallback((next) => {
        const query = {};
        for (const [k, v] of Object.entries(next)) {
            if (v === "" || v === undefined || v === null) continue;
            query[k] = String(v);
        }
        router.push({ pathname: "/tickets", query }, undefined, { shallow: true });
    }, [router]);

    // Anything that changes the result set returns to page 1 — staying on page 7
    // of a list that just shrank to two pages is how a filter looks broken.
    const applyState = useCallback((nextFilters, overrides = {}) => {
        const nextPage = overrides.page ?? 1;
        const nextSize = overrides.pageSize ?? pageSize;
        const nextSort = overrides.sort !== undefined ? overrides.sort : (router.query.sort || "");
        pushQuery({
            ...nextFilters,
            view: nextFilters.view === "all" ? "" : nextFilters.view,
            page: nextPage === 1 ? "" : nextPage,
            pageSize: nextSize === DEFAULT_PAGE_SIZE ? "" : nextSize,
            sort: nextSort,
        });
    }, [pushQuery, pageSize, router.query.sort]);

    const onSort = (colKey) => {
        let nextSort = "";
        if (!sort || sort.key !== colKey) nextSort = `${colKey}:asc`;
        else if (sort.dir === "asc") nextSort = `${colKey}:desc`;
        // Third click clears back to the SLA-urgency default.
        applyState(filters, { sort: nextSort });
    };

    const goPage = (nextPage) => applyState(filters, { page: nextPage });
    const goPageSize = (nextSize) => applyState(filters, { pageSize: nextSize });

    const clearFilters = () => router.push({ pathname: "/tickets" }, undefined, { shallow: true });

    const toggleRow = (documentId) => setSelected((prev) => (
        prev.includes(documentId) ? prev.filter((id) => id !== documentId) : [...prev, documentId]
    ));
    const allOnPageSelected = rows.length > 0 && rows.every((t) => selected.includes(t.documentId));
    const toggleAll = () => setSelected(allOnPageSelected ? [] : rows.map((t) => t.documentId));

    const afterMutation = async () => {
        setSelected([]);
        await load({ silent: true });
    };

    const runRowAction = async (fn) => {
        setBusy(true);
        setActionError(null);
        try {
            await fn();
            await afterMutation();
        } catch (err) {
            setActionError(errorText(err));
        } finally {
            setBusy(false);
        }
    };

    const claim = (ticket) => runRowAction(() => HelpdeskTicketsEndpoints.runClaim(ticket.documentId, {}));
    const assign = (ticket, assigneeId) => runRowAction(
        () => HelpdeskTicketsEndpoints.assignTicket(ticket.documentId, { assignee_id: assigneeId })
    );

    /**
     * Bulk is authorised per ticket on the server, so the answer is a list of
     * outcomes, not a success or a failure. The summary below renders every
     * refusal with its ticket number — "3 of 12 failed" with no names would
     * leave an agent no way to find out which three.
     */
    const runBulk = async (action, extra = {}, confirmText) => {
        if (!selected.length) return;
        if (confirmText && !window.confirm(confirmText)) return;
        const labels = Object.fromEntries(rows.map((t) => [t.documentId, t.ticket_no || t.documentId]));
        setBusy(true);
        setActionError(null);
        setBulkResult(null);
        try {
            const res = await HelpdeskTicketsEndpoints.runBulk({ action, tickets: selected, ...extra });
            setBulkResult({ ...(res?.data || {}), labels });
            setAssignPick("");
            await afterMutation();
        } catch (err) {
            setActionError(errorText(err));
        } finally {
            setBusy(false);
        }
    };

    const total = pagination?.total ?? null;
    const filtersActive = hasActiveFilters(filters);
    const isStale = Boolean(error && rows.length);
    const isFatal = Boolean(error && !rows.length && !loading);
    // The desk list is the only signal available for "this user can reach no
    // desk": the ticket list answers an empty page identically either way.
    const noDeskAccess = desksLoaded && desks.length === 0;

    const headerActions = (
        <>
            <span className="text-muted small">
                {fetchedAt ? `Updated ${formatRelativeTime(fetchedAt, now)}` : ""}
            </span>
            <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => load({ silent: true })}
                disabled={!ready}
            >
                <i className="fa-solid fa-rotate me-1"></i>Refresh
            </button>
            <Link href="/tickets/new" className="btn btn-sm btn-primary">
                <i className="fa-solid fa-plus me-1"></i>New ticket
            </Link>
        </>
    );

    const bulkActions = (
        <>
            <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={busy}
                onClick={() => runBulk("claim")}
            >
                <i className="fa-solid fa-hand me-1"></i>Claim
            </button>

            <div className="d-flex align-items-center gap-1">
                <select
                    className="form-select form-select-sm"
                    style={{ width: 200 }}
                    value={assignPick}
                    onChange={(e) => setAssignPick(e.target.value)}
                    aria-label="Assign selected tickets to"
                >
                    <option value="">Assign to…</option>
                    {agentPool.map((a) => <option key={a.id} value={a.id}>{agentLabel(a)}</option>)}
                </select>
                <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={busy || !assignPick}
                    onClick={() => runBulk("assign", { assignee_id: Number(assignPick) })}
                >
                    Assign
                </button>
            </div>

            <button
                type="button"
                className="btn btn-sm btn-outline-success"
                disabled={busy}
                onClick={() => runBulk("close", {}, `Close ${selected.length} ticket(s)?`)}
            >
                <i className="fa-solid fa-lock me-1"></i>Close
            </button>
            <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                disabled={busy}
                onClick={() => runBulk("cancel", {}, `Cancel ${selected.length} ticket(s)? Tickets are never deleted, only cancelled.`)}
            >
                <i className="fa-solid fa-ban me-1"></i>Cancel
            </button>
            {busy && <span className="spinner-border spinner-border-sm" role="status" aria-label="Working"></span>}
        </>
    );

    // One [width, responsive class] per <th> below — checkbox, ten data
    // columns, actions. Keep in step with the header and the row.
    const skeletonWidths = [
        ["60%", ""],
        ["70%", "text-nowrap"],
        ["90%", ""],
        ["80%", "d-none d-xl-table-cell"],
        ["70%", "d-none d-lg-table-cell"],
        ["60%", ""],
        ["60%", "d-none d-md-table-cell"],
        ["80%", ""],
        ["70%", "d-none d-lg-table-cell"],
        ["60%", "d-none d-xl-table-cell"],
        ["60%", "d-none d-xl-table-cell"],
        ["50%", "text-end"],
    ];

    let body;
    if (loading) {
        body = (
            <tbody>
                <SkeletonRows rows={Math.min(pageSize, 8)} columns={skeletonWidths} />
            </tbody>
        );
    } else if (rows.length === 0) {
        body = (
            <tbody>
                <tr>
                    <td colSpan={skeletonWidths.length} className="p-0">
                        {noDeskAccess ? (
                            <EmptyState icon="fa-user-lock" title="You are not a member of any desk yet">
                                Tickets are scoped to desks. Ask a helpdesk admin to add you to one,
                                and this queue will fill itself.
                            </EmptyState>
                        ) : filtersActive ? (
                            <EmptyState icon="fa-filter-circle-xmark" title="No tickets match">
                                <button type="button" className="btn btn-sm btn-outline-secondary mt-2" onClick={clearFilters}>
                                    Clear filters
                                </button>
                            </EmptyState>
                        ) : (
                            <EmptyState icon="fa-ticket" title="No tickets yet">
                                Tickets arrive from the portal, email and the storefront, or an agent
                                logs one on a requester&apos;s behalf. Check the desks are configured
                                on the <Link href="/desks">Desks</Link> page.
                            </EmptyState>
                        )}
                    </td>
                </tr>
            </tbody>
        );
    } else {
        body = (
            <tbody>
                {rows.map((t) => {
                    const desk = deskById.get(String(t.desk_id));
                    const checked = selected.includes(t.documentId);
                    const canClaim = t.assigned_to_id !== userId;
                    return (
                        <tr
                            key={t.documentId}
                            className={checked ? "table-active" : ""}
                            style={{ cursor: "pointer" }}
                            onClick={() => router.push(`/tickets/${t.documentId}`)}
                        >
                            <td onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={checked}
                                    onChange={() => toggleRow(t.documentId)}
                                    aria-label={`Select ${t.ticket_no || t.subject}`}
                                />
                            </td>
                            <td className="text-nowrap"><code>{t.ticket_no || "—"}</code></td>
                            <td className="text-truncate" style={{ maxWidth: 320 }} title={t.subject}>
                                {t.subject}
                            </td>
                            <td className="text-truncate d-none d-xl-table-cell" style={{ maxWidth: 160 }}>
                                {requesterLabel(t)}
                            </td>
                            <td className="d-none d-lg-table-cell">{desk?.name || desk?.key || "—"}</td>
                            <td><StatusBadge status={t.status} /></td>
                            <td className="d-none d-md-table-cell"><PriorityBadge priority={t.priority} /></td>
                            <td>
                                <SlaChip
                                    state={t.sla_state}
                                    dueAt={t.resolution_due_at || t.sla_due_at}
                                    now={now}
                                />
                            </td>
                            <td className="d-none d-lg-table-cell text-truncate" style={{ maxWidth: 140 }}>
                                {t.assigned_to ? agentLabel(t.assigned_to) : <span className="text-muted">Unassigned</span>}
                            </td>
                            <td className="text-nowrap d-none d-xl-table-cell small text-muted">
                                {formatRelativeTime(t.last_reply_at || t.updatedAt, now)}
                            </td>
                            <td className="text-nowrap d-none d-xl-table-cell small text-muted">
                                {formatRelativeTime(t.createdAt, now)}
                            </td>
                            <td className="text-end text-nowrap" onClick={(e) => e.stopPropagation()}>
                                {canClaim && (
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-primary me-1"
                                        disabled={busy}
                                        onClick={() => claim(t)}
                                        title="Assign this ticket to me"
                                    >
                                        Claim
                                    </button>
                                )}
                                {/* A native select, not a Bootstrap dropdown: a
                                    dropdown menu inside .table-responsive is
                                    clipped by the scroll container, and the
                                    browser renders a select's list above it. */}
                                <select
                                    className="form-select form-select-sm d-inline-block w-auto"
                                    value=""
                                    disabled={busy || agentPool.length === 0}
                                    onChange={(e) => e.target.value && assign(t, Number(e.target.value))}
                                    aria-label={`Assign ${t.ticket_no || t.subject} to an agent`}
                                    title={agentPool.length === 0 ? "No agents seen in this queue yet" : "Assign to an agent"}
                                >
                                    <option value="">Assign…</option>
                                    {agentPool.map((a) => (
                                        <option key={a.id} value={a.id}>{agentLabel(a)}</option>
                                    ))}
                                </select>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        );
    }

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <ListPageLayout
                    title="Ticket queue"
                    subtitle={total !== null ? `${total.toLocaleString()} ticket(s) in this view` : undefined}
                    headerActions={headerActions}
                    selectedCount={selected.length}
                    bulkActions={bulkActions}
                    filters={
                        <TicketFilters
                            state={filters}
                            onChange={(next) => applyState(next)}
                            onClear={clearFilters}
                            desks={desks}
                            desksLoading={desksLoading}
                            agents={agentPool}
                            observed={observed}
                            userId={userId}
                        />
                    }
                    pagination={
                        <ListPagination
                            page={page}
                            pageSize={pageSize}
                            total={total ?? undefined}
                            onPage={goPage}
                            onPageSize={goPageSize}
                            pageSizeOptions={PAGE_SIZES}
                        />
                    }
                >
                    {isStale && (
                        <div className="alert alert-warning m-3 py-2 small d-flex align-items-center gap-2">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                            <span>
                                Showing tickets from {formatRelativeTime(fetchedAt, now)} — the last refresh
                                failed ({errorText(error)}).
                            </span>
                        </div>
                    )}

                    {actionError && (
                        <div className="alert alert-danger m-3 py-2 small d-flex align-items-start gap-2">
                            <i className="fa-solid fa-circle-exclamation mt-1"></i>
                            <span className="flex-grow-1">{actionError}</span>
                            <button type="button" className="btn-close" onClick={() => setActionError(null)} aria-label="Dismiss"></button>
                        </div>
                    )}

                    {bulkResult && (
                        <div className={`alert ${bulkResult.failed ? "alert-warning" : "alert-success"} m-3 py-2 small`}>
                            <div className="d-flex align-items-start gap-2">
                                <span className="flex-grow-1">
                                    <strong>
                                        {(bulkResult.total || 0) - (bulkResult.failed || 0)} of {bulkResult.total || 0} succeeded.
                                    </strong>
                                    {bulkResult.failed > 0 && (
                                        <ul className="mb-0 mt-1">
                                            {(bulkResult.results || []).filter((r) => !r.ok).map((r) => (
                                                <li key={r.ticket}>
                                                    <code>{bulkResult.labels?.[r.ticket] || r.ticket}</code> — {r.error}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </span>
                                <button type="button" className="btn-close" onClick={() => setBulkResult(null)} aria-label="Dismiss"></button>
                            </div>
                        </div>
                    )}

                    {isFatal ? (
                        <div className="p-4">
                            <div className="alert alert-danger mb-2">
                                <strong>Could not load the queue.</strong>
                                <div className="small mt-1">{errorText(error)}</div>
                            </div>
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => load()}>
                                Retry
                            </button>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table table-hover align-middle mb-0">
                                <thead className="table-light">
                                    <tr>
                                        <th scope="col" style={{ width: 36 }}>
                                            <input
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={allOnPageSelected}
                                                onChange={toggleAll}
                                                disabled={rows.length === 0}
                                                aria-label="Select all on this page"
                                            />
                                        </th>
                                        <SortHeader colKey="ticket_no" label="Ticket" sort={sort} onSort={onSort} className="text-nowrap" />
                                        <SortHeader colKey="subject" label="Subject" sort={sort} onSort={onSort} />
                                        <th scope="col" className="d-none d-xl-table-cell">Requester</th>
                                        <th scope="col" className="d-none d-lg-table-cell">Desk</th>
                                        <th scope="col">Status</th>
                                        <th scope="col" className="d-none d-md-table-cell">Priority</th>
                                        <SortHeader colKey="sla" label="SLA" sort={sort} onSort={onSort} />
                                        <th scope="col" className="d-none d-lg-table-cell">Assignee</th>
                                        <SortHeader colKey="activity" label="Last activity" sort={sort} onSort={onSort} className="d-none d-xl-table-cell text-nowrap" />
                                        <SortHeader colKey="created" label="Created" sort={sort} onSort={onSort} className="d-none d-xl-table-cell text-nowrap" />
                                        <th scope="col" className="text-end">Actions</th>
                                    </tr>
                                </thead>
                                {body}
                            </table>
                        </div>
                    )}
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}
