import { useMemo, useState, useEffect } from "react";
import { MailAccountsEndpoints } from "@rutba/api-provider/endpoints";
import LinkPicker from "./LinkPicker";

// Reading pane. The body is server-sanitized AND rendered inside a fully
// sandboxed iframe (no scripts, no same-origin) — defense in depth against
// hostile HTML. Remote images stay blocked until the user clicks "load images"
// for this message (`data-remote-src` → `src` swap in the srcDoc string).

const addrText = (a) => (a ? (a.name ? `${a.name} <${a.address}>` : a.address) : "");
const listText = (list) => (list || []).map(addrText).join(", ");

export default function MessageView({ account, folder, folders, message, onReply, onDeleted, onMoved, onFlagChanged, onClose }) {
    const [showRemote, setShowRemote] = useState(false);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [linking, setLinking] = useState(false);
    const [linkedNote, setLinkedNote] = useState(null);

    useEffect(() => { setShowRemote(false); setError(null); setLinking(false); setLinkedNote(null); }, [message?.uid]);

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
                    <div><strong>From:</strong> {addrText(message.envelope?.from)}</div>
                    <div><strong>To:</strong> {listText(message.envelope?.to)}</div>
                    {(message.envelope?.cc || []).length > 0 && <div><strong>Cc:</strong> {listText(message.envelope?.cc)}</div>}
                    <div>{message.envelope?.date ? new Date(message.envelope.date).toLocaleString() : ""}</div>
                </div>
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
        </div>
    );
}
