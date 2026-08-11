import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HelpdeskTicketsEndpoints, HelpdeskDesksEndpoints } from "@rutba/api-provider/endpoints";
import { agentLabel, buildTicketFilters } from "../components/TicketFilters";
import SlaChip, { formatRelativeTime } from "../components/SlaChip";
import StatusBadge, { PriorityBadge } from "../components/StatusBadge";

const POLL_MS = 60_000;
const CLOCK_MS = 30_000;
const RECENT_LIMIT = 10;

/** Monday of the current week as YYYY-MM-DD. */
function startOfWeek(date = new Date()) {
    const mondayOffset = (date.getDay() + 6) % 7;
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * There is no aggregate dashboard endpoint yet (spec 20.9 designs one), so each
 * tile is a list call with its own filter and pageSize 1 — the row payload is
 * discarded and only meta.pagination.total is read. Core runs the count as a
 * separate COUNT query, so this is a cheap exact count rather than a page of
 * rows we throw away.
 *
 * The counts and the queue's quick views are built by the SAME
 * buildTicketFilters call, so a tile can never disagree with the list it
 * drills through to.
 */
function tileDefinitions({ userId, weekStart }) {
    return [
        {
            key: "breaching",
            title: "Breaching soon",
            // First, and the only tile that prevents a failure instead of
            // reporting one — everything below it is already history.
            hint: "At risk or already breached",
            icon: "fa-triangle-exclamation",
            tone: "danger",
            href: "/tickets?view=breaching",
            filters: buildTicketFilters({ view: "breaching" }),
        },
        {
            key: "mine",
            title: "My open",
            hint: "Assigned to me, still open",
            icon: "fa-user-check",
            tone: "primary",
            href: "/tickets?view=mine",
            needsUser: true,
            filters: buildTicketFilters({ view: "mine", userId }),
        },
        {
            key: "unassigned",
            title: "Unassigned",
            hint: "Open and claimable",
            icon: "fa-inbox",
            tone: "warning",
            href: "/tickets?view=unassigned",
            filters: buildTicketFilters({ view: "unassigned" }),
        },
        {
            key: "waiting",
            title: "Awaiting customer",
            hint: "Clock paused on the requester",
            icon: "fa-hourglass-half",
            tone: "secondary",
            href: "/tickets?view=waiting",
            filters: buildTicketFilters({ view: "waiting" }),
        },
        {
            key: "resolved",
            title: "Resolved this week",
            hint: `Since ${weekStart}`,
            icon: "fa-circle-check",
            tone: "success",
            href: `/tickets?resolvedSince=${weekStart}&sort=activity%3Adesc`,
            filters: buildTicketFilters({ resolvedSince: weekStart }),
        },
    ];
}

function StatTile({ tile, count, loading, failed }) {
    return (
        <div className="col">
            <Link href={tile.href} className="text-decoration-none">
                <div className={`card h-100 border-${tile.tone} border-2`}>
                    <div className="card-body py-3">
                        <div className="d-flex align-items-center gap-2 mb-1">
                            <i className={`fa-solid ${tile.icon} text-${tile.tone}`} aria-hidden="true"></i>
                            <span className="text-body fw-semibold small">{tile.title}</span>
                        </div>
                        {loading ? (
                            <span className="placeholder-glow d-block">
                                <span className="placeholder col-5" style={{ height: "2rem" }}></span>
                            </span>
                        ) : failed ? (
                            <div className="fs-3 fw-bold text-muted" title="This count could not be loaded">
                                —
                            </div>
                        ) : (
                            <div className={`fs-3 fw-bold text-${tile.tone}`}>{count.toLocaleString()}</div>
                        )}
                        <div className="text-muted small">
                            {failed ? "Count unavailable" : tile.hint}
                        </div>
                    </div>
                </div>
            </Link>
        </div>
    );
}

export default function Dashboard() {
    const router = useRouter();
    const { jwt, user } = useAuth();
    const userId = user?.id ?? null;

    const [counts, setCounts] = useState({});
    const [countsLoading, setCountsLoading] = useState(true);
    const [recent, setRecent] = useState([]);
    const [recentLoading, setRecentLoading] = useState(true);
    const [recentError, setRecentError] = useState(null);
    const [desks, setDesks] = useState([]);
    const [desksLoaded, setDesksLoaded] = useState(false);
    const [fetchedAt, setFetchedAt] = useState(null);

    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), CLOCK_MS);
        return () => clearInterval(id);
    }, []);

    const weekStart = useMemo(() => startOfWeek(), []);
    const tiles = useMemo(() => tileDefinitions({ userId, weekStart }), [userId, weekStart]);

    const load = useCallback(async ({ silent } = {}) => {
        if (!silent) { setCountsLoading(true); setRecentLoading(true); }

        // allSettled, not all: one tile failing must not blank the other four
        // (spec 38.7 — render what loaded, mark what failed).
        const countResults = await Promise.allSettled(
            tiles.map((t) => (
                t.needsUser && !userId
                    ? Promise.reject(new Error("no user"))
                    : HelpdeskTicketsEndpoints.list({ page: 1, pageSize: 1, filters: t.filters })
            ))
        );

        const next = {};
        tiles.forEach((t, i) => {
            const r = countResults[i];
            next[t.key] = r.status === "fulfilled"
                ? { value: r.value?.meta?.pagination?.total ?? 0, failed: false }
                : { value: null, failed: true };
        });
        setCounts(next);
        setCountsLoading(false);

        try {
            const res = await HelpdeskTicketsEndpoints.list({
                page: 1,
                pageSize: RECENT_LIMIT,
                sort: ["updatedAt:desc"],
            });
            setRecent(res?.data || []);
            setRecentError(null);
            setFetchedAt(Date.now());
        } catch (err) {
            // Stale-data-wins: keep whatever is on screen and say it is old.
            setRecentError(err);
        } finally {
            setRecentLoading(false);
        }
    }, [tiles, userId]);

    useEffect(() => {
        if (!jwt) return;
        load();
    }, [jwt, load]);

    useEffect(() => {
        if (!jwt) return;
        HelpdeskDesksEndpoints.list({})
            .then((res) => setDesks(Array.isArray(res?.data) ? res.data : []))
            .catch(() => setDesks([]))
            .finally(() => setDesksLoaded(true));
    }, [jwt]);

    useEffect(() => {
        if (!jwt) return;
        const id = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            load({ silent: true });
        }, POLL_MS);
        return () => clearInterval(id);
    }, [jwt, load]);

    const deskById = useMemo(() => new Map(desks.map((d) => [String(d.id), d])), [desks]);
    const noDeskAccess = desksLoaded && desks.length === 0;
    const isStale = Boolean(recentError && recent.length);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1">
                    <h2 className="mb-0">Helpdesk</h2>
                    <div className="d-flex align-items-center gap-2">
                        <span className="text-muted small">
                            {fetchedAt ? `Updated ${formatRelativeTime(fetchedAt, now)}` : ""}
                        </span>
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => load({ silent: true })}
                            disabled={!jwt}
                        >
                            <i className="fa-solid fa-rotate me-1"></i>Refresh
                        </button>
                    </div>
                </div>
                <p className="text-muted mb-4">
                    What needs attention now. Every tile opens the queue already filtered.
                </p>

                {noDeskAccess ? (
                    <div className="card">
                        <div className="card-body text-center text-muted py-5">
                            <i className="fa-solid fa-user-lock fa-2x mb-3 d-block opacity-50" aria-hidden="true"></i>
                            <h6 className="text-body">You are not a member of any desk yet</h6>
                            <div className="small">
                                Helpdesk tickets are scoped to desks. Ask a helpdesk admin to add you to
                                one and this dashboard will start reporting.
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-5 g-3 mb-4">
                            {tiles.map((t) => (
                                <StatTile
                                    key={t.key}
                                    tile={t}
                                    count={counts[t.key]?.value ?? 0}
                                    failed={counts[t.key]?.failed}
                                    loading={countsLoading}
                                />
                            ))}
                        </div>

                        <div className="card">
                            <div className="card-header d-flex justify-content-between align-items-center">
                                <strong>Recently updated</strong>
                                <Link className="small" href="/tickets?sort=activity%3Adesc">
                                    Open the queue
                                </Link>
                            </div>

                            {isStale && (
                                <div className="alert alert-warning m-3 py-2 small mb-0">
                                    <i className="fa-solid fa-triangle-exclamation me-1"></i>
                                    Showing tickets from {formatRelativeTime(fetchedAt, now)} — the last refresh failed.
                                </div>
                            )}

                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th scope="col" className="text-nowrap">Ticket</th>
                                            <th scope="col">Subject</th>
                                            <th scope="col" className="d-none d-lg-table-cell">Desk</th>
                                            <th scope="col">Status</th>
                                            <th scope="col" className="d-none d-md-table-cell">Priority</th>
                                            <th scope="col">SLA</th>
                                            <th scope="col" className="d-none d-lg-table-cell">Assignee</th>
                                            <th scope="col" className="text-nowrap d-none d-md-table-cell">Updated</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentLoading && Array.from({ length: 5 }).map((_, i) => (
                                            <tr key={i} className="placeholder-glow">
                                                {["60%", "90%", "70%", "60%", "60%", "80%", "70%", "50%"].map((w, c) => (
                                                    <td key={c}><span className="placeholder" style={{ width: w }}></span></td>
                                                ))}
                                            </tr>
                                        ))}

                                        {!recentLoading && recent.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className="text-center text-muted py-5">
                                                    <i className="fa-solid fa-ticket fa-2x mb-3 d-block opacity-50" aria-hidden="true"></i>
                                                    <div className="text-body">No tickets yet</div>
                                                    <div className="small">
                                                        Tickets arrive from the portal, email and the storefront, or an
                                                        agent logs one on a requester&apos;s behalf.
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        {!recentLoading && recent.map((t) => {
                                            const desk = deskById.get(String(t.desk_id));
                                            return (
                                                <tr
                                                    key={t.documentId}
                                                    style={{ cursor: "pointer" }}
                                                    onClick={() => router.push(`/tickets/${t.documentId}`)}
                                                >
                                                    <td className="text-nowrap"><code>{t.ticket_no || "—"}</code></td>
                                                    <td className="text-truncate" style={{ maxWidth: 320 }} title={t.subject}>
                                                        {t.subject}
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
                                                    <td className="text-nowrap small text-muted d-none d-md-table-cell">
                                                        {formatRelativeTime(t.last_reply_at || t.updatedAt, now)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
