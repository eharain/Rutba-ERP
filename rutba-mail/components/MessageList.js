// Envelope list for one folder — server-paged, newest first. Everything shown
// here came from a live IMAP FETCH; nothing is stored.

function fmtDate(value) {
    if (!value) return "";
    const d = new Date(value);
    const now = new Date();
    return d.toDateString() === now.toDateString()
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString();
}

export default function MessageList({
    listing, activeUid, loading, error, page, onOpen, onPage, onRefresh,
}) {
    const total = listing?.total || 0;
    const pageSize = listing?.pageSize || 50;
    const pages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="d-flex flex-column h-100">
            <div className="d-flex align-items-center justify-content-between border-bottom px-2 py-1">
                <span className="small text-muted">{total} message{total === 1 ? "" : "s"}</span>
                <div className="btn-group btn-group-sm">
                    <button className="btn btn-outline-secondary" title="Refresh" onClick={onRefresh}>
                        <i className="fa-solid fa-rotate"></i>
                    </button>
                    <button className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                        <i className="fa-solid fa-chevron-left"></i>
                    </button>
                    <button className="btn btn-outline-secondary" disabled>{page}/{pages}</button>
                    <button className="btn btn-outline-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
                        <i className="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-warning m-2 small">{error}</div>}
            {loading ? (
                <div className="text-muted small p-3">Loading…</div>
            ) : (listing?.messages || []).length === 0 && !error ? (
                <div className="text-muted small p-3">This folder is empty.</div>
            ) : (
                <div className="flex-grow-1">
                    {(listing?.messages || []).map((m) => (
                        <div
                            key={m.uid}
                            className={`mail-row ${m.seen ? "" : "unseen"} ${m.uid === activeUid ? "active" : ""}`}
                            onClick={() => onOpen(m)}
                        >
                            <div className="mail-row-from">
                                <span className="text-truncate">
                                    {m.flagged && <i className="fa-solid fa-flag text-warning me-1"></i>}
                                    {m.from?.name || m.from?.address || "(unknown)"}
                                </span>
                                <span className="mail-row-date">{fmtDate(m.date)}</span>
                            </div>
                            <div className="mail-row-subject">
                                {m.answered && <i className="fa-solid fa-reply text-muted me-1"></i>}
                                {m.hasAttachments && <i className="fa-solid fa-paperclip text-muted me-1"></i>}
                                {m.subject || "(no subject)"}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
