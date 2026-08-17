import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    MailAccountsEndpoints,
    MailMessagesEndpoints,
    WorkItemCommentsEndpoints,
} from "@rutba/api-provider/endpoints";

// Triage queue for one shared inbox (M3). Queue rows are IMPORTED messages
// (triage_status != none) — unhandled mail lives in the live mailbox until an
// agent assigns it, which imports it (import-on-demand doing double duty).

const STATUSES = ["open", "assigned", "awaiting", "closed", "spam"];
const STATUS_BADGE = { open: "warning", assigned: "info", awaiting: "secondary", closed: "success", spam: "danger" };
const MSG_UID = "api::mail-message.mail-message";

export default function SharedQueuePage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();

    const [account, setAccount] = useState(null);
    const [messages, setMessages] = useState([]);
    const [assignees, setAssignees] = useState([]);
    const [statusFilter, setStatusFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState(null);
    const [open, setOpen] = useState(null); // message being viewed

    const load = useCallback(() => {
        // Gate effects on router readiness — the /new/<entity> shim lesson.
        if (!jwt || !router.isReady || !documentId) return;
        setLoading(true);
        Promise.all([
            MailAccountsEndpoints.byId(documentId),
            MailMessagesEndpoints.list({
                pageSize: 100,
                accountDocumentId: documentId,
                ...(statusFilter ? { triageStatus: statusFilter } : { filters: { triage_status: { $ne: "none" } } }),
                populate: { links: true, assigned_to: true },
            }),
            MailAccountsEndpoints.listAssignees().catch(() => ({ data: [] })),
        ])
            .then(([acc, msgs, people]) => {
                setAccount(acc?.data || null);
                setMessages(msgs?.data || []);
                setAssignees(people?.data || []);
            })
            .catch((err) => setNotice({ type: "danger", text: err.message }))
            .finally(() => setLoading(false));
    }, [jwt, router.isReady, documentId, statusFilter]);

    useEffect(() => { load(); }, [load]);

    const assign = async (message, assignTo) => {
        try {
            await MailMessagesEndpoints.assignMessage(message.documentId, { assignTo: assignTo || null });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Assign failed: ${err.message}` });
        }
    };

    const setStatus = async (message, status) => {
        try {
            await MailMessagesEndpoints.setTriageStatus(message.documentId, { status });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Status change failed: ${err.message}` });
        }
    };

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                    <h4 className="mb-0">
                        <Link href="/shared" className="text-decoration-none"><i className="fa-solid fa-arrow-left me-2"></i></Link>
                        <i className="fa-solid fa-users text-info me-2"></i>
                        {account ? `${account.name} — queue` : "Queue"}
                    </h4>
                    <div className="btn-group btn-group-sm">
                        <button className={`btn btn-outline-secondary ${statusFilter === "" ? "active" : ""}`}
                            onClick={() => setStatusFilter("")}>All</button>
                        {STATUSES.map((s) => (
                            <button key={s} className={`btn btn-outline-${STATUS_BADGE[s]} ${statusFilter === s ? "active" : ""}`}
                                onClick={() => setStatusFilter(s)}>{s}</button>
                        ))}
                    </div>
                </div>
                <p className="text-muted small">
                    New mail is triaged from the <Link href="/">live inbox</Link> — “Add to queue”,
                    or assigning a message, imports it into this queue.
                </p>

                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible py-2`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                {loading ? (
                    <p className="text-muted">Loading…</p>
                ) : messages.length === 0 ? (
                    <div className="alert alert-light border">Queue is empty{statusFilter ? ` for '${statusFilter}'` : ""}.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-sm align-middle">
                            <thead>
                                <tr><th>From</th><th>Subject</th><th>Date</th><th>Status</th><th>Assignee</th><th>Links</th><th></th></tr>
                            </thead>
                            <tbody>
                                {messages.map((m) => (
                                    <tr key={m.documentId}>
                                        <td className="text-nowrap">{m.from_name || m.from_email}</td>
                                        <td>
                                            <button className="btn btn-link btn-sm p-0 text-start" onClick={() => setOpen(m)}>
                                                {m.subject || "(no subject)"}
                                            </button>
                                        </td>
                                        <td className="text-muted small text-nowrap">{m.date ? new Date(m.date).toLocaleString() : ""}</td>
                                        <td>
                                            <select className={`form-select form-select-sm border-${STATUS_BADGE[m.triage_status] || "secondary"}`}
                                                value={m.triage_status} onChange={(e) => setStatus(m, e.target.value)}>
                                                {["none", ...STATUSES].map((s) => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            <select className="form-select form-select-sm" value=""
                                                onChange={(e) => assign(m, e.target.value)}>
                                                <option value="">{m.assigned_to?.username || "— assign —"}</option>
                                                {assignees.map((u) => (
                                                    <option key={u.id} value={u.id}>{u.username}</option>
                                                ))}
                                                <option value="">unassign</option>
                                            </select>
                                        </td>
                                        <td className="small text-muted">{(m.links || []).length || ""}</td>
                                        <td></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {open && <QueueMessageDialog message={open} onClose={() => setOpen(null)} />}
            </Layout>
        </ProtectedRoute>
    );
}

/** Read-only view of the imported copy + internal comments (work-item reuse). */
function QueueMessageDialog({ message, onClose }) {
    const [comments, setComments] = useState([]);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);

    const loadComments = useCallback(() => {
        WorkItemCommentsEndpoints.list({
            entityUid: MSG_UID,
            targetDocumentId: message.documentId,
            pageSize: 50,
        })
            .then((res) => setComments(res?.data || []))
            .catch(() => setComments([]));
    }, [message.documentId]);

    useEffect(() => { loadComments(); }, [loadComments]);

    const addComment = async (e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        setBusy(true);
        try {
            await WorkItemCommentsEndpoints.create({
                entity_uid: MSG_UID,
                target_document_id: message.documentId,
                body: draft.trim(),
            });
            setDraft("");
            loadComments();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
            style={{ background: "rgba(0,0,0,.4)", zIndex: 1050 }}>
            <div className="card shadow-lg" style={{ width: "min(860px, 95vw)", maxHeight: "90vh", overflow: "hidden" }}>
                <div className="card-header d-flex justify-content-between align-items-center py-2">
                    <strong className="text-truncate">{message.subject || "(no subject)"}</strong>
                    <button type="button" className="btn-close" onClick={onClose}></button>
                </div>
                <div className="card-body p-0 d-flex" style={{ minHeight: "50vh" }}>
                    <iframe className="mail-body-frame" sandbox="" title="Message"
                        srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:Arial;font-size:14px;margin:12px;}</style></head><body>${message.body_html || ""}</body></html>`} />
                    <div className="border-start p-2 d-flex flex-column" style={{ width: "18rem", flexShrink: 0, overflowY: "auto" }}>
                        <h6 className="small text-uppercase text-muted">Internal notes</h6>
                        <div className="flex-grow-1">
                            {comments.map((c) => (
                                <div key={c.documentId} className="mb-2 small">
                                    <strong>{c.author_label || "someone"}</strong>
                                    <span className="text-muted ms-1">{new Date(c.createdAt).toLocaleString()}</span>
                                    <div>{c.body}</div>
                                </div>
                            ))}
                            {!comments.length && <div className="text-muted small">No notes yet.</div>}
                        </div>
                        <form onSubmit={addComment} className="mt-2">
                            <textarea className="form-control form-control-sm" rows={2} value={draft}
                                onChange={(e) => setDraft(e.target.value)} placeholder="Add a note (never emailed)…" />
                            <button className="btn btn-sm btn-outline-primary mt-1 w-100" disabled={busy || !draft.trim()}>
                                Add note
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
