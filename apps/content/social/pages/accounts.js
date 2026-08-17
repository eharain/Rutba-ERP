import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { SocialAccountsEndpoints } from "@rutba/api-provider/endpoints";
import { API_URL } from "@rutba/api-provider/lib/api";
import { useToast } from "../components/Toast";
import { PlatformBadge } from "../components/PlatformBadge";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";


// Platforms with NO posting API on our side (no provider adapter) — they can
// only be posted to by browser automation (the Rutba Social Poster desktop
// app): no OAuth, no keys, just a destination. Every other platform can be
// EITHER api or browser, so connection_type — not the platform — decides.
const BROWSER_PLATFORMS = new Set(["whatsapp", "linkedin"]);

// Secrets are write-only (private in the schema, so they read back blank) —
// blank must mean "keep the stored value". Everything else is plain data and
// blank means blank, or ids could never be cleared.
const SECRET_FIELDS = ["api_key", "api_secret", "access_token", "refresh_token"];

// Where a browser-posted account publishes, when the platform has no more
// specific label of its own.
const DEFAULT_DESTINATION = {
    key: "target_name",
    label: "Destination",
    placeholder: "profile / page / channel URL the poster publishes to",
};

// Per-platform: which credential fields to show (labelled for that provider) and
// a help panel describing the account + API you need from the platform. The
// underlying storage fields are the same; only the labels/visibility differ.

export default function AccountsPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);

    const loadAccounts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await SocialAccountsEndpoints.list({ sort: ['createdAt:desc'] });
            setAccounts(res.data || []);
        } catch (err) {
            console.error("Failed to load accounts", err);
            toast("Failed to load accounts.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    // providerStatus is deliberately NOT fetched here any more: it only ever fed
    // the create/edit form's key-entry fields, and that form moved to the
    // rutba-admin console. Keeping the call would be a request per page load
    // whose result nothing renders.






    // ── OAuth connect ────────────────────────────────────────
    const [busyId, setBusyId] = useState(null);

    // Listen for the popup-closer's postMessage and refresh on success.
    useEffect(() => {
        // The OAuth callback page is served from the API origin; only trust
        // messages from there (or our own origin) so another tab can't forge one.
        let apiOrigin = null;
        try { apiOrigin = new URL(API_URL).origin; } catch { /* leave null */ }
        const onMessage = (e) => {
            if (apiOrigin && e.origin !== apiOrigin && e.origin !== window.location.origin) return;
            const d = e.data;
            if (!d || d.source !== "rutba-social-oauth") return;
            if (d.ok) {
                toast(`Connected ${d.message || ""}`.trim(), "success");
                loadAccounts();
            } else {
                toast(d.message || "Connection failed.", "danger");
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [loadAccounts]);


    const handleTest = async (account) => {
        setBusyId(account.documentId);
        try {
            const res = await SocialAccountsEndpoints.validateConnection(account.documentId);
            const r = res?.data || res;
            if (r?.ok) {
                toast(`✅ ${account.account_name} is connected${r.token_expires_at ? ` (token valid until ${new Date(r.token_expires_at).toLocaleString()})` : ""}.`, "success");
            } else {
                toast(`⚠️ ${r?.reason || "Not connected."}`, "warning");
            }
        } catch (err) {
            console.error("Test failed", err);
            toast("Connection test failed.", "danger");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <PermissionCheck adminOnly>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-key me-2"></i>Social Accounts</h3>
                    <a className="btn btn-outline-primary btn-sm" href={`${APP_URLS.admin}/social-accounts`}>
                        <i className="fas fa-arrow-up-right-from-square me-1"></i>Manage in Rutba Admin
                    </a>
                </div>

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : accounts.length === 0 ? (
                    <div className="alert alert-info">No social accounts configured yet  connect a platform in <a href={`${APP_URLS.admin}/social-accounts`}>Rutba Admin</a>.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Platform</th>
                                    <th>Account Name</th>
                                    <th>Page / Channel ID</th>
                                    <th>Status</th>
                                    <th>Connection</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((acc) => {
                                  const isBrowserAcc = acc.connection_type === "browser" || BROWSER_PLATFORMS.has(acc.platform);
                                  return (
                                    <tr key={acc.id}>
                                        <td><PlatformBadge platform={acc.platform} /></td>
                                        <td>
                                            {acc.account_name}
                                            {acc.target_name && (
                                                <div className="small text-muted"><i className="fas fa-bullseye me-1"></i>{acc.target_name}</div>
                                            )}
                                        </td>
                                        <td><code>{acc.page_id || acc.platform_user_id || acc.target_name || "—"}</code></td>
                                        <td>
                                            {acc.is_active
                                                ? <span className="badge bg-success">Active</span>
                                                : <span className="badge bg-secondary">Inactive</span>}
                                        </td>
                                        <td>
                                            {isBrowserAcc ? (
                                                <span className="badge bg-secondary" title="Published by the Rutba Social Poster desktop app">
                                                    <i className="fas fa-desktop me-1"></i>Desktop app
                                                </span>
                                            ) : acc.last_connected_at ? (
                                                <span className="badge bg-success" title={new Date(acc.last_connected_at).toLocaleString()}>
                                                    <i className="fas fa-link me-1"></i>Connected
                                                </span>
                                            ) : (
                                                <span className="badge bg-light text-dark border"><i className="fas fa-unlink me-1"></i>Not connected</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="d-flex gap-1">
                                                {isBrowserAcc ? (
                                                    <span className="badge bg-light text-dark border align-self-center" title="Posts via the Rutba Social Poster desktop app">
                                                        <i className="fas fa-desktop me-1"></i>Via Social Poster
                                                    </span>
                                                ) : (
                                                    <button className="btn btn-sm btn-outline-secondary" title="Test connection" disabled={busyId === acc.documentId} onClick={() => handleTest(acc)}>
                                                        <i className="fas fa-heartbeat"></i>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                </PermissionCheck>
            </Layout>
        </ProtectedRoute>
    );
}
