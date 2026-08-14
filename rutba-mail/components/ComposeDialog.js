import { useState, useEffect, useRef, useCallback } from "react";
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

/**
 * Prefill for reply / reply-all / forward from an open message.
 *
 * `sourceUid`/`sourceFolder` ride along so the caller can set \Answered on
 * the message being replied to once the reply actually goes out — the list
 * has always drawn that reply arrow, it was just never set.
 */
export function composeDraftFrom(mode, message, account, folder) {
    const env = message?.envelope || {};
    const source = mode === "forward"
        ? {}
        : { sourceUid: message?.uid ?? null, sourceFolder: folder || null };
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
        ...source,
    };
}

/**
 * Prefill from a message opened out of the Drafts folder. The body must have
 * been fetched with `forEdit` so it is outbound-sanitized rather than
 * reader-defused; `draftUid` is what turns the next save into a replace.
 */
export function composeDraftFromDraft(message) {
    const env = message?.envelope || {};
    const addrs = (list) => (list || []).map((a) => a.address).filter(Boolean).join(", ");
    return {
        to: addrs(env.to),
        cc: addrs(env.cc),
        bcc: addrs(env.bcc),
        subject: env.subject || "",
        bodyHtml: message?.bodyHtml || "",
        draftUid: message?.uid ?? null,
    };
}

// Long enough that a steady typist isn't generating IMAP traffic mid-sentence,
// short enough that a browser crash costs a paragraph rather than the letter.
const AUTOSAVE_MS = 45_000;

/** What the draft actually consists of — the auto-save dirty check. */
const snapshotOf = (f) => JSON.stringify([f.to, f.cc, f.bcc, f.subject, f.bodyHtml]);
const hasContent = (f) => Boolean(
    (f.to || "").trim() || (f.cc || "").trim() || (f.bcc || "").trim()
    || (f.subject || "").trim() || htmlToText(f.bodyHtml || "").trim(),
);

export default function ComposeDialog({ account, draft, onSent, onClose }) {
    const [form, setForm] = useState({ to: "", cc: "", bcc: "", subject: "", bodyHtml: "" });
    const [showCcBcc, setShowCcBcc] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [snippets, setSnippets] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // The server-side copy this compose currently IS. Set when resuming a
    // draft, and after every save, so the next save replaces rather than
    // appends — otherwise auto-save would leave one draft per tick.
    const [draftUid, setDraftUid] = useState(null);
    const [savedAt, setSavedAt] = useState(null);
    const savedSnapshot = useRef("");
    const formRef = useRef(form);
    formRef.current = form;
    const busyRef = useRef(false);
    busyRef.current = busy;
    const draftUidRef = useRef(null);
    draftUidRef.current = draftUid;

    useEffect(() => {
        const next = { to: "", cc: "", bcc: "", subject: "", bodyHtml: "", ...(draft || {}) };
        setForm(next);
        setShowCcBcc(Boolean(draft?.cc || draft?.bcc));
        setAttachments([]);
        setError(null);
        setDraftUid(draft?.draftUid ?? null);
        setSavedAt(null);
        // A resumed draft starts CLEAN: opening one and closing it again must
        // not rewrite it on the server.
        savedSnapshot.current = snapshotOf(next);
    }, [draft]);

    useEffect(() => {
        MailSnippetsEndpoints.list({ pageSize: 100 })
            .then((res) => setSnippets(res?.data || []))
            .catch(() => setSnippets([]));
    }, []);

    const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

    /**
     * APPEND the draft, replacing the previous copy. Attachments are NOT part
     * of it: they live in browser memory until send, and round-tripping them
     * through IMAP on a 45-second timer is exactly the kind of traffic the
     * single-channel connection cannot afford.
     */
    const persistDraft = useCallback(async () => {
        const f = formRef.current;
        const res = await MailAccountsEndpoints.createDraft(account.documentId, {
            to: f.to || undefined,
            cc: f.cc || undefined,
            bcc: f.bcc || undefined,
            subject: f.subject,
            html: f.bodyHtml || undefined,
            text: htmlToText(f.bodyHtml),
            replaceUid: draftUidRef.current || undefined,
        });
        setDraftUid(res?.uid ?? null);
        savedSnapshot.current = snapshotOf(f);
        setSavedAt(new Date());
        return res;
    }, [account?.documentId]);

    // Periodic auto-save. Only when something changed, only when there is
    // something worth saving, never while a send or an explicit save is in
    // flight — one IMAP APPEND per tick at most, and usually none.
    useEffect(() => {
        const timer = setInterval(() => {
            const f = formRef.current;
            if (busyRef.current || !hasContent(f) || snapshotOf(f) === savedSnapshot.current) return;
            persistDraft().catch(() => { /* the next tick tries again; never interrupt typing */ });
        }, AUTOSAVE_MS);
        return () => clearInterval(timer);
    }, [persistDraft]);

    /**
     * Closing must not throw work away — the whole reason drafts existed and
     * still lost everything. Anything unsaved is written on the way out.
     */
    const requestClose = async () => {
        const f = formRef.current;
        if (busy || !hasContent(f) || snapshotOf(f) === savedSnapshot.current) {
            onClose();
            return;
        }
        setBusy(true);
        try {
            const res = await persistDraft();
            onClose({ savedDraftTo: res?.savedTo || "Drafts" });
        } catch (err) {
            setBusy(false);
            setError(`Could not save the draft: ${err.message}. Close again to discard it.`);
            savedSnapshot.current = snapshotOf(f); // a second close gives up rather than looping
        }
    };

    /** Ctrl/⌘+Enter sends, Escape closes — both while the user is typing, which
     *  is why they live here and not in the global shortcut handler. */
    const onFormKeyDown = (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!busy) e.currentTarget.requestSubmit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            requestClose();
        }
    };

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
            const res = await persistDraft();
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
            // The message is out; the draft copy of it is now litter. Failing
            // to clear it must never look like a failed send.
            const draftsFolder = account?.special_folders?.drafts;
            if (draftUid && draftsFolder) {
                await MailAccountsEndpoints.removeMessage(account.documentId, draftUid, { folder: draftsFolder })
                    .catch(() => { /* a leftover draft is cosmetic */ });
            }
            onSent?.({ ...res, sourceUid: form.sourceUid, sourceFolder: form.sourceFolder });
        } catch (err) {
            setError(`Send failed: ${err.message}`);
            setBusy(false);
        }
    };

    return (
        <div className="position-fixed bottom-0 end-0 m-3 shadow-lg" style={{ width: "min(680px, 95vw)", zIndex: 1050 }}>
            <form className="card border-primary" onSubmit={send} onKeyDown={onFormKeyDown}>
                <div className="card-header d-flex justify-content-between align-items-center py-2">
                    <strong>
                        <i className={`fa-solid ${draft?.draftUid ? "fa-file-pen" : "fa-pen"} me-2`}></i>
                        {draft?.draftUid ? "Draft" : "New message"} — {account?.email}
                    </strong>
                    <button type="button" className="btn-close" title="Close (Esc) — unsaved work is saved to Drafts"
                        onClick={requestClose}></button>
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
                        <button className="btn btn-primary btn-sm me-2" disabled={busy} title="Send (Ctrl/⌘+Enter)">
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
                    <span className="small text-muted text-end">
                        {savedAt && (
                            <span className="me-2">
                                <i className="fa-solid fa-cloud-arrow-up me-1"></i>
                                Draft saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                        )}
                        {account?.signature_html && <span>Signature will be appended.</span>}
                    </span>
                </div>
            </form>
        </div>
    );
}
