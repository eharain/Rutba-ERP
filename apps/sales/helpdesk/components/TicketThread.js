import { useState } from "react";

/**
 * Entry styling lives here, not in a stylesheet, for the same reason the
 * composer's does: spec 38.5 requires the internal/public distinction to
 * survive tenant branding, and a class name in a shared sheet is exactly what
 * a theme would override. Logical properties keep the marker on the leading
 * edge under Urdu RTL.
 */
const ENTRY = {
    public: {
        background: "#ffffff",
        border: "1px solid #dee2e6",
        borderInlineStartWidth: "5px",
        borderInlineStartColor: "#0d6efd",
        borderInlineStartStyle: "solid",
    },
    internal: {
        background: "#fff4d6",
        border: "1px solid #d39e00",
        borderInlineStartWidth: "5px",
        borderInlineStartColor: "#8a6100",
        borderInlineStartStyle: "solid",
    },
};

// Presentation only, with a fallback for anything unrecognised — author_kind is
// written by the server and this must never be the thing that hides a message.
const AUTHOR_KIND = {
    requester: { label: "Requester", icon: "fa-user", css: "text-bg-secondary" },
    agent: { label: "Agent", icon: "fa-headset", css: "text-bg-primary" },
    system: { label: "System", icon: "fa-gear", css: "text-bg-dark" },
    ai: { label: "AI", icon: "fa-robot", css: "text-bg-info" },
};

function authorKind(kind) {
    return AUTHOR_KIND[kind] || { label: kind || "Unknown", icon: "fa-circle-question", css: "text-bg-light border" };
}

function when(value) {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function deliveryLabel(state) {
    if (!state || typeof state !== "object") return null;
    const text = state.state || state.status || null;
    return text ? String(text) : null;
}

function MessageEntry({ message, canRedact, onRedact, selectable, selected, onToggleSelect }) {
    const internal = message.visibility === "internal";
    const kind = authorKind(message.author_kind);
    const redacted = Boolean(message.redacted_at);
    const delivery = deliveryLabel(message.delivery_state);
    const pending = message.__pending;
    const failed = message.__failed;

    return (
        <li
            className="list-group-item px-3 py-3 mb-2 rounded"
            style={{ ...ENTRY[internal ? "internal" : "public"], opacity: pending ? 0.65 : 1 }}
        >
            {/* Defence 4: on EVERY internal entry, not only the first one. */}
            {internal && (
                <div
                    className="d-flex align-items-center mb-2 small fw-bold text-uppercase"
                    style={{ color: "#7a5600", letterSpacing: "0.03em" }}
                >
                    <i className="fa-solid fa-lock me-2"></i>
                    Internal — not visible to the requester
                </div>
            )}

            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                {selectable && message.documentId && (
                    <input
                        type="checkbox"
                        className="form-check-input mt-0"
                        checked={Boolean(selected)}
                        onChange={() => onToggleSelect(message.documentId)}
                        aria-label="Select this message to split"
                    />
                )}
                <strong>{message.author_label || kind.label}</strong>
                <span className={`badge ${kind.css}`}>
                    <i className={`fa-solid ${kind.icon} me-1`}></i>{kind.label}
                </span>
                {message.channel && (
                    <span className="badge text-bg-light border">
                        <i className="fa-solid fa-tower-broadcast me-1"></i>{message.channel}
                    </span>
                )}
                {message.is_opening && (
                    <span className="badge text-bg-light border">
                        <i className="fa-solid fa-flag me-1"></i>Opening
                    </span>
                )}
                {message.is_first_response && (
                    <span className="badge text-bg-success">
                        <i className="fa-solid fa-check me-1"></i>First response
                    </span>
                )}
                {delivery && (
                    <span className="badge text-bg-light border">
                        <i className="fa-solid fa-envelope-circle-check me-1"></i>{delivery}
                    </span>
                )}
                <small className="text-muted ms-auto">{when(message.createdAt)}</small>
            </div>

            {redacted ? (
                <div className="text-muted fst-italic">
                    <i className="fa-solid fa-eraser me-2"></i>
                    Message redacted{message.redaction_reason ? ` — ${message.redaction_reason}` : ""}
                    <span className="ms-2 small">({when(message.redacted_at)})</span>
                </div>
            ) : (
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.body}</div>
            )}

            {(pending || failed || (canRedact && !redacted && message.documentId)) && (
                <div className="d-flex align-items-center gap-2 mt-2">
                    {pending && (
                        <span className="text-muted small">
                            <span className="spinner-border spinner-border-sm me-2" role="status"></span>Sending…
                        </span>
                    )}
                    {failed && (
                        <span className="text-danger small">
                            <i className="fa-solid fa-triangle-exclamation me-1"></i>Not sent — the text was returned to the composer
                        </span>
                    )}
                    {canRedact && !redacted && message.documentId && !pending && (
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-danger ms-auto"
                            onClick={() => onRedact(message)}
                        >
                            <i className="fa-solid fa-eraser me-1"></i>Redact
                        </button>
                    )}
                </div>
            )}
        </li>
    );
}

export default function TicketThread({
    messages = [],
    loading = false,
    error = null,
    stale = false,
    lastLoadedAt = null,
    onRetry,
    canRedact = false,
    onRedact,
    total = 0,
    hasMore = false,
    loadingMore = false,
    onLoadMore,
    selectable = false,
    selected,
    onToggleSelect,
    newCount = 0,
    onAcknowledgeNew,
}) {
    const [collapsed, setCollapsed] = useState(false);
    const has = messages.length > 0;

    return (
        <div className="card">
            <div className="card-header d-flex flex-wrap align-items-center gap-2">
                <strong><i className="fa-solid fa-comments me-2"></i>Conversation</strong>
                {total > 0 && <span className="badge text-bg-secondary">{total}</span>}
                <div className="ms-auto d-flex align-items-center gap-2">
                    {newCount > 0 && (
                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={onAcknowledgeNew}>
                            <i className="fa-solid fa-arrow-down me-1"></i>
                            {newCount} new {newCount === 1 ? "message" : "messages"}
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={onRetry}
                        disabled={loading}
                        title="Refresh the thread"
                    >
                        <i className="fa-solid fa-rotate"></i>
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary d-lg-none"
                        onClick={() => setCollapsed((c) => !c)}
                    >
                        <i className={`fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}`}></i>
                    </button>
                </div>
            </div>

            {/* Stale-data-wins (spec 38.7): a failed background refresh gets a
                banner over the conversation the agent is reading, never an error
                card in place of it. */}
            {stale && has && (
                <div className="alert alert-warning rounded-0 mb-0 py-2 small d-flex align-items-center">
                    <i className="fa-solid fa-triangle-exclamation me-2"></i>
                    <span>
                        Showing the conversation as of {when(lastLoadedAt)} — the last refresh failed.
                    </span>
                    <button type="button" className="btn btn-sm btn-outline-dark ms-auto" onClick={onRetry}>
                        Retry
                    </button>
                </div>
            )}

            {!collapsed && (
                <div className="card-body" style={{ maxHeight: "62vh", overflowY: "auto" }}>
                    {hasMore && (
                        <div className="text-center mb-3">
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={onLoadMore}
                                disabled={loadingMore}
                            >
                                {loadingMore
                                    ? <><span className="spinner-border spinner-border-sm me-2" role="status"></span>Loading…</>
                                    : <>Load older messages ({messages.length} of {total})</>}
                            </button>
                        </div>
                    )}

                    {loading && !has && (
                        <div aria-busy="true">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="placeholder-glow mb-3">
                                    <span className="placeholder col-4 d-block mb-2"></span>
                                    <span className="placeholder col-11 d-block mb-1"></span>
                                    <span className="placeholder col-8 d-block"></span>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && !has && error && (
                        <div className="alert alert-danger mb-0">
                            <div><i className="fa-solid fa-triangle-exclamation me-2"></i>{error}</div>
                            <button type="button" className="btn btn-sm btn-outline-danger mt-2" onClick={onRetry}>
                                Retry
                            </button>
                        </div>
                    )}

                    {!loading && !has && !error && (
                        <div className="text-muted">
                            <i className="fa-solid fa-inbox me-2"></i>
                            This ticket has no messages yet. Your first reply will open the conversation.
                        </div>
                    )}

                    {has && (
                        <ul className="list-group list-group-flush" aria-live="polite">
                            {messages.map((m, index) => (
                                <MessageEntry
                                    key={m.documentId || m.__tempId || `entry-${index}`}
                                    message={m}
                                    canRedact={canRedact}
                                    onRedact={onRedact}
                                    selectable={selectable}
                                    selected={selected && m.documentId ? selected.has(m.documentId) : false}
                                    onToggleSelect={onToggleSelect}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
