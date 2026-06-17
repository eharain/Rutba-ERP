import { useState, useEffect, useCallback } from "react";
import SearchableSelect from "../SearchableSelect";
import {
    WorkItemActivitiesEndpoints,
    WorkItemCommentsEndpoints,
    WorkItemWatchesEndpoints,
    HrEmployeesEndpoints,
} from "@rutba/api-provider/endpoints";

const KIND_ICON = {
    created: "fa-plus",
    transition: "fa-arrow-right-arrow-left",
    assigned: "fa-user-check",
    unassigned: "fa-user-xmark",
    watch: "fa-eye",
    unwatch: "fa-eye-slash",
    comment: "fa-comment",
    note: "fa-note-sticky",
};

function fmtWhen(d) {
    if (!d) return "";
    try { return new Date(d).toLocaleString(); } catch { return ""; }
}

/**
 * Collaboration panel for any workflow-driven work item: assignee, watchers,
 * activity (audit trail) and comments. Entity-agnostic — keyed by entityUid +
 * documentId. Drop it on a detail page.
 *
 * Props:
 *  - entityUid       Strapi UID, e.g. 'api::mfg-work-order.mfg-work-order'
 *  - documentId      the work item's documentId
 *  - jwt             auth gate
 *  - currentUserId   the logged-in user's id (to compute "am I watching")
 *  - assignee        current assignee object ({ documentId, name }) or null
 *  - canAssign       show the assignee selector (default true)
 *  - onAssigned      callback(assignee|null) after a successful assignment
 */
export default function WorkItemPanel({ entityUid, documentId, jwt, currentUserId, assignee, canAssign = true, onAssigned }) {
    const [tab, setTab] = useState("activity");
    const [activity, setActivity] = useState([]);
    const [comments, setComments] = useState([]);
    const [watchers, setWatchers] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [commentText, setCommentText] = useState("");
    const [busy, setBusy] = useState(false);
    const [assigneeId, setAssigneeId] = useState(assignee?.documentId || "");

    useEffect(() => { setAssigneeId(assignee?.documentId || ""); }, [assignee?.documentId]);

    const reload = useCallback(async () => {
        if (!documentId) return;
        const args = { entityUid, targetDocumentId: documentId };
        const [a, c, w] = await Promise.allSettled([
            WorkItemActivitiesEndpoints.list({ ...args, pageSize: 100 }),
            WorkItemCommentsEndpoints.list({ ...args, pageSize: 200 }),
            WorkItemWatchesEndpoints.list({ ...args, pageSize: 200 }),
        ]);
        if (a.status === "fulfilled") setActivity(a.value?.data || []);
        if (c.status === "fulfilled") setComments(c.value?.data || []);
        if (w.status === "fulfilled") setWatchers(w.value?.data || []);
    }, [entityUid, documentId]);

    useEffect(() => { if (jwt && documentId) reload(); }, [jwt, documentId, reload]);

    useEffect(() => {
        if (!jwt || !canAssign) return;
        (async () => {
            try {
                const res = await HrEmployeesEndpoints.list({ pageSize: 300, fields: ["name"], sort: ["name:asc"] });
                setEmployees(res?.data || []);
            } catch (err) { console.warn("Failed to load employees for assignee", err); }
        })();
    }, [jwt, canAssign]);

    const amWatching = watchers.some((w) => w.user?.id && currentUserId && w.user.id === currentUserId);

    async function addComment(e) {
        e.preventDefault();
        const text = commentText.trim();
        if (!text) return;
        setBusy(true);
        try {
            await WorkItemCommentsEndpoints.create({ entity_uid: entityUid, target_document_id: documentId, body: text });
            setCommentText("");
            await reload();
        } catch (err) { console.error("Add comment failed", err); alert("Failed to add comment."); }
        finally { setBusy(false); }
    }

    async function toggleWatch() {
        setBusy(true);
        try {
            await WorkItemWatchesEndpoints.toggle({ entity_uid: entityUid, target_document_id: documentId });
            await reload();
        } catch (err) { console.error("Toggle watch failed", err); alert("Failed to update watch."); }
        finally { setBusy(false); }
    }

    async function changeAssignee(v) {
        setAssigneeId(v);
        setBusy(true);
        try {
            const res = await WorkItemActivitiesEndpoints.assign({
                entity_uid: entityUid,
                target_document_id: documentId,
                assignee_document_id: v || null,
            });
            onAssigned?.(res?.data?.assignee ?? null);
            await reload();
        } catch (err) { console.error("Assign failed", err); alert("Failed to set assignee."); }
        finally { setBusy(false); }
    }

    const employeeOptions = employees.map((e) => ({ value: e.documentId, label: e.name }));

    const TABS = [
        { key: "activity", label: "Activity", count: activity.length, icon: "fa-clock-rotate-left" },
        { key: "comments", label: "Comments", count: comments.length, icon: "fa-comments" },
        { key: "watchers", label: "Watchers", count: watchers.length, icon: "fa-eye" },
    ];

    return (
        <div className="card mb-4">
            <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                <strong><i className="fa-solid fa-users-gear me-2"></i>Collaboration</strong>
                <button
                    type="button"
                    className={`btn btn-sm ${amWatching ? "btn-primary" : "btn-outline-primary"}`}
                    disabled={busy}
                    onClick={toggleWatch}
                    title={amWatching ? "Stop watching" : "Watch this item"}
                >
                    <i className={`fa-solid ${amWatching ? "fa-eye-slash" : "fa-eye"} me-1`}></i>
                    {amWatching ? "Watching" : "Watch"}
                </button>
            </div>
            <div className="card-body">
                {canAssign && (
                    <div className="row g-2 align-items-center mb-3">
                        <div className="col-auto"><label className="form-label mb-0">Assignee</label></div>
                        <div className="col-md-5">
                            <SearchableSelect
                                value={assigneeId}
                                onChange={changeAssignee}
                                options={employeeOptions}
                                placeholder="— Unassigned —"
                            />
                        </div>
                        {assignee?.name && <div className="col-auto text-muted small">Currently: {assignee.name}</div>}
                    </div>
                )}

                <ul className="nav nav-tabs mb-3">
                    {TABS.map((t) => (
                        <li className="nav-item" key={t.key}>
                            <button className={`nav-link ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
                                <i className={`fa-solid ${t.icon} me-1`}></i>{t.label}
                                <span className="badge bg-secondary ms-1">{t.count}</span>
                            </button>
                        </li>
                    ))}
                </ul>

                {tab === "activity" && (
                    <ul className="list-group list-group-flush">
                        {activity.length === 0 && <li className="list-group-item text-muted">No activity yet.</li>}
                        {activity.map((a) => (
                            <li key={a.documentId} className="list-group-item d-flex gap-2 align-items-start">
                                <i className={`fa-solid ${KIND_ICON[a.kind] || "fa-circle"} text-muted mt-1`}></i>
                                <div className="flex-grow-1">
                                    <div>{a.summary || a.kind}</div>
                                    <div className="text-muted small">
                                        {a.actor_label || a.actor?.username || "system"} · {fmtWhen(a.createdAt)}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {tab === "comments" && (
                    <>
                        <ul className="list-group list-group-flush mb-3">
                            {comments.length === 0 && <li className="list-group-item text-muted">No comments yet.</li>}
                            {comments.map((c) => (
                                <li key={c.documentId} className="list-group-item">
                                    <div className="d-flex justify-content-between">
                                        <strong>{c.author_label || c.author?.username || "Someone"}</strong>
                                        <span className="text-muted small">{fmtWhen(c.createdAt)}</span>
                                    </div>
                                    <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
                                </li>
                            ))}
                        </ul>
                        <form className="d-flex gap-2" onSubmit={addComment}>
                            <input
                                className="form-control"
                                placeholder="Write a comment…"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                            />
                            <button type="submit" className="btn btn-primary" disabled={busy || !commentText.trim()}>
                                Comment
                            </button>
                        </form>
                    </>
                )}

                {tab === "watchers" && (
                    <ul className="list-group list-group-flush">
                        {watchers.length === 0 && <li className="list-group-item text-muted">No watchers.</li>}
                        {watchers.map((w) => (
                            <li key={w.documentId} className="list-group-item d-flex align-items-center gap-2">
                                <i className="fa-solid fa-user text-muted"></i>
                                {w.user_label || w.user?.username || w.user?.email || "Unknown"}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
