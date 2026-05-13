import { useAuth } from "../context/AuthContext";
import { isAppAdmin, isActiveAdminRole } from "../lib/roles";
import { getAppName } from "@rutba/api-provider/lib/api";
import dynamic from 'next/dynamic';

/**
 * PermissionCheck
 *
 * Props:
 *   required  — comma-separated Strapi permission actions; shows
 *               access-denied message if ANY are missing
 *   has       — comma-separated Strapi permission actions; hides
 *               children silently if ANY are missing
 *   showIf    — "admin" → render children only when the user is CURRENTLY
 *               acting as an admin role for the current app (silent hide).
 *               Falls back to "user holds an admin role" when no activeRoleKey
 *               is set yet (initial bootstrap).
 *   adminOnly — truthy → render children only when the user is acting as
 *               an admin role for the current app (shows access-denied
 *               otherwise)
 *   appKey    — optional app key for the admin check; defaults to the
 *               value set by setAppName() in _app.js
 */
export function PermissionCheck({ required, has, showIf, adminOnly, appKey, children }) {

    const { permissions, appAccess, adminAppAccess, activeRoleKey, loading } = useAuth();

    // ── wait for auth context to finish loading ─────────────
    if (loading) return null;

    // ── admin helpers ───────────────────────────────────────
    // Prefer "is the active role admin-level". Fall back to "user holds any
    // admin role for this app" only when activeRoleKey hasn't been set yet
    // (bootstrap race) — this preserves AGP-era behaviour on first paint.
    const effectiveAppKey = appKey || getAppName();
    const userIsAdmin = activeRoleKey
        ? isActiveAdminRole(activeRoleKey)
        : isAppAdmin(adminAppAccess, effectiveAppKey);

    // ── showIf="admin" — silent hide ────────────────────────
    if (showIf === 'admin') {
        if (!userIsAdmin) return null;
        // If no other checks, just render children
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
        // If no other checks, just render children
        if (!required && !has) return children;
    }

    // ── permission checks ───────────────────────────────────
    function findMissing(requiredString) {
        if (!requiredString) return [];
        const userPerms = Array.isArray(permissions) ? permissions : [];

        const requiredArray = requiredString.split(',').map(s => s.trim());
        const missing = requiredArray.filter(p => !userPerms.includes(p));
        return missing;
    }
    if (required) {
        const miss = findMissing(required);
        if (miss.length > 0) {
            console.log("permission check miss ",miss);
            return <p style={{ color: "crimson", fontWeight: 600 }}>
                Access Denied — missing permission: {miss.length} Required {required}
                {miss.map((perm, i) => {
                    return <span key={i} className="badge bg-danger ms-1">{perm}</span>;
                })}
                <button style={{ marginLeft: 10 }} onClick={() => {
                    window.history.back();
                }}>Back</button>
            </p>

        }
    } else if (has) {
        const miss = findMissing(has);
        if (miss.length > 0) {
            return null;
        }
    } else if (!showIf && !adminOnly) {
        return <p style={{ color: "crimson", fontWeight: 600 }}>Access Denied —PermissionChek has no required or requested has permission </p>;
    }
    return children;
}


export default dynamic(() => Promise.resolve(PermissionCheck), { ssr: false });