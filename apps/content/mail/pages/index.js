import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MailAccountsEndpoints, MailTagsEndpoints } from "@rutba/api-provider/endpoints";
import FolderTree from "../components/FolderTree";
import FilterBar from "../components/FilterBar";
import MessageList from "../components/MessageList";
import MessageView from "../components/MessageView";
import ComposeDialog, { composeDraftFrom, composeDraftFromDraft } from "../components/ComposeDialog";
import { useShortcuts, ShortcutHelp } from "../components/KeyboardShortcuts";
import { useMarkReadOnOpen } from "../components/readingPrefs";

// The mail client. Everything on this page is read LIVE over IMAP through the
// backend gateway — there is no local mail store and no sync status, because
// there is no sync. A refresh re-asks the mail server.
//
// IMAP is single-channel and every operation for an account queues behind one
// mutex, so this page keeps its background traffic to exactly ONE thing: a
// periodic unseen-count sweep that covers every visible folder in a single
// round trip, and only while the tab is actually in front of someone.

// One STATUS sweep a minute. On a shared inbox with six agents open that is
// six sweeps a minute for the mailbox — enough to keep badges honest, little
// enough to stay out of the way of people reading mail.
const UNSEEN_POLL_MS = 60_000;

export default function MailClientPage() {
    const { jwt } = useAuth();

    const [accounts, setAccounts] = useState([]);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const [account, setAccount] = useState(null);

    const [folders, setFolders] = useState([]);
    const [specialFolders, setSpecialFolders] = useState({});
    const [folder, setFolder] = useState("INBOX");

    const [listing, setListing] = useState(null);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [searchDraft, setSearchDraft] = useState("");
    const [filters, setFilters] = useState(null);
    const [tags, setTags] = useState([]);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState(null);

    const [message, setMessage] = useState(null);
    const [messageLoading, setMessageLoading] = useState(false);

    const [compose, setCompose] = useState(null); // null = closed; {} or prefill = open
    const [notice, setNotice] = useState(null);
    const [showHelp, setShowHelp] = useState(false);

    // Keyboard cursor. Distinct from the open message: j/k can walk the list
    // while the reading pane stays where it is.
    const [cursorUid, setCursorUid] = useState(null);
    const [visibleUids, setVisibleUids] = useState([]);
    const searchRef = useRef(null);

    // Badges. countsRef is the source of truth so the poll can diff against
    // the same numbers the UI is showing, including local decrements.
    const [unseenCounts, setUnseenCounts] = useState({});
    const [newMail, setNewMail] = useState(null);
    const countsRef = useRef({});
    const baselineSet = useRef(false);

    const [markReadOnOpen] = useMarkReadOnOpen();

    /* accounts */
    useEffect(() => {
        if (!jwt) return;
        setAccountsLoading(true);
        MailAccountsEndpoints.list({ pageSize: 100, filters: { is_active: true } })
            .then((res) => {
                const list = res?.data || [];
                setAccounts(list);
                setAccount((current) => current || list[0] || null);
            })
            .catch((err) => setNotice({ type: "danger", text: `Could not load accounts: ${err.message}` }))
            .finally(() => setAccountsLoading(false));
    }, [jwt]);

    /* folders per account */
    useEffect(() => {
        if (!account) return;
        setFolders([]);
        setSpecialFolders({});
        setFolder("INBOX");
        setMessage(null);
        setNewMail(null);
        baselineSet.current = false;
        countsRef.current = account.unseen_counts || {};
        setUnseenCounts(countsRef.current);
        MailAccountsEndpoints.listFolders(account.documentId)
            .then((res) => {
                setFolders(res?.folders || []);
                setSpecialFolders(res?.specialFolders || {});
            })
            .catch((err) => setNotice({ type: "warning", text: `${account.name}: ${err.message}` }));
    }, [account]);

    /* tag registry (chips + filters everywhere) */
    useEffect(() => {
        if (!jwt) return;
        MailTagsEndpoints.list()
            .then((res) => setTags(res?.data || []))
            .catch(() => setTags([]));
    }, [jwt]);

    // SPECIAL-USE first, then the folder list's own flag — FolderTree already
    // renders these; archive just needed lifting into an actual verb.
    const specialPath = (key, flag) =>
        specialFolders?.[key] || folders.find((f) => f.specialUse === flag)?.path || null;
    const archiveFolder = specialPath("archive", "\\Archive");
    const draftsFolder = specialPath("drafts", "\\Drafts");
    const inDrafts = Boolean(draftsFolder) && folder === draftsFolder;

    /* messages per folder/page/search/filters */
    const loadMessages = useCallback(() => {
        if (!account) return;
        setListLoading(true);
        setListError(null);
        MailAccountsEndpoints.listMessages(account.documentId, {
            folder, page, pageSize: 50, search: search || undefined, ...(filters || {}),
        })
            .then(setListing)
            .catch((err) => { setListing(null); setListError(err.message); })
            .finally(() => setListLoading(false));
    }, [account, folder, page, search, filters]);

    useEffect(() => { loadMessages(); }, [loadMessages]);

    /* ------------------------------------------------------------- badges */

    const applyCounts = useCallback((next) => {
        countsRef.current = next;
        setUnseenCounts(next);
    }, []);

    /** Local, immediate badge correction — reading a message decrements now,
     *  not in up to a minute when the next sweep lands. */
    const bumpUnseen = useCallback((path, delta) => {
        if (!path) return;
        const current = countsRef.current || {};
        applyCounts({ ...current, [path]: Math.max(0, Number(current[path] || 0) + delta) });
    }, [applyCounts]);

    // The selected folder rides in a ref rather than the dependency list:
    // switching folders must not tear down and immediately re-fire the sweep.
    // Clicking through six folders is a navigation, not six reasons to go back
    // to the mail server.
    const folderRef = useRef(folder);
    folderRef.current = folder;

    // One pooled STATUS sweep over every folder on screen. The folders asked
    // for here also become the cron's poll set, which is what finally gives
    // folders other than INBOX a badge at all.
    useEffect(() => {
        if (!account || !folders.length) return undefined;
        const paths = [...new Set(["INBOX", folderRef.current, ...folders.map((f) => f.path)])]
            .filter(Boolean)
            .slice(0, 12);
        let alive = true;

        const tick = () => {
            // A backgrounded tab must not keep a shared mailbox busy.
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            MailAccountsEndpoints.listUnseen(account.documentId, { folders: paths })
                .then((res) => {
                    if (!alive || !res?.counts) return;
                    const before = countsRef.current || {};
                    const grew = baselineSet.current
                        ? Object.keys(res.counts).filter((p) => Number(res.counts[p] || 0) > Number(before[p] || 0))
                        : [];
                    baselineSet.current = true;
                    applyCounts(res.counts);
                    if (grew.length) {
                        setNewMail({
                            folders: grew,
                            total: grew.reduce((n, p) => n + (Number(res.counts[p] || 0) - Number(before[p] || 0)), 0),
                        });
                    }
                })
                .catch(() => { /* a missed sweep is not worth an alert */ });
        };

        tick();
        const timer = setInterval(tick, UNSEEN_POLL_MS);
        return () => { alive = false; clearInterval(timer); };
    }, [account, folders, applyCounts]);

    /* ------------------------------------------------------------ actions */

    /** bulk actions from the list toolbar — one IMAP round-trip per action */
    const onBulk = async (action, { uids, targetFolder, add }) => {
        if (!account || !uids?.length) return;

        // Triage is the exception: import has no bulk route (it is one IMAP
        // fetch per message), and it changes ERP rows rather than the mailbox
        // — so no listing refresh, and the reading pane stays open.
        if (action === "queue") {
            let done = 0;
            let firstError = null;
            for (const uid of uids) {
                try {
                    await MailAccountsEndpoints.createImport(account.documentId, uid, {
                        folder, triage: { status: "open" },
                    });
                    done += 1;
                } catch (err) {
                    firstError = firstError || err.message;
                }
            }
            setNotice(firstError
                ? { type: "warning", text: `Added ${done} of ${uids.length} to the queue — ${firstError}` }
                : { type: "success", text: `Added ${done} message${done === 1 ? "" : "s"} to the shared queue.` });
            return;
        }

        try {
            if (action === "read") await MailAccountsEndpoints.setBulkFlags(account.documentId, { folder, uids, add: ["seen"] });
            else if (action === "unread") await MailAccountsEndpoints.setBulkFlags(account.documentId, { folder, uids, remove: ["seen"] });
            else if (action === "flag") await MailAccountsEndpoints.setBulkFlags(account.documentId, { folder, uids, add: ["flagged"] });
            else if (action === "unflag") await MailAccountsEndpoints.setBulkFlags(account.documentId, { folder, uids, remove: ["flagged"] });
            else if (action === "delete") await MailAccountsEndpoints.removeBulkMessages(account.documentId, { folder, uids });
            else if (action === "move") await MailAccountsEndpoints.transferBulkMessages(account.documentId, { folder, uids, targetFolder });
            else if (action === "archive") {
                if (!archiveFolder) {
                    setNotice({ type: "warning", text: "This mailbox has no Archive folder." });
                    return;
                }
                if (archiveFolder === folder) return; // already there

                await MailAccountsEndpoints.transferBulkMessages(account.documentId, { folder, uids, targetFolder: archiveFolder });
            } else if (action === "tag") await MailAccountsEndpoints.setTags(account.documentId, { folder, uids, add });

            // Anything that left the folder or changed \Seen moves the badge.
            if (["read", "delete", "move", "archive"].includes(action)) {
                const wasUnseen = (listing?.messages || []).filter((m) => uids.includes(m.uid) && !m.seen).length;
                if (wasUnseen) bumpUnseen(folder, -wasUnseen);
            }
            setMessage(null);
            loadMessages();
        } catch (err) {
            setNotice({ type: "warning", text: `Bulk ${action} failed: ${err.message}` });
        }
    };

    const selectFolder = (path) => {
        setFolder(path);
        setPage(1);
        setSearch("");
        setSearchDraft("");
        setFilters(null);
        setMessage(null);
        setNewMail(null);
    };

    /** A draft is not something to read — it is something to keep writing. */
    const openDraft = (envelope) => {
        setMessageLoading(true);
        setMessage(null);
        MailAccountsEndpoints.getMessage(account.documentId, envelope.uid, { folder, forEdit: 1 })
            .then((full) => setCompose(composeDraftFromDraft(full)))
            .catch((err) => setNotice({ type: "warning", text: `Could not open the draft: ${err.message}` }))
            .finally(() => setMessageLoading(false));
    };

    const openMessage = (envelope) => {
        if (!account) return;
        setCursorUid(envelope.uid);
        if (inDrafts) { openDraft(envelope); return; }
        setMessageLoading(true);
        setMessage(null);
        MailAccountsEndpoints.getMessage(account.documentId, envelope.uid, {
            folder, markSeen: markReadOnOpen,
        })
            .then((full) => {
                setMessage(full);
                // Reading no longer marks \Seen behind our back, so reflect
                // what the server actually reports rather than assuming.
                const seen = Boolean(full.flags?.seen);
                setListing((l) => l && {
                    ...l,
                    messages: l.messages.map((m) => (m.uid === envelope.uid ? { ...m, seen } : m)),
                });
                if (!envelope.seen && seen) bumpUnseen(folder, -1);
            })
            .catch((err) => setNotice({ type: "warning", text: `Could not open the message: ${err.message}` }))
            .finally(() => setMessageLoading(false));
    };

    const openByUid = (uid) => {
        const envelope = (listing?.messages || []).find((m) => m.uid === uid);
        if (envelope) openMessage(envelope);
    };

    const onReply = (mode) => setCompose(composeDraftFrom(mode, message, account, folder));

    const onSent = (res) => {
        setCompose(null);
        setNotice(res?.draft
            ? { type: "success", text: `Draft saved${res?.appendedTo ? ` to ${res.appendedTo}` : ""}.` }
            : {
                type: res?.appendError ? "warning" : "success",
                text: res?.appendError
                    ? `Sent, but the Sent-folder copy failed: ${res.appendError}`
                    : `Sent${res?.appendedTo ? ` — saved to ${res.appendedTo}` : ""}.`,
            });

        // The list has always drawn a reply arrow from \Answered; nothing ever
        // set it, so it was decoration. A sent reply sets it now.
        const replied = !res?.draft && res?.sourceUid && res?.sourceFolder;
        if (replied) {
            MailAccountsEndpoints.setFlags(account.documentId, res.sourceUid, {
                folder: res.sourceFolder, add: ["answered"],
            })
                .then(() => {
                    setMessage((m) => (m && m.uid === res.sourceUid ? { ...m, flags: { ...m.flags, answered: true } } : m));
                    setListing((l) => l && {
                        ...l,
                        messages: l.messages.map((m) => (m.uid === res.sourceUid ? { ...m, answered: true } : m)),
                    });
                })
                .catch(() => { /* the reply went out; the marker is cosmetic */ });
        }
        if (message || inDrafts) loadMessages();
    };

    const closeCompose = (info) => {
        setCompose(null);
        if (info?.savedDraftTo) {
            setNotice({ type: "info", text: `Unsent message saved to ${info.savedDraftTo}.` });
            if (inDrafts) loadMessages();
        }
    };

    const onDeleted = () => {
        if (message && !message.flags?.seen) bumpUnseen(folder, -1);
        setMessage(null);
        setNotice({ type: "success", text: "Message deleted." });
        loadMessages();
    };

    const submitSearch = (e) => {
        e.preventDefault();
        setPage(1);
        setSearch(searchDraft.trim());
        setMessage(null);
    };

    /* --------------------------------------------------------- keyboard */

    // Keep the cursor on a row that still exists after a reload or a page turn.
    useEffect(() => {
        if (!visibleUids.length) { setCursorUid(null); return; }
        setCursorUid((c) => (c && visibleUids.includes(c) ? c : visibleUids[0]));
    }, [visibleUids]);

    const onVisibleUids = useCallback((uids) => setVisibleUids(uids), []);

    // Verbs act on the open message when there is one, otherwise on whatever
    // the cursor is sitting on — which is what makes e/# usable straight out
    // of the list without opening anything.
    const targetUid = message?.uid ?? cursorUid;
    const targetEnvelope = useMemo(
        () => (listing?.messages || []).find((m) => m.uid === targetUid) || null,
        [listing, targetUid],
    );

    const moveCursor = (delta) => {
        if (!visibleUids.length) return;
        const i = visibleUids.indexOf(cursorUid);
        const next = visibleUids[Math.min(visibleUids.length - 1, Math.max(0, i < 0 ? 0 : i + delta))];
        if (!next || next === cursorUid) return;
        setCursorUid(next);
        // Once the reading pane is in use it follows the cursor — the
        // three-pane behaviour people expect from j/k.
        if (message) openByUid(next);
    };

    const shortcuts = {
        j: () => moveCursor(1),
        k: () => moveCursor(-1),
        Enter: () => targetUid && openByUid(targetUid),
        u: () => setMessage(null),
        c: () => account && setCompose({}),
        "/": () => searchRef.current?.focus(),
        "?": () => setShowHelp(true),
        Escape: () => setShowHelp(false),
        r: () => message && onReply("reply"),
        a: () => message && onReply("reply-all"),
        f: () => message && onReply("forward"),
        e: () => targetUid && onBulk("archive", { uids: [targetUid] }),
        "#": () => {
            if (!targetUid) return;
            if (!window.confirm("Delete this message?\n\nIt moves to Trash.")) return;
            onBulk("delete", { uids: [targetUid] });
        },
        s: () => targetUid && onBulk(targetEnvelope?.flagged ? "unflag" : "flag", { uids: [targetUid] }),
        m: () => targetUid && onBulk(targetEnvelope?.seen ? "unread" : "read", { uids: [targetUid] }),
    };
    useShortcuts(shortcuts, { enabled: !compose && !accountsLoading });

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                    <div className="d-flex align-items-center gap-2">
                        <h4 className="mb-0"><i className="fa-solid fa-envelope text-info me-2"></i>Mail</h4>
                        {accounts.length > 0 && (
                            <select className="form-select form-select-sm" style={{ maxWidth: "20rem" }}
                                value={account?.documentId || ""}
                                onChange={(e) => setAccount(accounts.find((a) => a.documentId === e.target.value) || null)}>
                                {accounts.map((a) => (
                                    <option key={a.documentId} value={a.documentId}>
                                        {a.kind === "shared" ? "👥 " : ""}{a.name} — {a.email}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div className="d-flex align-items-center gap-2">
                        <form className="input-group input-group-sm" style={{ width: "18rem" }} onSubmit={submitSearch}>
                            <input className="form-control" placeholder="Search this folder…  ( / )" ref={searchRef}
                                value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
                            {search && (
                                <button type="button" className="btn btn-outline-secondary" title="Clear"
                                    onClick={() => { setSearch(""); setSearchDraft(""); setPage(1); }}>
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            )}
                            <button className="btn btn-outline-secondary"><i className="fa-solid fa-magnifying-glass"></i></button>
                        </form>
                        <button className="btn btn-outline-secondary btn-sm" title="Keyboard shortcuts (?)"
                            onClick={() => setShowHelp(true)}>
                            <i className="fa-solid fa-keyboard"></i>
                        </button>
                        <button className="btn btn-primary btn-sm" disabled={!account} title="Compose (c)"
                            onClick={() => setCompose({})}>
                            <i className="fa-solid fa-pen me-1"></i>Compose
                        </button>
                    </div>
                </div>

                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible py-2`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                {newMail && (
                    <div className="alert alert-info alert-dismissible py-2 d-flex align-items-center gap-2">
                        <i className="fa-solid fa-envelope-circle-check"></i>
                        <span>
                            {newMail.total} new message{newMail.total === 1 ? "" : "s"} in {newMail.folders.join(", ")}.
                        </span>
                        <button type="button" className="btn btn-sm btn-outline-primary"
                            onClick={() => {
                                if (!newMail.folders.includes(folder)) selectFolder(newMail.folders[0]);
                                else loadMessages();
                                setNewMail(null);
                            }}>
                            Show
                        </button>
                        <button type="button" className="btn-close" onClick={() => setNewMail(null)}></button>
                    </div>
                )}

                {accountsLoading ? (
                    <p className="text-muted">Loading accounts…</p>
                ) : accounts.length === 0 ? (
                    <div className="alert alert-light border">
                        No mailboxes connected yet.{" "}
                        <Link href="/settings">Connect your first mailbox</Link> to start
                        reading and sending mail inside the ERP.
                    </div>
                ) : (
                    <div className="mail-client">
                        <div className="mail-folders">
                            <FolderTree folders={folders} activeFolder={folder}
                                unseenCounts={unseenCounts} onSelect={selectFolder} />
                        </div>
                        <div className="mail-list d-flex flex-column">
                            <FilterBar filters={filters} tags={tags}
                                onChange={(f) => { setFilters(f); setPage(1); setMessage(null); }} />
                            <div className="flex-grow-1 overflow-auto">
                                <MessageList
                                    listing={listing}
                                    activeUid={message?.uid}
                                    cursorUid={cursorUid}
                                    loading={listLoading}
                                    error={listError}
                                    page={page}
                                    tags={tags}
                                    folders={folders}
                                    archiveFolder={archiveFolder !== folder ? archiveFolder : null}
                                    sharedInbox={account?.kind === "shared"}
                                    onOpen={openMessage}
                                    onPage={(p) => { setPage(p); setMessage(null); }}
                                    onRefresh={loadMessages}
                                    onBulk={onBulk}
                                    onVisibleUids={onVisibleUids}
                                />
                            </div>
                        </div>
                        <div className="mail-reading">
                            {messageLoading ? (
                                <div className="text-muted small p-3">Opening…</div>
                            ) : inDrafts && !message ? (
                                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                                    <div className="text-center p-4">
                                        <i className="fa-solid fa-file-pen fa-2x mb-2"></i>
                                        <div>Pick a draft to carry on writing it.</div>
                                    </div>
                                </div>
                            ) : (
                                <MessageView
                                    account={account}
                                    folder={folder}
                                    folders={folders}
                                    archiveFolder={archiveFolder}
                                    message={message}
                                    tags={tags}
                                    onReply={onReply}
                                    onDeleted={onDeleted}
                                    onMoved={(toFolder) => {
                                        if (message && !message.flags?.seen) bumpUnseen(folder, -1);
                                        setMessage(null);
                                        setNotice({ type: "success", text: `Moved to ${toFolder}.` });
                                        loadMessages();
                                    }}
                                    onFlagChanged={(flagged) => {
                                        setMessage((m) => m && { ...m, flags: { ...m.flags, flagged } });
                                        setListing((l) => l && {
                                            ...l,
                                            messages: l.messages.map((m) => (m.uid === message?.uid ? { ...m, flagged } : m)),
                                        });
                                    }}
                                    onSeenChanged={(seen) => {
                                        setMessage((m) => m && { ...m, flags: { ...m.flags, seen } });
                                        setListing((l) => l && {
                                            ...l,
                                            messages: l.messages.map((m) => (m.uid === message?.uid ? { ...m, seen } : m)),
                                        });
                                        bumpUnseen(folder, seen ? -1 : 1);
                                    }}
                                    onClose={() => setMessage(null)}
                                />
                            )}
                        </div>
                    </div>
                )}

                {compose && account && (
                    <ComposeDialog account={account} draft={compose} onSent={onSent} onClose={closeCompose} />
                )}
                {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
            </Layout>
        </ProtectedRoute>
    );
}
