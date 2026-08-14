import { useMemo, useState } from "react";

// Envelope list for one folder — server-paged, newest first, grouped into
// conversations. Everything shown here came from a live IMAP FETCH; nothing
// is stored. Threading v1 groups by normalized subject within the loaded
// page (References-based chains can graduate later without UI change).

function fmtDate(value) {
    if (!value) return "";
    const d = new Date(value);
    const now = new Date();
    return d.toDateString() === now.toDateString()
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString();
}

const normSubject = (s) =>
    String(s || "").replace(/^(\s*(re|fwd?|aw)\s*(\[\d+\])?\s*:\s*)+/i, "").trim().toLowerCase() || "(no subject)";

function TagChips({ slugs, tags }) {
    if (!slugs?.length || !tags?.length) return null;
    return slugs.map((slug) => {
        const tag = tags.find((t) => t.slug === slug);
        if (!tag) return null;
        return (
            <span key={slug} className="badge me-1"
                style={{ backgroundColor: tag.color || "#6c757d", fontSize: "0.65rem" }}>
                {tag.name}
            </span>
        );
    });
}

function Row({ m, activeUid, selected, tags, indent, onOpen, onToggleSelect }) {
    return (
        <div
            className={`mail-row ${m.seen ? "" : "unseen"} ${m.uid === activeUid ? "active" : ""}`}
            style={indent ? { paddingLeft: "1.6rem" } : undefined}
            onClick={() => onOpen(m)}
        >
            <div className="mail-row-from">
                <span className="text-truncate">
                    <input type="checkbox" className="form-check-input me-2" checked={selected.has(m.uid)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onToggleSelect(m.uid)} />
                    {m.flagged && <i className="fa-solid fa-flag text-warning me-1"></i>}
                    {m.from?.name || m.from?.address || "(unknown)"}
                </span>
                <span className="mail-row-date">{fmtDate(m.date)}</span>
            </div>
            <div className="mail-row-subject">
                {m.answered && <i className="fa-solid fa-reply text-muted me-1"></i>}
                {m.hasAttachments && <i className="fa-solid fa-paperclip text-muted me-1"></i>}
                <TagChips slugs={m.tags} tags={tags} />
                {m.subject || "(no subject)"}
            </div>
        </div>
    );
}

export default function MessageList({
    listing, activeUid, loading, error, page, tags = [], folders = [], sharedInbox = false,
    onOpen, onPage, onRefresh, onBulk,
}) {
    const total = listing?.total || 0;
    const pageSize = listing?.pageSize || 50;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const messages = listing?.messages || [];

    const [selected, setSelected] = useState(new Set());
    const [expanded, setExpanded] = useState(new Set());
    const [moveTo, setMoveTo] = useState("");
    const [tagPick, setTagPick] = useState("");

    // Conversation groups over the loaded window, newest-first by group head.
    const groups = useMemo(() => {
        const byKey = new Map();
        for (const m of messages) {
            const key = normSubject(m.subject);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(m);
        }
        return [...byKey.entries()].map(([key, list]) => ({ key, list }));
    }, [messages]);

    const toggleSelect = (uid) => setSelected((s) => {
        const next = new Set(s);
        if (next.has(uid)) next.delete(uid); else next.add(uid);
        return next;
    });
    const allSelected = messages.length > 0 && messages.every((m) => selected.has(m.uid));
    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(messages.map((m) => m.uid)));
    const clearSelection = () => setSelected(new Set());

    const bulk = (action, payload) => {
        onBulk(action, { uids: [...selected], ...payload });
        clearSelection();
        setMoveTo("");
        setTagPick("");
    };

    const toggleGroup = (key) => setExpanded((s) => {
        const next = new Set(s);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    return (
        <div className="d-flex flex-column h-100">
            <div className="d-flex align-items-center justify-content-between border-bottom px-2 py-1">
                <span className="small text-muted">
                    <input type="checkbox" className="form-check-input me-2" checked={allSelected}
                        onChange={toggleAll} title="Select all on this page" />
                    {total} message{total === 1 ? "" : "s"}
                </span>
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

            {selected.size > 0 && (
                <div className="d-flex align-items-center gap-1 flex-wrap border-bottom bg-light px-2 py-1">
                    <span className="small me-1">{selected.size} selected</span>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => bulk("read")}>Read</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => bulk("unread")}>Unread</button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => bulk("delete")}>Delete</button>
                    {sharedInbox && (
                        <button className="btn btn-sm btn-outline-primary" title="Import these into the shared triage queue"
                            onClick={() => bulk("queue")}>
                            <i className="fa-solid fa-inbox me-1"></i>Add to queue
                        </button>
                    )}
                    <select className="form-select form-select-sm" style={{ width: "9rem" }} value={moveTo}
                        onChange={(e) => { if (e.target.value) bulk("move", { targetFolder: e.target.value }); }}>
                        <option value="">Move to…</option>
                        {folders.map((f) => <option key={f.path} value={f.path}>{f.path}</option>)}
                    </select>
                    {tags.length > 0 && (
                        <select className="form-select form-select-sm" style={{ width: "8rem" }} value={tagPick}
                            onChange={(e) => { if (e.target.value) bulk("tag", { add: [e.target.value] }); }}>
                            <option value="">Tag…</option>
                            {tags.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                        </select>
                    )}
                    <button className="btn btn-sm btn-link text-muted" onClick={clearSelection}>Clear</button>
                </div>
            )}

            {error && <div className="alert alert-warning m-2 small">{error}</div>}
            {loading ? (
                <div className="text-muted small p-3">Loading…</div>
            ) : messages.length === 0 && !error ? (
                <div className="text-muted small p-3">Nothing here.</div>
            ) : (
                <div className="flex-grow-1">
                    {groups.map(({ key, list }) => {
                        if (list.length === 1) {
                            return <Row key={list[0].uid} m={list[0]} activeUid={activeUid} selected={selected}
                                tags={tags} onOpen={onOpen} onToggleSelect={toggleSelect} />;
                        }
                        const head = list[0];
                        const unseen = list.filter((m) => !m.seen).length;
                        const open = expanded.has(key);
                        return (
                            <div key={key}>
                                <div className={`mail-row ${unseen ? "unseen" : ""}`} onClick={() => toggleGroup(key)}>
                                    <div className="mail-row-from">
                                        <span className="text-truncate">
                                            <i className={`fa-solid fa-chevron-${open ? "down" : "right"} text-muted me-2`}></i>
                                            {[...new Set(list.map((m) => m.from?.name || m.from?.address || "?"))].slice(0, 3).join(", ")}
                                        </span>
                                        <span className="mail-row-date">{fmtDate(head.date)}</span>
                                    </div>
                                    <div className="mail-row-subject">
                                        <span className="badge bg-secondary me-1">{list.length}</span>
                                        {list.some((m) => m.hasAttachments) && <i className="fa-solid fa-paperclip text-muted me-1"></i>}
                                        {head.subject || "(no subject)"}
                                    </div>
                                </div>
                                {open && list.map((m) => (
                                    <Row key={m.uid} m={m} activeUid={activeUid} selected={selected}
                                        tags={tags} indent onOpen={onOpen} onToggleSelect={toggleSelect} />
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
