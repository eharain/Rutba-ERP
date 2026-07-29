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

    const pull = async (acc) => {
        setBusyId(acc.documentId);
        setMsg(null);
        try {
            const base = APP_URLS.marketplace;
            const res = await fetch(`${base}/api/accounts/${acc.documentId}/sync-orders`, {
                method: "POST",
                headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || `Pull failed (${res.status})`);

            setMsg({
                type: "success",
                text: `${acc.label || acc.platform}: ${body.created || 0} new, ${body.updated || 0} updated${body.failed ? `, ${body.failed} failed` : ""}`,
            });
            if (onDone) onDone();
        } catch (err) {
            setMsg({ type: "danger", text: err.message || "Pull failed" });
        } finally {
            setBusyId(null);
        }
    };

    if (denied || accounts.length === 0) return null;

    return (
        <>
            {accounts.length === 1 ? (
                <button
                    className="btn btn-sm btn-outline-info"
                    onClick={() => pull(accounts[0])}
                    disabled={!!busyId}
                    title="Pull new orders from the live site now"
                >
                    {busyId
                        ? <><span className="spinner-border spinner-border-sm me-1" />Pulling…</>
                        : <><i className="fas fa-cloud-arrow-down me-1" />Pull orders</>}
                </button>
            ) : (
                <div className="dropdown">
                    <button
                        className="btn btn-sm btn-outline-info dropdown-toggle"
                        data-bs-toggle="dropdown"
                        disabled={!!busyId}
                    >
                        {busyId
                            ? <><span className="spinner-border spinner-border-sm me-1" />Pulling…</>
                            : <><i className="fas fa-cloud-arrow-down me-1" />Pull orders</>}
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end">
                        {accounts.map((acc) => (
                            <li key={acc.documentId}>
                                <button className="dropdown-item" onClick={() => pull(acc)}>
                                    {acc.label || acc.platform}
                                </button>
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
