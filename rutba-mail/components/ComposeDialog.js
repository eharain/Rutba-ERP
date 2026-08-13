import { useState, useEffect } from "react";
import { MailAccountsEndpoints, MailSnippetsEndpoints } from "@rutba/api-provider/endpoints";
import RichTextArea from "./RichTextArea";
import RecipientInput from "./RecipientInput";

// Compose / reply / forward. Sends through the account's own SMTP; the backend
// appends the sent copy to the account's Sent folder. The body is authored as
// rich HTML (RichTextArea); a plain-text alternative is derived from it so
// every client gets a readable part.
//
// The html is sanitized server-side in gateway.sendMessage/saveDraft with the
// OUTBOUND policy (utils/mail/sanitize.js sanitizeOutboundHtml) — script/style
// blocks, on* handlers, javascript: URLs and CSS url() go; formatting, links
// and remote image src survive, unlike the inbound reader policy. Nothing here
// sanitizes: treat the client as a convenience, never as the control.

const escapeHtml = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const addrText = (a) => (a ? (a.name ? `${a.name} <${a.address}>` : a.address) : "");

/** Crude but dependency-free HTML → text for the plain-text alternative. */
function htmlToText(html) {
    if (typeof document === "undefined") return String(html || "");
    const el = document.createElement("div");
    el.innerHTML = String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, "\n");
    return (el.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Prefill for reply / reply-all / forward from an open message. */
export function composeDraftFrom(mode, message, account) {
    const env = message?.envelope || {};
    const subjectBase = env.subject || "";
    const quotedHtml = message?.bodyHtml
        ? `<blockquote style="margin:0 0 0 .5em;padding-left:.8em;border-left:2px solid #ccc;color:#555">${message.bodyHtml}</blockquote>`
        : `<blockquote>${escapeHtml(message?.bodyText || "")}</blockquote>`;

    if (mode === "forward") {
        return {
            to: "",
            cc: "",
            subject: /^fwd:/i.test(subjectBase) ? subjectBase : `Fwd: ${subjectBase}`,
            bodyHtml: `<p></p><p>---------- Forwarded message ----------<br>`
                + `From: ${escapeHtml(addrText(env.from))}<br>`
                + `Date: ${env.date ? new Date(env.date).toLocaleString() : ""}<br>`
                + `Subject: ${escapeHtml(subjectBase)}</p>${quotedHtml}`,
        };
    }

    const replyTarget = (env.replyTo || []).length ? env.replyTo : [env.from].filter(Boolean);
    const to = replyTarget.map((a) => a.address).join(", ");
    const ccAll = mode === "reply-all"
        ? [...(env.to || []), ...(env.cc || [])]
            .map((a) => a.address)
            .filter((addr) => addr && addr !== account?.email && !to.includes(addr))
            .join(", ")
        : "";
    const quoteHeader = `On ${env.date ? new Date(env.date).toLocaleString() : ""}, ${escapeHtml(addrText(env.from))} wrote:`;
    return {
        to,
        cc: ccAll,
        subject: /^re:/i.test(subjectBase) ? subjectBase : `Re: ${subjectBase}`,
        bodyHtml: `<p></p><p>${quoteHeader}</p>${quotedHtml}`,
        inReplyTo: message?.messageId || undefined,
        references: [message?.headers?.references, message?.messageId].filter(Boolean).join(" ") || undefined,
    };
}

export default function ComposeDialog({ account, draft, onSent, onClose }) {
    const [form, setForm] = useState({ to: "", cc: "", bcc: "", subject: "", bodyHtml: "" });
    const [showCcBcc, setShowCcBcc] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [snippets, setSnippets] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        setForm({ to: "", cc: "", bcc: "", subject: "", bodyHtml: "", ...(draft || {}) });
        setShowCcBcc(Boolean(draft?.cc));
        setAttachments([]);
        setError(null);
    }, [draft]);

    useEffect(() => {
        MailSnippetsEndpoints.list({ pageSize: 100 })
            .then((res) => setSnippets(res?.data || []))
            .catch(() => setSnippets([]));
    }, []);

    const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

    const insertSnippet = (documentId) => {
        const snip = snippets.find((s) => s.documentId === documentId);
        if (!snip) return;
        setForm((f) => ({ ...f, bodyHtml: `${f.bodyHtml || ""}${snip.body_html}` }));
    };

    const addFiles = (e) => {
        const files = [...(e.target.files || [])];
        e.target.value = "";
        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = String(reader.result).split(",")[1] || "";
                setAttachments((list) => [...list, { filename: file.name, contentType: file.type || "application/octet-stream", base64 }]);
            };
            reader.readAsDataURL(file);
        });
    };

    const saveDraft = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await MailAccountsEndpoints.createDraft(account.documentId, {
                to: form.to || undefined,
                cc: form.cc || undefined,
                bcc: form.bcc || undefined,
                subject: form.subject,
                html: form.bodyHtml || undefined,
                text: htmlToText(form.bodyHtml),
            });
            onSent?.({ ok: true, draft: true, appendedTo: res?.savedTo });
        } catch (err) {
            setError(`Save draft failed: ${err.message}`);
            setBusy(false);
        }
    };

    const send = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const signature = account?.signature_html || "";
            const html = (form.bodyHtml || "") + (signature ? `<br>${signature}` : "");
            const res = await MailAccountsEndpoints.sendMessage(account.documentId, {
                to: form.to,
                cc: form.cc || undefined,
                bcc: form.bcc || undefined,
                subject: form.subject,
                text: htmlToText(html),
                html,
                attachments: attachments.length ? attachments : undefined,
                inReplyTo: form.inReplyTo,
                references: form.references,
            });
            onSent?.(res);
        } catch (err) {
            setError(`Send failed: ${err.message}`);
            setBusy(false);
        }
    };

    return (
        <div className="position-fixed bottom-0 end-0 m-3 shadow-lg" style={{ width: "min(680px, 95vw)", zIndex: 1050 }}>
            <form className="card border-primary" onSubmit={send}>
                <div className="card-header d-flex justify-content-between align-items-center py-2">
                    <strong><i className="fa-solid fa-pen me-2"></i>New message — {account?.email}</strong>
                    <button type="button" className="btn-close" onClick={onClose}></button>
                </div>
                <div className="card-body py-2">
                    <div className="d-flex align-items-start gap-1 mb-1">
                        <span className="input-group-text input-group-sm py-1" style={{ width: "4rem" }}>To</span>
                        <div className="flex-grow-1">
                            <RecipientInput value={form.to} onChange={set("to")} autoFocus
                                placeholder="Start typing a name, customer, or address…" />
                        </div>
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowCcBcc((v) => !v)}>
                            Cc/Bcc
                        </button>
                    </div>
                    {showCcBcc && (
                        <>
                            <div className="d-flex align-items-start gap-1 mb-1">
                                <span className="input-group-text py-1" style={{ width: "4rem" }}>Cc</span>
                                <div className="flex-grow-1"><RecipientInput value={form.cc} onChange={set("cc")} /></div>
                            </div>
                            <div className="d-flex align-items-start gap-1 mb-1">
                                <span className="input-group-text py-1" style={{ width: "4rem" }}>Bcc</span>
                                <div className="flex-grow-1"><RecipientInput value={form.bcc} onChange={set("bcc")} /></div>
                            </div>
                        </>
                    )}
                    <div className="input-group input-group-sm mb-1">
                        <span className="input-group-text" style={{ width: "4rem" }}>Subject</span>
                        <input className="form-control" value={form.subject}
                            onChange={(e) => set("subject")(e.target.value)} />
                    </div>

                    <RichTextArea value={form.bodyHtml} onChange={set("bodyHtml")} />

                    {attachments.length > 0 && (
                        <div className="d-flex flex-wrap gap-1 mt-2">
                            {attachments.map((a, i) => (
                                <span key={i} className="badge bg-light text-dark border">
                                    <i className="fa-solid fa-paperclip me-1"></i>{a.filename}
                                    <i className="fa-solid fa-xmark ms-1" role="button"
                                        onClick={() => setAttachments((list) => list.filter((_, j) => j !== i))}></i>
                                </span>
                            ))}
                        </div>
                    )}
                    {error && <div className="alert alert-danger py-1 px-2 small mt-2 mb-0">{error}</div>}
                </div>
                <div className="card-footer d-flex justify-content-between align-items-center py-2">
                    <div className="d-flex align-items-center">
                        <button className="btn btn-primary btn-sm me-2" disabled={busy}>
                            {busy ? "Sending…" : <><i className="fa-solid fa-paper-plane me-1"></i>Send</>}
                        </button>
                        <label className="btn btn-outline-secondary btn-sm mb-0 me-2" title="Attach files">
                            <i className="fa-solid fa-paperclip"></i>
                            <input type="file" multiple hidden onChange={addFiles} />
                        </label>
                        <button type="button" className="btn btn-outline-secondary btn-sm me-2" disabled={busy}
                            title="Save to the Drafts folder" onClick={saveDraft}>
                            <i className="fa-regular fa-floppy-disk me-1"></i>Draft
                        </button>
                        {snippets.length > 0 && (
                            <select className="form-select form-select-sm" style={{ width: "10rem" }} value=""
                                title="Insert a canned reply"
                                onChange={(e) => { if (e.target.value) insertSnippet(e.target.value); }}>
                                <option value="">Insert snippet…</option>
                                {snippets.map((s) => (
                                    <option key={s.documentId} value={s.documentId}>
                                        {s.scope === "global" ? "★ " : ""}{s.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                    {account?.signature_html && <span className="small text-muted">Signature will be appended.</span>}
                </div>
            </form>
        </div>
    );
}
