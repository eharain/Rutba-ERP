import { useEffect, useMemo, useRef, useState } from "react";

// Envelope list for one folder — server-paged, newest first, grouped into
// conversations. Everything shown here came from a live IMAP FETCH; nothing
// is stored. Threading v1 groups by normalized subject within the loaded
// page (References-based chains can graduate later without UI change).
//
// The list also owns the keyboard CURSOR's ordering: only this component
// knows which rows are actually on screen once conversations collapse, so it
// publishes the visible uid order upward and the page drives j/k from that.

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

/** Keeps the cursored row inside the scroll viewport as j/k walks past it. */
function useScrollIntoView(active) {
    const ref = useRef(null);
    useEffect(() => {
        if (active) ref.current?.scrollIntoView({ block: "nearest" });
    }, [active]);
    return ref;
}

function Row({ m, activeUid, cursorUid, selected, tags, indent, onOpen, onToggleSelect }) {
    const cursored = m.uid === cursorUid;
    const ref = useScrollIntoView(cursored);
    return (
        <div
            ref={ref}
            className={`mail-row ${m.seen ? "" : "unseen"} ${m.uid === activeUid ? "active" : ""} ${cursored ? "cursor" : ""}`}
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
    listing, activeUid, cursorUid, loading, error, page, tags = [], folders = [],
    archiveFolder = null, sharedInbox = false,
    onOpen, onPage, onRefresh, onBulk, onVisibleUids,
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

    // What j/k walks: rows in render order. A COLLAPSED conversation
    // contributes only its head — otherwise a folder of two-message threads
    // would have almost nothing the keyboard could land on.
    const visibleUids = useMemo(() => {
        const out = [];
        for (const { key, list } of groups) {
            if (list.length === 1 || !expanded.has(key)) out.push(list[0].uid);
            else out.push(...list.map((m) => m.uid));
        }
        return out;
    }, [groups, expanded]);

    const visibleKey = visibleUids.join(",");
    useEffect(() => {
        onVisibleUids?.(visibleUids);
    }, [visibleKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Deleting a tag asks; deleting mail used to just go. Same prompt, and it
    // names the count, because "Delete" on 40 selected rows is the one click
    // in this app nobody gets to take back.
    const confirmBulkDelete = () => {
        const n = selected.size;
        if (!window.confirm(`Delete ${n} message${n === 1 ? "" : "s"}?\n\nThey move to Trash (or are expunged if this IS Trash).`)) return;
        bulk("delete");
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
                    {archiveFolder && (
                        <button className="btn btn-sm btn-outline-primary" title={`Move to ${archiveFolder}`}
                            onClick={() => bulk("archive")}>
                            <i className="fa-solid fa-box-archive me-1"></i>Archive
                        </button>
                    )}
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => bulk("read")}>Read</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => bulk("unread")}>Unread</button>
                    <button className="btn btn-sm btn-outline-warning" title="Flag these messages"
                        onClick={() => bulk("flag")}>
                        <i className="fa-solid fa-flag"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-secondary" title="Clear the flag"
                        onClick={() => bulk("unflag")}>
                        <i className="fa-regular fa-flag"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-danger" onClick={confirmBulkDelete}>Delete</button>
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
                            return <Row key={list[0].uid} m={list[0]} activeUid={activeUid} cursorUid={cursorUid}
                                selected={selected} tags={tags} onOpen={onOpen} onToggleSelect={toggleSelect} />;
                        }
                        const head = list[0];
                        const unseen = list.filter((m) => !m.seen).length;
                        const open = expanded.has(key);
                        // While collapsed the group row stands in for its head,
                        // so the cursor has somewhere to show.
                        const cursored = !open && head.uid === cursorUid;
                        return (
                            <div key={key}>
                                <div className={`mail-row ${unseen ? "unseen" : ""} ${cursored ? "cursor" : ""}`}
                                    onClick={() => toggleGroup(key)}>
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
                                    <Row key={m.uid} m={m} activeUid={activeUid} cursorUid={cursorUid} selected={selected}
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
