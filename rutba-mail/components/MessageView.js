import { useMemo, useState, useEffect, useCallback } from "react";
import {
    MailAccountsEndpoints,
    MailContactsEndpoints,
    MailMessagesEndpoints,
    WorkItemCommentsEndpoints,
} from "@rutba/api-provider/endpoints";
import LinkPicker from "./LinkPicker";

// Reading pane. The body is server-sanitized AND rendered inside a fully
// sandboxed iframe (no scripts, no same-origin) — defense in depth against
// hostile HTML. Remote images stay blocked until the user clicks "load images"
// for this message (`data-remote-src` → `src` swap in the srcDoc string).

const addrText = (a) => (a ? (a.name ? `${a.name} <${a.address}>` : a.address) : "");
const listText = (list) => (list || []).map(addrText).join(", ");

export default function MessageView({ account, folder, folders, message, tags = [], onReply, onDeleted, onMoved, onFlagChanged, onClose }) {
    const [showRemote, setShowRemote] = useState(false);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [linking, setLinking] = useState(false);
    const [linkedNote, setLinkedNote] = useState(null);
    const [msgTags, setMsgTags] = useState([]);
    const [savedSender, setSavedSender] = useState(false);

    useEffect(() => {
        setShowRemote(false);
        setError(null);
        setLinking(false);
        setLinkedNote(null);
        setMsgTags(message?.tags || []);
        setSavedSender(false);
    }, [message?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

    const srcDoc = useMemo(() => {
        if (!message) return "";
        let body = message.bodyHtml || "";
        if (showRemote) body = body.replaceAll("data-remote-src=", "src=");
        return `<!doctype html><html><head><meta charset="utf-8">
<base target="_blank">
<style>body{font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#212529;margin:12px;word-wrap:break-word;}
img{max-width:100%;height:auto;} pre{white-space:pre-wrap;}</style>
</head><body>${body}</body></html>`;
    }, [message, showRemote]);

    if (!message) {
        return (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                <div className="text-center p-4">
                    <i className="fa-regular fa-envelope-open fa-2x mb-2"></i>
                    <div>Select a message to read it.</div>
                </div>
            </div>
        );
    }

    const download = async (att) => {
        setBusy(`att:${att.partId}`);
        setError(null);
        try {
            const res = await MailAccountsEndpoints.getAttachment(account.documentId, message.uid, { folder, part: att.partId });
            const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: res.contentType }));
            const link = document.createElement("a");
            link.href = url;
            link.download = res.filename || "attachment";
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(`Download failed: ${err.message}`);
        } finally {
            setBusy(null);
        }
    };

    const toggleFlag = async () => {
        setBusy("flag");
        try {
            const op = message.flags?.flagged ? { remove: ["flagged"] } : { add: ["flagged"] };
            await MailAccountsEndpoints.setFlags(account.documentId, message.uid, { folder, ...op });
            onFlagChanged?.(!message.flags?.flagged);
        } catch (err) {
            setError(`Could not update the flag: ${err.message}`);
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        setBusy("delete");
        try {
            await MailAccountsEndpoints.removeMessage(account.documentId, message.uid, { folder });
            onDeleted?.();
        } catch (err) {
            setError(`Delete failed: ${err.message}`);
            setBusy(null);
        }
    };

    const move = async (toFolder) => {
        if (!toFolder) return;
        setBusy("move");
        try {
            await MailAccountsEndpoints.transferMessage(account.documentId, message.uid, { folder, toFolder });
            onMoved?.(toFolder);
        } catch (err) {
            setError(`Move failed: ${err.message}`);
            setBusy(null);
        }
    };

    const toggleTag = async (slug) => {
        const has = msgTags.includes(slug);
        setBusy("tag");
        try {
            await MailAccountsEndpoints.setTags(account.documentId, {
                folder, uids: [message.uid], ...(has ? { remove: [slug] } : { add: [slug] }),
            });
            setMsgTags((t) => (has ? t.filter((s) => s !== slug) : [...t, slug]));
        } catch (err) {
            setError(`Tag failed: ${err.message}`);
        } finally {
            setBusy(null);
        }
    };

    const saveSender = async () => {
        const from = message.envelope?.from;
        if (!from?.address) return;
        setBusy("contact");
        try {
            await MailContactsEndpoints.create({ name: from.name || from.address, email: from.address, scope: "personal" });
            setSavedSender(true);
        } catch (err) {
            setError(`Could not save the contact: ${err.message}`);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="d-flex flex-column h-100">
            <div className="border-bottom p-2">
                <div className="d-flex justify-content-between align-items-start gap-2">
                    <h5 className="mb-1 text-break">{message.envelope?.subject || "(no subject)"}</h5>
                    <div className="btn-group btn-group-sm flex-shrink-0">
                        <button className="btn btn-outline-primary" title="Reply" onClick={() => onReply("reply")}>
                            <i className="fa-solid fa-reply"></i>
                        </button>
                        <button className="btn btn-outline-primary" title="Reply all" onClick={() => onReply("reply-all")}>
                            <i className="fa-solid fa-reply-all"></i>
                        </button>
                        <button className="btn btn-outline-primary" title="Forward" onClick={() => onReply("forward")}>
                            <i className="fa-solid fa-share"></i>
                        </button>
                        <button className={`btn btn-outline-warning ${message.flags?.flagged ? "active" : ""}`}
                            title="Flag" disabled={busy === "flag"} onClick={toggleFlag}>
                            <i className="fa-solid fa-flag"></i>
                        </button>
                        <button className="btn btn-outline-success" title="Link to CRM / order"
                            onClick={() => setLinking((v) => !v)}>
                            <i className="fa-solid fa-link"></i>
                        </button>
                        <select className="btn btn-outline-secondary" style={{ maxWidth: "7.5rem" }} title="Move to folder"
                            value="" disabled={busy === "move"} onChange={(e) => move(e.target.value)}>
                            <option value="">Move…</option>
                            {(folders || []).filter((f) => f.path !== folder).map((f) => (
                                <option key={f.path} value={f.path}>{f.name || f.path}</option>
                            ))}
                        </select>
                        <button className="btn btn-outline-danger" title="Delete" disabled={busy === "delete"} onClick={remove}>
                            <i className="fa-solid fa-trash"></i>
                        </button>
                        <button className="btn btn-outline-secondary" title="Close" onClick={onClose}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>
                <div className="small text-muted">
                    <div>
                        <strong>From:</strong> {addrText(message.envelope?.from)}
                        {message.envelope?.from?.address && !savedSender && (
                            <button className="btn btn-link btn-sm p-0 ms-2 align-baseline" title="Add sender to your address book"
                                disabled={busy === "contact"} onClick={saveSender}>
                                <i className="fa-solid fa-address-book me-1"></i>Save contact
                            </button>
                        )}
                        {savedSender && <span className="text-success ms-2"><i className="fa-solid fa-check"></i> saved</span>}
                    </div>
                    <div><strong>To:</strong> {listText(message.envelope?.to)}</div>
                    {(message.envelope?.cc || []).length > 0 && <div><strong>Cc:</strong> {listText(message.envelope?.cc)}</div>}
                    <div>{message.envelope?.date ? new Date(message.envelope.date).toLocaleString() : ""}</div>
                </div>
                {tags.length > 0 && (
                    <div className="mt-1 d-flex flex-wrap gap-1 align-items-center">
                        {tags.map((t) => {
                            const on = msgTags.includes(t.slug);
                            return (
                                <button key={t.slug} type="button" disabled={busy === "tag"}
                                    className="badge border-0"
                                    style={{
                                        backgroundColor: on ? (t.color || "#6c757d") : "#e9ecef",
                                        color: on ? "#fff" : "#495057",
                                        cursor: "pointer",
                                    }}
                                    title={on ? "Remove tag" : "Add tag"}
                                    onClick={() => toggleTag(t.slug)}>
                                    {t.name}
                                </button>
                            );
                        })}
                    </div>
                )}
                {(message.attachments || []).length > 0 && (
                    <div className="mt-2 d-flex flex-wrap gap-2">
                        {message.attachments.map((att) => (
                            <button key={att.partId} className="btn btn-sm btn-outline-secondary"
                                disabled={busy === `att:${att.partId}`}
                                title={`${att.contentType} — ${Math.round((att.size || 0) / 1024)} KB`}
                                onClick={() => download(att)}>
                                <i className="fa-solid fa-paperclip me-1"></i>
                                {att.filename}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {linking && (
                <div className="position-relative">
                    <LinkPicker
                        account={account}
                        folder={folder}
                        uid={message.uid}
                        fromEmail={message.envelope?.from?.address || ""}
                        onClose={() => setLinking(false)}
                        onLinked={(res) => {
                            setLinking(false);
                            setLinkedNote(res?.created ? "Imported and linked." : "Linked (already imported).");
                        }}
                    />
                </div>
            )}
            {linkedNote && (
                <div className="alert alert-success rounded-0 mb-0 py-1 px-2 small d-flex justify-content-between">
                    <span><i className="fa-solid fa-link me-1"></i>{linkedNote}</span>
                    <button type="button" className="btn-close" onClick={() => setLinkedNote(null)}></button>
                </div>
            )}
            {message.hasRemoteImages && !showRemote && (
                <div className="alert alert-secondary rounded-0 border-0 border-bottom mb-0 py-1 px-2 small d-flex justify-content-between align-items-center">
                    <span><i className="fa-solid fa-image me-1"></i>Remote images are blocked for privacy.</span>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowRemote(true)}>Load images</button>
                </div>
            )}
            {error && <div className="alert alert-warning rounded-0 mb-0 py-1 px-2 small">{error}</div>}

            <iframe className="mail-body-frame flex-grow-1" sandbox="" srcDoc={srcDoc} title="Message body" />

            {account?.kind === "shared" && <NotesPanel account={account} folder={folder} message={message} />}
        </div>
    );
}

const MSG_UID = "api::mail-message.mail-message";

/**
 * Internal notes on a shared-inbox message, inline in the reading pane (the
 * Front/Missive essential). Notes hang off the IMPORTED copy — the first
 * note on a live-only message quietly imports it (link-less), which is
 * exactly the import-on-demand rule: a message becomes a DB row when the
 * team starts working on it.
 */
function NotesPanel({ account, folder, message }) {
    const [open, setOpen] = useState(false);
    const [docId, setDocId] = useState(null);
    const [comments, setComments] = useState([]);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [noteError, setNoteError] = useState(null);

    const loadComments = useCallback((targetDocumentId) => {
        if (!targetDocumentId) { setComments([]); return; }
        WorkItemCommentsEndpoints.list({ entityUid: MSG_UID, targetDocumentId, pageSize: 50 })
            .then((res) => setComments(res?.data || []))
            .catch(() => setComments([]));
    }, []);

    useEffect(() => {
        setOpen(false);
        setDocId(null);
        setComments([]);
        setDraft("");
        setNoteError(null);
        if (!message?.messageId) return;
        MailMessagesEndpoints.list({ filters: { message_id: { $eq: message.messageId } }, pageSize: 1 })
            .then((res) => {
                const row = res?.data?.[0] || null;
                setDocId(row?.documentId || null);
                if (row?.documentId) loadComments(row.documentId);
            })
            .catch(() => {});
    }, [message?.uid, message?.messageId, loadComments]);

    const addNote = async (e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        setBusy(true);
        setNoteError(null);
        try {
            let target = docId;
            if (!target) {
                const res = await MailAccountsEndpoints.createImport(account.documentId, message.uid, { folder });
                target = res?.message?.documentId;
                setDocId(target || null);
            }
            if (!target) throw new Error("Could not attach the message.");
            await WorkItemCommentsEndpoints.create({
                entity_uid: MSG_UID,
                target_document_id: target,
                body: draft.trim(),
            });
            setDraft("");
            loadComments(target);
        } catch (err) {
            setNoteError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="border-top">
            <button type="button" className="btn btn-sm btn-link text-decoration-none w-100 text-start px-2 py-1"
                onClick={() => setOpen((v) => !v)}>
                <i className={`fa-solid fa-chevron-${open ? "down" : "right"} me-1`}></i>
                Internal notes{comments.length ? ` (${comments.length})` : ""}
                <span className="text-muted small ms-2">visible to the team, never emailed</span>
            </button>
            {open && (
                <div className="px-2 pb-2" style={{ maxHeight: "14rem", overflowY: "auto" }}>
                    {comments.map((c) => (
                        <div key={c.documentId} className="mb-1 small">
                            <strong>{c.author_label || "someone"}</strong>
                            <span className="text-muted ms-1">{new Date(c.createdAt).toLocaleString()}</span>
                            <div>{c.body}</div>
                        </div>
                    ))}
                    {!comments.length && <div className="text-muted small mb-1">No notes yet.</div>}
                    {noteError && <div className="alert alert-warning py-1 px-2 small">{noteError}</div>}
                    <form onSubmit={addNote} className="d-flex gap-1">
                        <input className="form-control form-control-sm" value={draft} placeholder="Add a note…"
                            onChange={(e) => setDraft(e.target.value)} />
                        <button className="btn btn-sm btn-outline-primary" disabled={busy || !draft.trim()}>Add</button>
                    </form>
                </div>
            )}
        </div>
    );
}
