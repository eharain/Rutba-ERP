import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MailAccountsEndpoints, MailServersEndpoints, UsersEndpoints } from "@rutba/api-provider/endpoints";

/**
 * Email access for one user, as two checkbox questions rather than a form:
 *
 *   1. "Has a personal mailbox" — ticking derives the address from the user's
 *      own email local part and the registered mail domain, provisions it on
 *      the mail server, and links it to this user id. No fields to fill in.
 *   2. "Shared inboxes" — one checkbox per shared inbox; ticking adds this user
 *      to that inbox's owners. The same relation the /mailboxes page edits from
 *      the other side, so both directions stay in step.
 *
 * ── Ticking is attach-or-provision, not always provision ──────────────────
 * If an account already exists at the derived address (previously provisioned,
 * or created by hand and left unowned) ticking ATTACHES it. Provisioning
 * unconditionally would just fail on a duplicate address and leave the admin
 * with an error they cannot act on.
 *
 * ── Unticking never deletes ───────────────────────────────────────────────
 * It removes this user from the mailbox's owners. The mailbox and its mail are
 * untouched; re-ticking re-attaches the same account. Deleting a mailbox is a
 * deliberate act on the /mailboxes list, not a side effect of a checkbox here.
 *
 * Access that comes from an app-role (shared inboxes list role keys in
 * access_roles) is shown ticked and disabled: it is real access, but it is not
 * this user's to grant or revoke — it follows the role.
 */
export default function UserMailboxes({ userId, userEmail, userRoleKeys = [] }) {
    const [accounts, setAccounts] = useState([]);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [busyKey, setBusyKey] = useState("");
    const [domain, setDomain] = useState("");

    const uid = Number(userId);

    useEffect(() => { if (uid) loadAll(); }, [uid]);

    async function loadAll() {
        setLoading(true);
        setError("");
        try {
            const [accRes, srvRes] = await Promise.all([
                MailAccountsEndpoints.listAccess(),
                MailServersEndpoints.list({ pageSize: 100 }).catch(() => ({ data: [] })),
            ]);
            setAccounts(accRes?.data || []);
            setServers((srvRes?.data || []).filter((s) => s.is_active !== false));
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Failed to load mailboxes");
        } finally {
            setLoading(false);
        }
    }

    // Every domain any active mail server can provision into, with the server
    // that owns it — createMailbox can resolve the server from the domain, but
    // passing it explicitly avoids a second lookup and an ambiguous match.
    const domainOptions = useMemo(() => {
        const out = [];
        for (const s of servers) {
            for (const d of (s.mail_domains || [])) {
                const key = String(d || "").trim().toLowerCase();
                if (key && !out.some((o) => o.domain === key)) out.push({ domain: key, serverId: s.documentId });
            }
        }
        return out;
    }, [servers]);

    useEffect(() => {
        if (!domain && domainOptions.length) setDomain(domainOptions[0].domain);
    }, [domainOptions, domain]);

    const localPart = useMemo(
        () => String(userEmail || "").split("@")[0].trim().toLowerCase(),
        [userEmail],
    );
    const derivedEmail = localPart && domain ? `${localPart}@${domain}` : "";

    const personal = useMemo(
        () => accounts.find((a) => a.kind === "personal" && (a.owners || []).some((o) => o.id === uid)) || null,
        [accounts, uid],
    );
    const shared = useMemo(() => accounts.filter((a) => a.kind === "shared"), [accounts]);
    const roleKeysLower = useMemo(
        () => userRoleKeys.map((k) => String(k).toLowerCase()),
        [userRoleKeys],
    );

    const canProvision = domainOptions.length > 0 && !!localPart;

    async function run(key, fn, okMessage) {
        setBusyKey(key);
        setError("");
        setSuccess("");
        try {
            await fn();
            if (okMessage) setSuccess(okMessage);
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Request failed");
        } finally {
            setBusyKey("");
        }
    }

    function setOwners(account, nextOwnerIds) {
        return MailAccountsEndpoints.setAccess(account.documentId, { owners: nextOwnerIds });
    }

    async function togglePersonal(next) {
        if (!next) {
            if (!personal) return;
            if (!confirm(
                `Remove ${personal.email} from this user?\n\n` +
                `The mailbox and its mail are kept — this only unlinks it. ` +
                `Delete it from the Mailboxes list if you want it gone.`
            )) return;
            return run("personal", () =>
                setOwners(personal, (personal.owners || []).map((o) => o.id).filter((id) => id !== uid)),
                "Unlinked the personal mailbox.");
        }

        if (!canProvision) return;
        // Attach-or-provision: an account may already exist at this address.
        const existing = accounts.find(
            (a) => String(a.email || "").toLowerCase() === derivedEmail,
        );
        if (existing) {
            const owners = (existing.owners || []).map((o) => o.id);
            // A personal account keeps exactly one owner server-side
            // (setAccess slices owners to the first entry), so appending to a
            // mailbox someone else already owns would be sliced straight back
            // out — the checkbox would appear to do nothing. Say so instead.
            if (existing.kind === "personal" && owners.length && !owners.includes(uid)) {
                const holder = (existing.owners || [])[0];
                setError(
                    `${existing.email} already belongs to ${holder?.displayName || holder?.email || holder?.username || "another user"}. ` +
                    `Unassign it there first, or delete it from the Mailboxes list.`
                );
                return;
            }
            return run("personal", () => setOwners(existing, [...owners, uid]),
                `Linked the existing mailbox ${existing.email}.`);
        }
        const chosen = domainOptions.find((o) => o.domain === domain);
        return run("personal", () =>
            UsersEndpoints.createMailbox(uid, {
                ...(chosen?.serverId ? { serverId: chosen.serverId } : {}),
                localPart,
                domain,
                kind: "personal",
            }),
            `Created ${derivedEmail} and linked it to this user.`);
    }

    async function toggleShared(account, next) {
        const owners = (account.owners || []).map((o) => o.id);
        return run(`shared-${account.documentId}`, () =>
            setOwners(account, next ? [...owners, uid] : owners.filter((id) => id !== uid)),
            next ? `Gave access to ${account.email}.` : `Removed access to ${account.email}.`);
    }

    return (
        <div className="card mb-4">
            <div className="card-header bg-light d-flex justify-content-between align-items-center">
                <h5 className="mb-0"><i className="fas fa-envelope me-2"></i>Email access</h5>
                <Link href="/mailboxes" className="btn btn-sm btn-outline-secondary">All Mailboxes</Link>
            </div>
            <div className="card-body">
                {error && <div className="alert alert-danger py-2">{error}</div>}
                {success && <div className="alert alert-success py-2">{success}</div>}

                {loading ? (
                    <p className="text-muted mb-0">Loading...</p>
                ) : (
                    <>
                        {/* ── 1. personal mailbox ─────────────────────────── */}
                        <div className="form-check mb-1">
                            <input
                                className="form-check-input"
                                type="checkbox"
                                id="has-email-access"
                                checked={!!personal}
                                disabled={busyKey === "personal" || (!personal && !canProvision)}
                                onChange={(e) => togglePersonal(e.target.checked)}
                            />
                            <label className="form-check-label" htmlFor="has-email-access">
                                <strong>Has email access</strong>
                                {personal
                                    ? <> — <code>{personal.email}</code></>
                                    : derivedEmail
                                        ? <> — will create <code>{derivedEmail}</code></>
                                        : null}
                            </label>
                        </div>

                        {!personal && domainOptions.length > 1 && (
                            <div className="ms-4 mb-2" style={{ maxWidth: 260 }}>
                                <select
                                    className="form-select form-select-sm"
                                    value={domain}
                                    onChange={(e) => setDomain(e.target.value)}
                                    disabled={busyKey === "personal"}
                                >
                                    {domainOptions.map((o) => <option key={o.domain} value={o.domain}>@{o.domain}</option>)}
                                </select>
                            </div>
                        )}

                        {!personal && !canProvision && (
                            <p className="small text-muted ms-4 mb-2">
                                {domainOptions.length === 0
                                    ? <>No mail server is registered yet — add one under <Link href="/email-servers">Email Servers</Link> before assigning email.</>
                                    : "This user has no email address to derive a mailbox name from."}
                            </p>
                        )}

                        {busyKey === "personal" && <p className="small text-muted ms-4">Working…</p>}

                        {/* ── 2. shared inboxes ───────────────────────────── */}
                        <hr className="my-3" />
                        <div className="fw-semibold mb-2">Shared inboxes</div>
                        {shared.length === 0 ? (
                            <p className="text-muted small mb-0">No shared inboxes exist yet.</p>
                        ) : (
                            shared.map((a) => {
                                const isOwner = (a.owners || []).some((o) => o.id === uid);
                                const viaRole = (a.access_roles || [])
                                    .filter((k) => roleKeysLower.includes(String(k).toLowerCase()));
                                const byRoleOnly = !isOwner && viaRole.length > 0;
                                return (
                                    <div className="form-check" key={a.documentId}>
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={`shared-${a.documentId}`}
                                            checked={isOwner || byRoleOnly}
                                            disabled={byRoleOnly || busyKey === `shared-${a.documentId}`}
                                            onChange={(e) => toggleShared(a, e.target.checked)}
                                        />
                                        <label className="form-check-label" htmlFor={`shared-${a.documentId}`}>
                                            {a.name} <span className="text-muted small">&lt;{a.email}&gt;</span>
                                            {byRoleOnly && (
                                                <span className="badge bg-light text-dark border ms-2">
                                                    via role <code>{viaRole.join(", ")}</code>
                                                </span>
                                            )}
                                        </label>
                                    </div>
                                );
                            })
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
