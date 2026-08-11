import { useCallback, useEffect, useRef, useState } from "react";

const PUBLIC = "public";
const INTERNAL = "internal";

/**
 * The composer's two modes are styled with inline style objects rather than
 * class names on purpose. Spec 38.5 says tenant branding must not be able to
 * weaken the internal/public affordance, and a class in a shared stylesheet is
 * exactly what a tenant theme would override. Logical properties
 * (borderInlineStart) keep the marker on the leading edge under Urdu RTL.
 */
const SHELL = {
    [PUBLIC]: {
        background: "#ffffff",
        border: "1px solid #ced4da",
        borderInlineStartWidth: "5px",
        borderInlineStartColor: "#0d6efd",
        borderInlineStartStyle: "solid",
    },
    [INTERNAL]: {
        background: "#fff4d6",
        border: "1px solid #d39e00",
        borderInlineStartWidth: "5px",
        borderInlineStartColor: "#8a6100",
        borderInlineStartStyle: "solid",
    },
};

/** Draft keys are per user as well as per ticket — a shared desk machine must not leak drafts. */
function draftKey(documentId, userId) {
    return `rutba-helpdesk:draft:${userId || "anon"}:${documentId}`;
}

function apiError(err) {
    const res = err && err.response;
    const payload = res && res.data && res.data.error;
    return {
        status: res ? res.status : 0,
        message: (payload && payload.message) || (err && err.message) || "Request failed",
    };
}

/**
 * Spec 18 §18.4 — all six defences against sending an internal note publicly:
 *   1  persistent two-state control, always visible (never an icon, never hidden)
 *   2  internal mode changes the composer's background AND border
 *   3  the send button names its audience
 *   4  (in TicketThread) every internal entry is labelled and visually distinct
 *   5  internal → public with text typed asks for confirmation
 *   6  `visibility` is on the wire on every call — never a server-side default
 */
export default function MessageComposer({
    documentId,
    userId,
    allowPublic = true,
    allowInternal = true,
    disabled = false,
    disabledReason = "",
    publicBlockedReason = "",
    onSend,
}) {
    const [mode, setMode] = useState(PUBLIC);
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [restored, setRestored] = useState(false);
    const textareaRef = useRef(null);

    // The allow flags arrive late (they are derived from the ticket, which loads
    // after the thread). Reading them through a ref keeps them out of the draft
    // effect's dependency list — re-running that effect when the ticket resolves
    // would overwrite whatever the agent had already started typing.
    const allowRef = useRef({ allowPublic, allowInternal });
    useEffect(() => {
        allowRef.current = { allowPublic, allowInternal };
    }, [allowPublic, allowInternal]);

    useEffect(() => {
        if (!documentId || typeof window === "undefined") return;
        let saved = null;
        try {
            const raw = window.localStorage.getItem(draftKey(documentId, userId));
            saved = raw ? JSON.parse(raw) : null;
        } catch (_) {
            // A corrupt draft is not worth breaking the screen for.
        }
        setBody((saved && saved.body) || "");
        setRestored(Boolean(saved && saved.body));
        setError(null);
        const wanted = saved && saved.mode === INTERNAL ? INTERNAL : PUBLIC;
        const allow = allowRef.current;
        if (wanted === INTERNAL && allow.allowInternal) setMode(INTERNAL);
        else if (allow.allowPublic) setMode(PUBLIC);
        else if (allow.allowInternal) setMode(INTERNAL);
    }, [documentId, userId]);

    // A mode the ticket no longer permits (a closed ticket takes internal notes
    // only) must not stay selected — the send button would promise an audience
    // the server will refuse.
    useEffect(() => {
        if (mode === PUBLIC && !allowPublic && allowInternal) setMode(INTERNAL);
        if (mode === INTERNAL && !allowInternal && allowPublic) setMode(PUBLIC);
    }, [allowPublic, allowInternal, mode]);

    useEffect(() => {
        if (!documentId || typeof window === "undefined") return undefined;
        const key = draftKey(documentId, userId);
        const timer = setTimeout(() => {
            try {
                if (body.trim()) {
                    window.localStorage.setItem(key, JSON.stringify({ body, mode, savedAt: Date.now() }));
                } else {
                    window.localStorage.removeItem(key);
                }
            } catch (_) {
                // Storage full or blocked — the draft is a convenience, not a contract.
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [body, mode, documentId, userId]);

    const switchMode = (next) => {
        if (next === mode || sending) return;
        // Defence 5. Internal → public is the dangerous direction: text written
        // for colleagues must never become a customer reply on a stray click.
        if (mode === INTERNAL && next === PUBLIC && body.trim()) {
            const ok = window.confirm(
                "This text was written as an INTERNAL note.\n\n"
                + "Switching to a public reply means it will be sent to the requester.\n\n"
                + "Switch to a public reply?"
            );
            if (!ok) return;
        }
        setMode(next);
        setError(null);
        setRestored(false);
        if (textareaRef.current) textareaRef.current.focus();
    };

    const send = useCallback(async () => {
        const text = body.trim();
        if (!text || sending || disabled) return;
        if (mode === PUBLIC && !allowPublic) return;
        if (mode === INTERNAL && !allowInternal) return;

        setSending(true);
        setError(null);
        setRestored(false);
        // Cleared up front so the composer feels instant; `text` is the rollback
        // copy. A failed send restores it — losing a typed reply is worse than
        // a slow one.
        setBody("");
        try {
            // Defence 6: visibility travels on every call, explicitly.
            await onSend({ body: text, visibility: mode });
            try {
                window.localStorage.removeItem(draftKey(documentId, userId));
            } catch (_) {}
        } catch (err) {
            setBody(text);
            const info = apiError(err);
            setError(
                info.status === 409
                    ? `${info.message} — your text has been kept.`
                    : `${info.message} (your text has been kept)`
            );
        } finally {
            setSending(false);
        }
    }, [body, sending, disabled, mode, allowPublic, allowInternal, onSend, documentId, userId]);

    const onKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            send();
        }
    };

    const internal = mode === INTERNAL;
    const canSend = Boolean(body.trim()) && !sending && !disabled
        && (internal ? allowInternal : allowPublic);

    return (
        <div className="card mt-3">
            <div className="card-body">
                {/* Defence 1: a persistent two-state control. Both states are
                    always on screen with a word and an icon each — never an
                    icon alone, never a menu, never an implicit default. */}
                <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <div className="btn-group" role="group" aria-label="Message audience">
                        <button
                            type="button"
                            className={`btn ${internal ? "btn-outline-primary" : "btn-primary"}`}
                            onClick={() => switchMode(PUBLIC)}
                            disabled={!allowPublic || sending}
                            aria-pressed={!internal}
                            title={allowPublic ? "Reply to the requester" : publicBlockedReason}
                        >
                            <i className="fa-solid fa-reply me-2"></i>Public reply
                        </button>
                        <button
                            type="button"
                            className={`btn ${internal ? "btn-warning" : "btn-outline-warning"}`}
                            onClick={() => switchMode(INTERNAL)}
                            disabled={!allowInternal || sending}
                            aria-pressed={internal}
                            title="Internal note — colleagues only"
                        >
                            <i className="fa-solid fa-lock me-2"></i>Internal note
                        </button>
                    </div>
                    <span className={`small ${internal ? "text-warning-emphasis fw-semibold" : "text-muted"}`}>
                        {internal
                            ? "Only agents on this desk will see this. The requester will not."
                            : "This goes to the requester."}
                    </span>
                    {restored && (
                        <span className="badge text-bg-light border ms-auto">
                            <i className="fa-solid fa-rotate-left me-1"></i>Draft restored
                        </span>
                    )}
                </div>

                {/* Defence 2: the whole composer changes background and border in
                    internal mode, not just a label somewhere near it. */}
                <div className="p-2 rounded" style={SHELL[mode]}>
                    {internal && (
                        <div className="d-flex align-items-center mb-2 small fw-bold text-uppercase" style={{ color: "#7a5600", letterSpacing: "0.03em" }}>
                            <i className="fa-solid fa-lock me-2"></i>
                            Internal — not visible to the requester
                        </div>
                    )}
                    <label className="form-label visually-hidden" htmlFor="hd-composer-body">
                        {internal ? "Internal note" : "Public reply"}
                    </label>
                    <textarea
                        id="hd-composer-body"
                        ref={textareaRef}
                        className="form-control"
                        rows={5}
                        style={{ background: "transparent" }}
                        placeholder={internal ? "Write a note for your colleagues…" : "Write your reply to the requester…"}
                        value={body}
                        disabled={disabled || sending}
                        onChange={(e) => setBody(e.target.value)}
                        onKeyDown={onKeyDown}
                    />
                </div>

                {disabled && disabledReason && (
                    <div className="alert alert-secondary mt-2 mb-0 py-2 small">
                        <i className="fa-solid fa-circle-info me-2"></i>{disabledReason}
                    </div>
                )}
                {!disabled && !allowPublic && publicBlockedReason && (
                    <div className="alert alert-secondary mt-2 mb-0 py-2 small">
                        <i className="fa-solid fa-circle-info me-2"></i>{publicBlockedReason}
                    </div>
                )}
                {error && (
                    <div className="alert alert-danger mt-2 mb-0 py-2 small d-flex align-items-start">
                        <i className="fa-solid fa-triangle-exclamation me-2 mt-1"></i>
                        <span>{error}</span>
                    </div>
                )}

                <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                    {/* Defence 3: the button names its audience. */}
                    <button
                        type="button"
                        className={`btn ${internal ? "btn-warning" : "btn-primary"}`}
                        onClick={send}
                        disabled={!canSend}
                    >
                        {sending
                            ? <><span className="spinner-border spinner-border-sm me-2" role="status"></span>Sending…</>
                            : internal
                                ? <><i className="fa-solid fa-lock me-2"></i>Save internal note</>
                                : <><i className="fa-solid fa-paper-plane me-2"></i>Send to requester</>}
                    </button>
                    <span className="text-muted small">Ctrl+Enter sends</span>
                </div>
            </div>
        </div>
    );
}
