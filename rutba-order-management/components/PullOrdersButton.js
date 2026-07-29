import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";
import { MarketplaceAccountsEndpoints } from "@rutba/api-provider/endpoints/index.js";

/**
 * "Pull orders now" — the manual trigger for the marketplace worker's order
 * download, placed where the people who need it actually work.
 *
 * The worker already pulls on a schedule; this exists for the moment a customer
 * says "I ordered ten minutes ago" and nobody wants to wait for the next run.
 *
 * The sync ENGINE lives in the rutba-marketplace app (it owns the adapters and
 * the service token), not in Strapi, so this posts to that app's operator route
 * with the signed-in user's JWT. That route requires a `marketplace_*` app-role,
 * so order-management staff who need this must also hold one — the button hides
 * itself rather than showing a 403 when they don't.
 */
export default function PullOrdersButton({ onDone }) {
    const { jwt } = useAuth();
    const [accounts, setAccounts] = useState([]);
    const [busyId, setBusyId] = useState(null);
    const [msg, setMsg] = useState(null);
    const [denied, setDenied] = useState(false);

    const loadAccounts = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await MarketplaceAccountsEndpoints.list({
                filters: { sync_orders_enabled: { $eq: true } },
                fields: ["platform", "label", "sync_orders_enabled", "active"],
                pageSize: 50,
            });
            setAccounts((res?.data || res || []).filter((a) => a.active !== false));
        } catch (err) {
            // 403 here means "no marketplace role", which is a legitimate state
            // for most order staff — stay quiet and hide the control.
            if (err?.response?.status === 403) setDenied(true);
            else console.error("Failed to load marketplace accounts", err);
        }
    }, [jwt]);

    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    /**
     * The three order-facing flows, all driven by the same engine:
     *   sync-orders    pull new orders down
     *   push-status    report our processing status back up
     *   sync-messages  exchange the customer conversation both ways
     */
    const ACTIONS = {
        "sync-orders": {
            label: "Pull orders",
            icon: "fa-cloud-arrow-down",
            done: (b) => `${b.created || 0} new, ${b.updated || 0} updated`,
        },
        "push-status": {
            label: "Push statuses",
            icon: "fa-cloud-arrow-up",
            done: (b) => `${b.updated || 0} status update(s) sent`,
        },
        "sync-messages": {
            label: "Sync messages",
            icon: "fa-comments",
            done: (b) => `${(b.created || 0) + (b.updated || 0)} received, ${b.pushed || 0} sent`,
        },
    };

    const run = async (acc, action) => {
        setBusyId(acc.documentId + action);
        setMsg(null);
        try {
            const base = APP_URLS.marketplace;
            const res = await fetch(`${base}/api/accounts/${acc.documentId}/${action}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || `${ACTIONS[action].label} failed (${res.status})`);

            const summary = body.skipped
                ? `${acc.label || acc.platform}: skipped — ${body.reason}`
                : `${acc.label || acc.platform}: ${ACTIONS[action].done(body)}${body.failed ? `, ${body.failed} failed` : ""}`;
            setMsg({ type: body.failed ? "danger" : "success", text: summary });
            if (onDone) onDone();
        } catch (err) {
            setMsg({ type: "danger", text: err.message || "Failed" });
        } finally {
            setBusyId(null);
        }
    };

    const pull = (acc) => run(acc, "sync-orders");

    if (denied || accounts.length === 0) return null;

    // One account is the common case (the public storefront) — show its three
    // actions directly. With several, group per account so it stays obvious
    // which marketplace an action is aimed at.
    const single = accounts.length === 1 ? accounts[0] : null;

    return (
        <>
            {single ? (
                <div className="btn-group">
                    {Object.entries(ACTIONS).map(([action, cfg]) => (
                        <button
                            key={action}
                            className="btn btn-sm btn-outline-info"
                            onClick={() => run(single, action)}
                            disabled={!!busyId}
                            title={cfg.label}
                        >
                            {busyId === single.documentId + action
                                ? <span className="spinner-border spinner-border-sm" />
                                : <><i className={`fas ${cfg.icon} me-1`} />{cfg.label}</>}
                        </button>
                    ))}
                </div>
            ) : (
                <div className="dropdown">
                    <button
                        className="btn btn-sm btn-outline-info dropdown-toggle"
                        data-bs-toggle="dropdown"
                        disabled={!!busyId}
                    >
                        {busyId
                            ? <><span className="spinner-border spinner-border-sm me-1" />Working…</>
                            : <><i className="fas fa-rotate me-1" />Marketplace sync</>}
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end">
                        {accounts.map((acc) => (
                            <li key={acc.documentId}>
                                <h6 className="dropdown-header">{acc.label || acc.platform}</h6>
                                {Object.entries(ACTIONS).map(([action, cfg]) => (
                                    <button
                                        key={action}
                                        className="dropdown-item"
                                        onClick={() => run(acc, action)}
                                    >
                                        <i className={`fas ${cfg.icon} me-2`} />{cfg.label}
                                    </button>
                                ))}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {msg && (
                <span className={`small ms-2 text-${msg.type === "success" ? "success" : "danger"}`}>
                    {msg.text}
                </span>
            )}
        </>
    );
}
