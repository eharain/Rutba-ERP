import { useAuth } from "../context/AuthContext";
import { isAppAdmin, isActiveAdminRole } from "../lib/roles";
import { getAppName } from "@rutba/api-provider/lib/api";
import dynamic from 'next/dynamic';

/**
 * PermissionCheck
 *
 * Gates UI on domain access derived from /me/permissions. The backend
 * (strapi-api-pro request-interceptor + api-method-policy) enforces per-action
 * authorization at request time, so the client gate's only job is to hide
 * pages the user has no role for at all, and to hide admin-only chrome.
 *
 * Props:
 *   required  — comma-separated app-domain keys (e.g. "sale", "stock,cms");
 *               shows access-denied message if the user has NO role in
 *               ANY of those domains.
 *   has       — comma-separated app-domain keys; hides children silently
 *               if the user has NO role in any of those domains. Use for
 *               buttons / panels that should just disappear.
 *   showIf    — "admin" → render only when the user is CURRENTLY acting
 *               as an admin role for the current app (silent hide). Falls
 *               back to "user holds any admin role for this app" before
 *               activeRoleKey is set.
 *   adminOnly — truthy → render only when the user is acting as an admin
 *               role for the current app (shows access-denied otherwise).
 *   appKey    — optional app key for the admin check; defaults to the
 *               value set by setAppName() in _app.js.
 */
export function PermissionCheck({ required, has, showIf, adminOnly, appKey, children }) {

    const { appAccess, adminAppAccess, activeRoleKey, loading } = useAuth();

    // ── wait for auth context to finish loading ─────────────
    if (loading) return null;

    // ── admin helpers ───────────────────────────────────────
    // Prefer "is the active role admin-level". Fall back to "user holds any
    // admin role for this app" only when activeRoleKey hasn't been set yet
    // (bootstrap race) — this preserves first-paint behaviour.
    const effectiveAppKey = appKey || getAppName();
    const userIsAdmin = activeRoleKey
        ? isActiveAdminRole(activeRoleKey)
        : isAppAdmin(adminAppAccess, effectiveAppKey);

    // ── showIf="admin" — silent hide ────────────────────────
    if (showIf === 'admin') {
        if (!userIsAdmin) return null;
        if (!required && !has) return children;
    }

    // ── adminOnly — access-denied message ───────────────────
    if (adminOnly) {
        if (!userIsAdmin) {
            return (
                <p style={{ color: "crimson", fontWeight: 600 }}>
                    Access Denied — admin access required for <strong>{effectiveAppKey}</strong>
                    <button style={{ marginLeft: 10 }} onClick={() => window.history.back()}>Back</button>
                </p>
            );
        }
        if (!required && !has) return children;
    }

    // ── domain checks ───────────────────────────────────────
    // missingDomains(spec) returns the domain keys from the spec that the
    // user does NOT have access to (i.e. no role in that domain).
    function missingDomains(spec) {
        if (!spec) return [];
        const allowed = Array.isArray(appAccess) ? appAccess : [];
        return spec
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((domain) => !allowed.includes(domain));
    }

    if (required) {
        const miss = missingDomains(required);
        if (miss.length > 0) {
            return (
                <p style={{ color: "crimson", fontWeight: 600 }}>
                    Access Denied — no role in domain: {required}
                    {miss.map((d, i) => (
                        <span key={i} className="badge bg-danger ms-1">{d}</span>
                    ))}
                    <button style={{ marginLeft: 10 }} onClick={() => window.history.back()}>Back</button>
                </p>
            );
        }
    } else if (has) {
        if (missingDomains(has).length > 0) return null;
    } else if (!showIf && !adminOnly) {
        return <p style={{ color: "crimson", fontWeight: 600 }}>Access Denied — PermissionCheck has no required/has/showIf/adminOnly prop</p>;
    }
    return children;
}


export default dynamic(() => Promise.resolve(PermissionCheck), { ssr: false });