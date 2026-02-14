import { useAuth } from "../context/AuthContext";
import { isAppAdmin } from "../lib/roles";
import { getAppName } from "../lib/api";
import dynamic from 'next/dynamic';

/**
 * PermissionCheck
 *
 * Props:
 *   required  — comma-separated Strapi permission actions; shows
 *               access-denied message if ANY are missing
 *   has       — comma-separated Strapi permission actions; hides
 *               children silently if ANY are missing
 *   showIf    — "admin" → render children only when the user is an
 *               admin of the current app (silent hide otherwise)
 *   adminOnly — truthy → render children only when the user is an
 *               admin of the current app (shows access-denied otherwise)
 *   appKey    — optional app key for the admin check; defaults to the
 *               value set by setAppName() in _app.js
 */
export function PermissionCheck({ required, has, showIf, adminOnly, appKey, children }) {

    const { permissions, appAccess, adminAppAccess } = useAuth();

    // ── admin helpers ───────────────────────────────────────
    const effectiveAppKey = appKey || getAppName();
    const userIsGlobalAdmin = (appAccess || []).includes('auth');
    const userIsAdmin = userIsGlobalAdmin || isAppAdmin(adminAppAccess, effectiveAppKey);

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
        const userPerms = permissions || []; 

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