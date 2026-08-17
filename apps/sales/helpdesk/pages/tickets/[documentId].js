import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isEffectiveAdmin, isActiveManagerRole } from "@rutba/pos-shared/lib/roles";
import { HelpdeskTicketsEndpoints, HelpdeskDesksEndpoints } from "@rutba/api-provider/endpoints";
import StatusBadge, { PriorityBadge } from "../../components/StatusBadge";
import SlaChip from "../../components/SlaChip";
import TicketThread from "../../components/TicketThread";
import MessageComposer from "../../components/MessageComposer";
import TicketSidePanel from "../../components/TicketSidePanel";
import TicketActions from "../../components/TicketActions";

// One request covers essentially every real ticket; the server caps a page at
// 200 anyway. Threads longer than that page backwards from the newest end.
const PAGE_SIZE = 200;
const POLL_MS = 45000;

function apiError(err) {
    const res = err && err.response;
    const payload = res && res.data && res.data.error;
    return {
        status: res ? res.status : 0,
        message: (payload && payload.message) || (err && err.message) || "Request failed",
    };
}

function when(value) {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

// Spec 38.4 fixes the status/priority/SLA colours across EVERY helpdesk surface,
// so they live in one place. This page previously kept its own copies and they
// had already drifted — `merged` rendered cyan here and purple in the queue, and
// the "no SLA" wording differed in three files. Import the components instead;
// the same ticket must never look like two different tickets.

function humanise(value) {
    return String(value || "")
        .replace(/[-_]+/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase());
}

const EMPTY_THREAD = {
    rows: [], total: 0, page: 1, pageCount: 1,
    loading: true, loadingMore: false, error: null, stale: false, loadedAt: null, newCount: 0,
};

export default function TicketDetail() {
    const router = useRouter();
    const { jwt, user, activeRoleKey, adminAppAccess } = useAuth();
    // The /new/<entity> shim leaves documentId undefined on the first render —
    // every effect below is gated on router.isReady for that reason.
    const documentId = router.isReady ? router.query.documentId : undefined;

    const [ticket, setTicket] = useState(null);
    const [ticketState, setTicketState] = useState({ loading: true, error: null, status: 0, stale: false, loadedAt: null });
    const [thread, setThread] = useState(EMPTY_THREAD);
    const [desks, setDesks] = useState([]);
    const [mergeTarget, setMergeTarget] = useState(null);
    const [conflict, setConflict] = useState(null);
    const [pageError, setPageError] = useState(null);
    const [panelKey, setPanelKey] = useState(0);
    const [editingSubject, setEditingSubject] = useState(false);
    const [subjectDraft, setSubjectDraft] = useState("");
    const [savingSubject, setSavingSubject] = useState(false);
    const [splitMode, setSplitMode] = useState(false);
    const [splitSelection, setSplitSelection] = useState(() => new Set());
    const [mobileTab, setMobileTab] = useState("conversation");

    const sendingRef = useRef(false);
    // Whether the ticket has ever loaded, read inside the loader's catch so
    // `loadTicket` does not need `ticket` in its dependency list — it is used by
    // the polling effect, and a loader that changes identity on every ticket
    // update would restart the interval instead of letting it tick.
    const hasTicketRef = useRef(false);

    const isAdmin = isEffectiveAdmin(activeRoleKey, adminAppAccess, "helpdesk");
    const canManage = isAdmin || isActiveManagerRole(activeRoleKey);

    const desk = useMemo(
        () => (ticket && ticket.desk_id ? desks.find((d) => Number(d.id) === Number(ticket.desk_id)) || null : null),
        [ticket, desks]
    );

    // ── loads ────────────────────────────────────────────────────────────────

    const loadTicket = useCallback(async ({ background = false } = {}) => {
        if (!documentId || !jwt) return;
        if (!background) setTicketState((s) => ({ ...s, loading: true }));
        try {
            const res = await HelpdeskTicketsEndpoints.byId(documentId);
            const row = res && res.data ? res.data : null;
            hasTicketRef.current = Boolean(row);
            setTicket(row);
            setTicketState({ loading: false, error: null, status: 200, stale: false, loadedAt: Date.now() });
        } catch (err) {
            const info = apiError(err);
            // Stale-data-wins: an agent mid-conversation must not lose the header
            // because a refresh failed.
            setTicketState((s) => (hasTicketRef.current
                ? { ...s, loading: false, stale: true, error: info.message, status: info.status }
                : { loading: false, error: info.message, status: info.status, stale: false, loadedAt: null }));
        }
    }, [documentId, jwt]);

    const fetchPage = useCallback(async (page) => {
        const res = await HelpdeskTicketsEndpoints.listMessages(documentId, { page, pageSize: PAGE_SIZE });
        const rows = Array.isArray(res.data) ? res.data : [];
        const pagination = (res.meta && res.meta.pagination)
            || { page, pageSize: PAGE_SIZE, total: rows.length, pageCount: 1 };
        return { rows, pagination };
    }, [documentId]);

    const loadThread = useCallback(async ({ background = false } = {}) => {
        if (!documentId || !jwt) return;
        if (!background) setThread((s) => ({ ...s, loading: true }));
        try {
            let { rows, pagination } = await fetchPage(1);
            // The thread comes back oldest-first and `order` is not on the wire,
            // so on a long ticket the newest messages live on the LAST page —
            // that is the window an agent needs open.
            if (pagination.pageCount > 1) {
                const last = await fetchPage(pagination.pageCount);
                rows = last.rows;
                pagination = last.pagination;
            }
            setThread((prev) => {
                // An in-flight optimistic message must survive a background poll.
                const pending = prev.rows.filter((r) => r.__pending);
                const grew = background && prev.loadedAt && pagination.total > prev.total;
                return {
                    rows: [...rows, ...pending],
                    total: pagination.total,
                    page: pagination.page,
                    pageCount: pagination.pageCount,
                    loading: false,
                    loadingMore: false,
                    error: null,
                    stale: false,
                    loadedAt: Date.now(),
                    newCount: grew ? prev.newCount + (pagination.total - prev.total) : (background ? prev.newCount : 0),
                };
            });
        } catch (err) {
            const info = apiError(err);
            setThread((prev) => (prev.rows.length
                ? { ...prev, loading: false, loadingMore: false, stale: true, error: info.message }
                : { ...prev, loading: false, loadingMore: false, error: info.message, stale: false }));
        }
    }, [documentId, jwt, fetchPage]);

    const loadOlder = useCallback(async () => {
        if (thread.page <= 1) return;
        setThread((s) => ({ ...s, loadingMore: true }));
        try {
            const { rows } = await fetchPage(thread.page - 1);
            setThread((s) => ({ ...s, rows: [...rows, ...s.rows], page: s.page - 1, loadingMore: false }));
        } catch (err) {
            setThread((s) => ({ ...s, loadingMore: false, stale: true, error: apiError(err).message }));
        }
    }, [thread.page, fetchPage]);

    useEffect(() => {
        if (!documentId || !jwt) return;
        hasTicketRef.current = false;
        loadTicket();
    }, [documentId, jwt, loadTicket]);

    useEffect(() => {
        if (!documentId || !jwt) return;
        setThread(EMPTY_THREAD);
        loadThread();
    }, [documentId, jwt, loadThread]);

    useEffect(() => {
        if (!jwt) return;
        HelpdeskDesksEndpoints.list({})
            .then((res) => setDesks(Array.isArray(res.data) ? res.data : []))
            .catch(() => setDesks([]));
    }, [jwt]);

    // RULE-14: a merged ticket keeps resolving and its number carries the
    // pointer to where the conversation went.
    useEffect(() => {
        if (!ticket || ticket.status !== "merged" || !ticket.ticket_no) {
            setMergeTarget(null);
            return;
        }
        let alive = true;
        HelpdeskTicketsEndpoints.byNumber(ticket.ticket_no)
            .then((res) => {
                if (alive && res && res.data && res.data.redirect_to) setMergeTarget(res.data.redirect_to);
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [ticket]);

    useEffect(() => {
        if (!documentId || !jwt) return undefined;
        const id = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            if (sendingRef.current) return;
            loadThread({ background: true });
            loadTicket({ background: true });
        }, POLL_MS);
        return () => clearInterval(id);
    }, [documentId, jwt, loadThread, loadTicket]);

    // ── actions ──────────────────────────────────────────────────────────────

    const refreshAll = useCallback(() => {
        setConflict(null);
        loadTicket();
        loadThread();
        setPanelKey((k) => k + 1);
    }, [loadTicket, loadThread]);

    const sendMessage = useCallback(async ({ body, visibility }) => {
        const tempId = `pending-${Date.now()}`;
        const optimistic = {
            __tempId: tempId,
            __pending: true,
            documentId: null,
            body,
            visibility,
            author_kind: "agent",
            author_label: (user && (user.display_name || user.username)) || "You",
            channel: "api",
            createdAt: new Date().toISOString(),
        };
        sendingRef.current = true;
        setThread((s) => ({ ...s, rows: [...s.rows, optimistic] }));
        try {
            // visibility is always explicit — never left to a server default.
            const res = await HelpdeskTicketsEndpoints.createMessage(documentId, { body, visibility });
            const saved = res && res.data ? res.data : null;
            setThread((s) => ({
                ...s,
                rows: s.rows.map((m) => (m.__tempId === tempId ? (saved || { ...m, __pending: false }) : m)),
                total: s.total + 1,
            }));
            // The reply may have moved the ticket (a requester reply reopens, an
            // agent reply can leave `waiting`), and the server reports it.
            if (res && res.meta && res.meta.ticket) setTicket(res.meta.ticket);
            else loadTicket({ background: true });
            setPanelKey((k) => k + 1);
            return res;
        } catch (err) {
            // Roll the optimistic entry back. The composer keeps the typed text.
            setThread((s) => ({ ...s, rows: s.rows.filter((m) => m.__tempId !== tempId) }));
            const info = apiError(err);
            if (info.status === 409) setConflict(info.message);
            throw err;
        } finally {
            sendingRef.current = false;
        }
    }, [documentId, user, loadTicket]);

    const redactMessage = useCallback(async (message) => {
        // Redaction is irreversible and audited, so it is refused without a
        // reason both here and on the server.
        const reason = window.prompt("Why is this message being redacted? This is recorded in the audit trail.");
        if (!reason || !reason.trim()) return;
        try {
            await HelpdeskTicketsEndpoints.runRedactMessage(documentId, message.documentId, { reason: reason.trim() });
            await loadThread();
            setPanelKey((k) => k + 1);
        } catch (err) {
            setPageError(apiError(err).message);
        }
    }, [documentId, loadThread]);

    const saveSubject = useCallback(async () => {
        const next = subjectDraft.trim();
        if (!next || !ticket || next === ticket.subject) {
            setEditingSubject(false);
            return;
        }
        setSavingSubject(true);
        setPageError(null);
        try {
            const res = await HelpdeskTicketsEndpoints.update(documentId, { subject: next });
            if (res && res.data) setTicket(res.data);
            setEditingSubject(false);
        } catch (err) {
            const info = apiError(err);
            if (info.status === 409) setConflict(info.message);
            setPageError(info.message);
        } finally {
            setSavingSubject(false);
        }
    }, [subjectDraft, ticket, documentId]);

    const toggleSplitSelection = useCallback((id) => {
        setSplitSelection((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const onActionDone = useCallback(() => {
        setSplitMode(false);
        setSplitSelection(new Set());
        refreshAll();
    }, [refreshAll]);

    // ── composer permissions (mirrors message.service.assertWritableThread) ───

    const status = ticket && ticket.status;
    const composerDisabled = status === "cancelled" || status === "merged";
    const composerDisabledReason = status === "merged"
        ? "This ticket was merged — the conversation continues on the target ticket."
        : status === "cancelled"
            ? "This ticket is cancelled. Reopen it before replying."
            : "";
    // A closed ticket takes internal notes and nothing else (RULE-5).
    const allowPublic = !composerDisabled && status !== "closed";
    const allowInternal = !composerDisabled;
    const publicBlockedReason = status === "closed"
        ? "This ticket is closed. Internal notes are still allowed; reopen it to reply to the requester."
        : "";

    const notFound = !ticketState.loading && !ticket && ticketState.error;

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <nav aria-label="breadcrumb">
                    <ol className="breadcrumb small mb-2">
                        <li className="breadcrumb-item"><Link href="/">Helpdesk</Link></li>
                        <li className="breadcrumb-item"><Link href="/tickets">Tickets</Link></li>
                        <li className="breadcrumb-item active" aria-current="page">
                            {(ticket && ticket.ticket_no) || documentId || "…"}
                        </li>
                    </ol>
                </nav>

                {conflict && (
                    <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2">
                        <i className="fa-solid fa-users-line me-1"></i>
                        <span><strong>Someone else changed this ticket.</strong> {conflict}</span>
                        <button className="btn btn-sm btn-dark ms-auto" type="button" onClick={refreshAll}>
                            Refresh the ticket
                        </button>
                        <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setConflict(null)}>
                            Dismiss
                        </button>
                    </div>
                )}

                {pageError && (
                    <div className="alert alert-danger d-flex align-items-center">
                        <i className="fa-solid fa-triangle-exclamation me-2"></i>
                        <span>{pageError}</span>
                        <button className="btn-close ms-auto" type="button" onClick={() => setPageError(null)}></button>
                    </div>
                )}

                {mergeTarget && (
                    <div className="alert alert-info d-flex align-items-center">
                        <i className="fa-solid fa-code-merge me-2"></i>
                        <span>This ticket was merged. The conversation continues on the target ticket.</span>
                        <Link className="btn btn-sm btn-outline-dark ms-auto" href={`/tickets/${mergeTarget}`}>
                            Open the target
                        </Link>
                    </div>
                )}

                {/* ── header ─────────────────────────────────────────────── */}
                <div className="card mb-3">
                    <div className="card-body py-3">
                        {ticketState.stale && (
                            <div className="alert alert-warning py-1 px-2 small mb-2">
                                <i className="fa-solid fa-triangle-exclamation me-1"></i>
                                Ticket details are as of {when(ticketState.loadedAt)} — the last refresh failed.
                                <button className="btn btn-sm btn-link p-0 ms-2" type="button" onClick={() => loadTicket()}>
                                    Retry
                                </button>
                            </div>
                        )}

                        {ticketState.loading && !ticket && (
                            <div className="placeholder-glow">
                                <span className="placeholder col-3 d-block mb-2"></span>
                                <span className="placeholder col-7 d-block mb-2"></span>
                                <span className="placeholder col-5 d-block"></span>
                            </div>
                        )}

                        {notFound && (
                            <div className="alert alert-warning mb-0">
                                <i className="fa-solid fa-circle-question me-2"></i>
                                {ticketState.status === 403
                                    ? "You don't have access to this desk."
                                    : ticketState.status === 404
                                        ? "That ticket does not exist, or it is on a desk you cannot see."
                                        : ticketState.error}
                                <div className="mt-2">
                                    <Link className="btn btn-sm btn-outline-secondary" href="/tickets">Back to the queue</Link>
                                </div>
                            </div>
                        )}

                        {ticket && (
                            <>
                                <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                                    <span className="badge text-bg-dark font-monospace">{ticket.ticket_no || ticket.documentId}</span>
                                    {editingSubject ? (
                                        <div className="input-group input-group-sm flex-grow-1" style={{ maxWidth: "640px" }}>
                                            <input
                                                className="form-control"
                                                value={subjectDraft}
                                                autoFocus
                                                onChange={(e) => setSubjectDraft(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") saveSubject();
                                                    if (e.key === "Escape") setEditingSubject(false);
                                                }}
                                                aria-label="Ticket subject"
                                            />
                                            <button className="btn btn-primary" type="button" onClick={saveSubject} disabled={savingSubject}>
                                                Save
                                            </button>
                                            <button className="btn btn-outline-secondary" type="button" onClick={() => setEditingSubject(false)}>
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <h1 className="h5 mb-0">{ticket.subject}</h1>
                                            <button
                                                className="btn btn-sm btn-link p-0"
                                                type="button"
                                                title="Edit the subject"
                                                onClick={() => { setSubjectDraft(ticket.subject || ""); setEditingSubject(true); }}
                                            >
                                                <i className="fa-solid fa-pen"></i>
                                            </button>
                                        </>
                                    )}
                                </div>

                                <div className="d-flex flex-wrap align-items-center gap-2">
                                    <StatusBadge status={ticket.status} />
                                    <PriorityBadge priority={ticket.priority} />
                                    <SlaChip state={ticket.sla_state} dueAt={ticket.resolution_due_at} />
                                    {ticket.stage_key && (
                                        <span className="badge text-bg-light border">
                                            <i className="fa-solid fa-diagram-project me-1"></i>{humanise(ticket.stage_key)}
                                        </span>
                                    )}
                                    <span className="text-muted small">
                                        <i className="fa-solid fa-inbox me-1"></i>
                                        {desk ? desk.name : ticket.desk_id ? `Desk #${ticket.desk_id}` : "No desk"}
                                    </span>
                                    <span className="text-muted small">
                                        <i className="fa-solid fa-user-check me-1"></i>
                                        {ticket.assigned_to
                                            ? (ticket.assigned_to.display_name || ticket.assigned_to.username || `#${ticket.assigned_to.id}`)
                                            : "Unassigned"}
                                    </span>
                                    {ticket.source && (
                                        <span className="text-muted small">
                                            <i className="fa-solid fa-tower-broadcast me-1"></i>{ticket.source}
                                        </span>
                                    )}
                                    {ticket.branch_id && (
                                        <span className="text-muted small">
                                            <i className="fa-solid fa-store me-1"></i>Branch #{ticket.branch_id}
                                        </span>
                                    )}
                                    <span className="text-muted small ms-auto">
                                        Opened {when(ticket.createdAt)}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Below 992px the rail becomes a tab rather than a long scroll
                    past the conversation (spec 38.8). */}
                <ul className="nav nav-pills mb-3 d-lg-none">
                    <li className="nav-item">
                        <button
                            className={`nav-link ${mobileTab === "conversation" ? "active" : ""}`}
                            type="button"
                            onClick={() => setMobileTab("conversation")}
                        >
                            Conversation
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link ${mobileTab === "context" ? "active" : ""}`}
                            type="button"
                            onClick={() => setMobileTab("context")}
                        >
                            Context &amp; actions
                        </button>
                    </li>
                </ul>

                <div className="row g-3">
                    <div className={`col-12 col-lg-8 ${mobileTab === "conversation" ? "" : "d-none d-lg-block"}`}>
                        {/* The thread does not wait on the ticket, the SLA or the
                            watchers — it loads on documentId alone. */}
                        <TicketThread
                            messages={thread.rows}
                            loading={thread.loading}
                            error={thread.error}
                            stale={thread.stale}
                            lastLoadedAt={thread.loadedAt}
                            onRetry={() => loadThread()}
                            canRedact={isAdmin}
                            onRedact={redactMessage}
                            total={thread.total}
                            hasMore={thread.page > 1}
                            loadingMore={thread.loadingMore}
                            onLoadMore={loadOlder}
                            selectable={splitMode}
                            selected={splitSelection}
                            onToggleSelect={toggleSplitSelection}
                            newCount={thread.newCount}
                            onAcknowledgeNew={() => setThread((s) => ({ ...s, newCount: 0 }))}
                        />

                        <MessageComposer
                            documentId={documentId}
                            userId={user && user.id}
                            allowPublic={allowPublic}
                            allowInternal={allowInternal}
                            disabled={composerDisabled}
                            disabledReason={composerDisabledReason}
                            publicBlockedReason={publicBlockedReason}
                            onSend={sendMessage}
                        />
                    </div>

                    <div className={`col-12 col-lg-4 ${mobileTab === "context" ? "" : "d-none d-lg-block"}`}>
                        <TicketActions
                            documentId={documentId}
                            ticket={ticket}
                            desk={desk}
                            desks={desks}
                            canManage={canManage}
                            refreshKey={panelKey}
                            onDone={onActionDone}
                            onConflict={setConflict}
                            splitMode={splitMode}
                            splitSelection={splitSelection}
                            onSplitModeChange={(on) => {
                                setSplitMode(on);
                                if (!on) setSplitSelection(new Set());
                            }}
                        />

                        <TicketSidePanel
                            documentId={documentId}
                            ticket={ticket}
                            desk={desk}
                            currentUserId={user && user.id}
                            refreshKey={panelKey}
                            onChanged={() => setPanelKey((k) => k + 1)}
                        />
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
