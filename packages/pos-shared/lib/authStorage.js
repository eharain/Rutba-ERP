'use client';

/**
 * authStorage — DEPRECATED.
 *
 * Auth is now handled via an OAuth-like flow:
 *   - pos-auth is the authorization server (login + /authorize endpoint)
 *   - Other apps redirect to pos-auth and receive a JWT via /auth/callback
 *   - Each app stores auth data in its own localStorage only
 *
 * This file is kept for backward-compatibility but should not be used
 * in new code.  Import `storage` from './storage' instead.
 */

const COOKIE_OPTIONS = 'path=/; SameSite=Lax; max-age=604800';

function removeCookie(name) {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=; path=/; max-age=0`;
}

export const authStorage = {
    /** Remove all legacy cookies (call once during migration). */
    clearAll() {
        removeCookie('rutba_jwt');
        removeCookie('rutba_user');
        removeCookie('rutba_role');
        removeCookie('rutba_permissions');
        removeCookie('rutba_app_access');
    },
};
