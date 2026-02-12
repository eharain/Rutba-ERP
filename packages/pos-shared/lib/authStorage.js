'use client';

/**
 * Cookie-based auth storage for cross-app JWT sharing.
 * Cookies on localhost are shared across ports, so all apps
 * running on localhost:300x can read/write the same auth cookie.
 */

const COOKIE_OPTIONS = 'path=/; SameSite=Lax; max-age=604800'; // 7 days

function setCookie(name, value) {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=${encodeURIComponent(value)}; ${COOKIE_OPTIONS}`;
}

function getCookie(name) {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

function removeCookie(name) {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=; path=/; max-age=0`;
}

/**
 * Stores auth data in both localStorage (app-local) and cookies (cross-app).
 */
export const authStorage = {
    setJwt(jwt) {
        setCookie('rutba_jwt', jwt);
    },
    getJwt() {
        return getCookie('rutba_jwt');
    },
    setUser(user) {
        setCookie('rutba_user', JSON.stringify(user));
    },
    getUser() {
        const raw = getCookie('rutba_user');
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    },
    setRole(role) {
        setCookie('rutba_role', role);
    },
    getRole() {
        return getCookie('rutba_role');
    },
    setPermissions(permissions) {
        setCookie('rutba_permissions', JSON.stringify(permissions));
    },
    getPermissions() {
        const raw = getCookie('rutba_permissions');
        if (!raw) return [];
        try { return JSON.parse(raw); } catch { return []; }
    },
    clearAll() {
        removeCookie('rutba_jwt');
        removeCookie('rutba_user');
        removeCookie('rutba_role');
        removeCookie('rutba_permissions');
    },
};
