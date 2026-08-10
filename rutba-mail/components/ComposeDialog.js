import { useState, useEffect } from "react";
import { MailAccountsEndpoints } from "@rutba/api-provider/endpoints";

// Compose / reply / forward. Sends through the account's own SMTP; the backend
// appends the sent copy to the account's Sent folder. The body is authored as
// plain text and shipped as text + a minimal HTML rendering (plus the
// account's signature when present).

const escapeHtml = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const addrText = (a) => (a ? (a.name ? `${a.name} <${a.address}>` : a.address) : "");

/** Prefill for reply / reply-all / forward from an open message. */
export function composeDraftFrom(mode, message, account) {
    const env = message?.envelope || {};
    const subjectBase = env.subject || "";
    const quoteHeader = `On ${env.date ? new Date(env.date).toLocaleString() : ""}, ${addrText(env.from)} wrote:`;
    const quoted = (message?.bodyText || "")
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");

    if (mode === "forward") {
        return {
            to: "",
            cc: "",
            subject: /^fwd:/i.test(subjectBase) ? subjectBase : `Fwd: ${subjectBase}`,
            body: `\n\n---------- Forwarded message ----------\nFrom: ${addrText(env.from)}\nDate: ${env.date ? new Date(env.date).toLocaleString() : ""}\nSubject: ${subjectBase}\n\n${message?.bodyText || ""}`,
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
    return {
        to,
        cc: ccAll,
        subject: /^re:/i.test(subjectBase) ? subjectBase : `Re: ${subjectBase}`,
        body: `\n\n${quoteHeader}\n${quoted}`,
        inReplyTo: message?.messageId || undefined,
        references: [message?.headers?.references, message?.messageId].filter(Boolean).join(" ") || undefined,
    };
}

export default function ComposeDialog({ account, draft, onSent, onClose }) {
    const [form, setForm] = useState({ to: "", cc: "", bcc: "", subject: "", body: "" });
    const [showCcBcc, setShowCcBcc] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        setForm({ to: "", cc: "", bcc: "", subject: "", body: "", ...(draft || {}) });
        setShowCcBcc(Boolean(draft?.cc));
        setAttachments([]);
        setError(null);
    }, [draft]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
                text: form.body,
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
            const html = `<div style="white-space:pre-wrap">${escapeHtml(form.body)}</div>`
                + (signature ? `<br>${signature}` : "");
            const res = await MailAccountsEndpoints.sendMessage(account.documentId, {
                to: form.to,
                cc: form.cc || undefined,
                bcc: form.bcc || undefined,
                subject: form.subject,
                text: form.body,
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
        <div className="position-fixed bottom-0 end-0 m-3 shadow-lg" style={{ width: "min(640px, 95vw)", zIndex: 1050 }}>
            <form className="card border-primary" onSubmit={send}>
                <div className="card-header d-flex justify-content-between align-items-center py-2">
                    <strong><i className="fa-solid fa-pen me-2"></i>New message — {account?.email}</strong>
                    <button type="button" className="btn-close" onClick={onClose}></button>
                </div>
                <div className="card-body py-2">
                    <div className="input-group input-group-sm mb-1">
                        <span className="input-group-text" style={{ width: "4rem" }}>To</span>
                        <input className="form-control" required value={form.to} onChange={set("to")}
                            placeholder="one@example.com, two@example.com" />
                        <button type="button" className="btn btn-outline-secondary" onClick={() => setShowCcBcc((v) => !v)}>
                            Cc/Bcc
                        </button>
                    </div>
                    {showCcBcc && (
                        <>
                            <div className="input-group input-group-sm mb-1">
                                <span className="input-group-text" style={{ width: "4rem" }}>Cc</span>
                                <input className="form-control" value={form.cc} onChange={set("cc")} />
                            </div>
                            <div className="input-group input-group-sm mb-1">
                                <span className="input-group-text" style={{ width: "4rem" }}>Bcc</span>
                                <input className="form-control" value={form.bcc} onChange={set("bcc")} />
                            </div>
                        </>
                    )}
                    <div className="input-group input-group-sm mb-1">
                        <span className="input-group-text" style={{ width: "4rem" }}>Subject</span>
                        <input className="form-control" value={form.subject} onChange={set("subject")} />
                    </div>
                    <textarea className="form-control form-control-sm" rows={9} value={form.body}
                        onChange={set("body")} placeholder="Write your message…" />

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
                    <div>
                        <button className="btn btn-primary btn-sm me-2" disabled={busy}>
                            {busy ? "Sending…" : <><i className="fa-solid fa-paper-plane me-1"></i>Send</>}
                        </button>
                        <label className="btn btn-outline-secondary btn-sm mb-0 me-2">
                            <i className="fa-solid fa-paperclip"></i>
                            <input type="file" multiple hidden onChange={addFiles} />
                        </label>
                        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy}
                            title="Save to the Drafts folder" onClick={saveDraft}>
                            <i className="fa-regular fa-floppy-disk me-1"></i>Draft
                        </button>
                    </div>
                    {account?.signature_html && <span className="small text-muted">Signature will be appended.</span>}
                </div>
            </form>
        </div>
    );
}
