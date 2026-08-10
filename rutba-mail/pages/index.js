import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MailAccountsEndpoints } from "@rutba/api-provider/endpoints";
import FolderTree from "../components/FolderTree";
import MessageList from "../components/MessageList";
import MessageView from "../components/MessageView";
import ComposeDialog, { composeDraftFrom } from "../components/ComposeDialog";

// The mail client. Everything on this page is read LIVE over IMAP through the
// backend gateway — there is no local mail store and no sync status, because
// there is no sync. A refresh re-asks the mail server.

export default function MailClientPage() {
    const { jwt } = useAuth();

    const [accounts, setAccounts] = useState([]);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const [account, setAccount] = useState(null);

    const [folders, setFolders] = useState([]);
    const [folder, setFolder] = useState("INBOX");

    const [listing, setListing] = useState(null);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [searchDraft, setSearchDraft] = useState("");
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState(null);

    const [message, setMessage] = useState(null);
    const [messageLoading, setMessageLoading] = useState(false);

    const [compose, setCompose] = useState(null); // null = closed; {} or prefill = open
    const [notice, setNotice] = useState(null);

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
        setFolder("INBOX");
        setMessage(null);
        MailAccountsEndpoints.listFolders(account.documentId)
            .then((res) => setFolders(res?.folders || []))
            .catch((err) => setNotice({ type: "warning", text: `${account.name}: ${err.message}` }));
    }, [account]);

    /* messages per folder/page/search */
    const loadMessages = useCallback(() => {
        if (!account) return;
        setListLoading(true);
        setListError(null);
        MailAccountsEndpoints.listMessages(account.documentId, { folder, page, pageSize: 50, search: search || undefined })
            .then(setListing)
            .catch((err) => { setListing(null); setListError(err.message); })
            .finally(() => setListLoading(false));
    }, [account, folder, page, search]);

    useEffect(() => { loadMessages(); }, [loadMessages]);

    const selectFolder = (path) => {
        setFolder(path);
        setPage(1);
        setSearch("");
        setSearchDraft("");
        setMessage(null);
    };

    const openMessage = (envelope) => {
        if (!account) return;
        setMessageLoading(true);
        setMessage(null);
        MailAccountsEndpoints.getMessage(account.documentId, envelope.uid, { folder })
            .then((full) => {
                setMessage(full);
                // The BODY[] download marked it seen server-side; reflect locally.
                setListing((l) => l && {
                    ...l,
                    messages: l.messages.map((m) => (m.uid === envelope.uid ? { ...m, seen: true } : m)),
                });
            })
            .catch((err) => setNotice({ type: "warning", text: `Could not open the message: ${err.message}` }))
            .finally(() => setMessageLoading(false));
    };

    const onReply = (mode) => setCompose(composeDraftFrom(mode, message, account));

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
        if (message) loadMessages();
    };

    const onDeleted = () => {
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
                            <input className="form-control" placeholder="Search this folder…"
                                value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
                            {search && (
                                <button type="button" className="btn btn-outline-secondary" title="Clear"
                                    onClick={() => { setSearch(""); setSearchDraft(""); setPage(1); }}>
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            )}
                            <button className="btn btn-outline-secondary"><i className="fa-solid fa-magnifying-glass"></i></button>
                        </form>
                        <button className="btn btn-primary btn-sm" disabled={!account} onClick={() => setCompose({})}>
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
                                unseenCounts={account?.unseen_counts} onSelect={selectFolder} />
                        </div>
                        <div className="mail-list">
                            <MessageList
                                listing={listing}
                                activeUid={message?.uid}
                                loading={listLoading}
                                error={listError}
                                page={page}
                                onOpen={openMessage}
                                onPage={(p) => { setPage(p); setMessage(null); }}
                                onRefresh={loadMessages}
                            />
                        </div>
                        <div className="mail-reading">
                            {messageLoading ? (
                                <div className="text-muted small p-3">Opening…</div>
                            ) : (
                                <MessageView
                                    account={account}
                                    folder={folder}
                                    folders={folders}
                                    message={message}
                                    onReply={onReply}
                                    onDeleted={onDeleted}
                                    onMoved={(toFolder) => {
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
                                    onClose={() => setMessage(null)}
                                />
                            )}
                        </div>
                    </div>
                )}

                {compose && account && (
                    <ComposeDialog account={account} draft={compose} onSent={onSent} onClose={() => setCompose(null)} />
                )}
            </Layout>
        </ProtectedRoute>
    );
}
