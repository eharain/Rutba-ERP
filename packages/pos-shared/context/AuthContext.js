'use client'
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { storage } from "@rutba/api-provider/lib/storage";
import { api, getAppName, getActiveRole, setActiveRole as setActiveRoleHeader, refreshAccessToken, onSessionExpired, API_URL } from "@rutba/api-provider/lib/api";
import axios from "axios";

const AuthContext = createContext();

/**
 * Fetch role, appAccess and permissions from the API using the given JWT.
 */
async function fetchPermissions(jwt) {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` };
    const appName = getAppName();
    if (appName) headers['X-Rutba-App'] = appName;

    const endpoints = [
        `${API_URL}/me/permissions`,
        `${API_URL}/api-pro/me/permissions`,
    ];

    for (const url of endpoints) {
        try {
            const res = await axios.get(url, {
                headers,
                params: { t: Date.now() },
            });
            const data = res.data;

            const derivedAppAccess = Array.isArray(data?.domains)
                ? data.domains
                    .map((d) => d?.key)
                    .filter(Boolean)
                : [];

            const appAccess = Array.isArray(data?.appAccess) && data.appAccess.length
                ? data.appAccess
                : derivedAppAccess;

            // rolesByApp drives the role-selector menu and (when there's only
            // one role for an app) the auto-selected active role.
            //   { [appDomainKey]: [{ key, name }, ...] }
            const rolesByApp = (data?.rolesByApp && typeof data.rolesByApp === 'object')
                ? data.rolesByApp
                : {};

            // Backward-compat: derive adminAppAccess from rolesByApp by
            // checking whether any role for the app ends in '_admin'. Apps
            // and shared components still read adminAppAccess for now; once
            // they all migrate to currentAppRoles/activeRole this can be
            // removed. We skip the '*' bucket (debug-only mirror of global
            // roles â€” the server already fans those into every real app key).
            const derivedAdminAppAccess = [];
            for (const [appKey, roles] of Object.entries(rolesByApp)) {
                if (appKey === '*') continue;
                if (Array.isArray(roles) && roles.some((r) => /(?:^|_)admin$/.test(String(r?.key || '')))) {
                    derivedAdminAppAccess.push(appKey);
                }
            }
            const adminAppAccess = Array.isArray(data?.adminAppAccess) && data.adminAppAccess.length
                ? data.adminAppAccess
                : derivedAdminAppAccess;

            // Flatten /me/permissions into the flat array of action strings
            // that PermissionCheck consumes (`permissions.includes("api::x.y.find")`).
            //
            // Two sources, merged + deduped:
            //   1. `permissions` â€” api-pro method policies, shape
            //        { [contentTypeUid]: { [action]: { allowed, policies } } }
            //      where contentTypeUid is e.g. "api::sale.sale" and action is
            //      a bare verb ("find", "create", "delete", ...). We emit
            //      `${ctUid}.${action}`.
            //   2. `strapiPermissions` â€” pass-through of the user's Strapi
            //      users-permissions role permissions, an ARRAY OF OBJECTS:
            //        [{ action: "api::sale.sale.find", role, id }, ...]
            //      Previously this was used only as a fallback and the raw
            //      objects leaked into `permissions`, so PermissionCheck's
            //      `.includes("api::sale.sale.find")` never matched. We now
            //      extract `.action` and merge with the api-pro list.
            const permSet = new Set();

            if (data?.permissions && typeof data.permissions === 'object') {
                for (const [ctUid, actions] of Object.entries(data.permissions)) {
                    if (!actions || typeof actions !== 'object') continue;
                    for (const action of Object.keys(actions)) {
                        // Tolerate legacy `resource.action` keys too â€” keep only
                        // the trailing action verb so we always emit
                        // `${ctUid}.${verb}`.
                        const verb = action.includes('.') ? action.split('.').pop() : action;
                        if (verb) permSet.add(`${ctUid}.${verb}`);
                    }
                }
            }

            if (Array.isArray(data?.strapiPermissions)) {
                for (const row of data.strapiPermissions) {
                    if (typeof row === 'string') {
                        if (row) permSet.add(row);
                    } else if (row && typeof row.action === 'string' && row.action) {
                        permSet.add(row.action);
                    }
                }
            }

            return {
                role: data?.role || null,
                roleType: data?.roleType || null,
                appAccess,
                adminAppAccess,
                rolesByApp,
                appRoles: Array.isArray(data?.appRoles) ? data.appRoles : [],
                permissions: Array.from(permSet),
                sessionTimeout: data?.sessionTimeout || 60,
            };
        } catch (_) {
            // try next endpoint
        }
    }

    console.error('Failed to fetch permissions from all known endpoints');
    return null;
}

/** Fetch the authenticated user profile from Strapi. */
async function fetchMe(jwt) {
    try {
        const res = await axios.get(`${API_URL}/users/me`, {
            headers: { Authorization: `Bearer ${jwt}` }
        });
        return res.data;
    } catch (err) {
        return null;
    }
}

/** Persist all auth fields to localStorage. */
function persistAuth({ jwt, refreshToken, user, role, appAccess, adminAppAccess, rolesByApp, appRoles, permissions, sessionTimeout }) {
    storage.setItem("jwt", jwt);
    if (refreshToken) storage.setItem("refreshToken", refreshToken);
    storage.setJSON("user", user);
    storage.setItem("role", role);
    storage.setJSON("appAccess", appAccess);
    storage.setJSON("adminAppAccess", adminAppAccess);
    storage.setJSON("rolesByApp", rolesByApp || {});
    storage.setJSON("appRoles", appRoles || []);
    storage.setJSON("permissions", permissions);
    if (sessionTimeout) storage.setItem("sessionTimeout", String(sessionTimeout));
}

/** Clear all auth fields from localStorage/sessionStorage. */
function clearAuth() {
    const AUTH_KEYS = ['jwt', 'refreshToken', 'user', 'role', 'appAccess', 'adminAppAccess', 'rolesByApp', 'appRoles', 'permissions', 'sessionTimeout'];
    // Clean both stores so stale tokens from before the remember-me
    // migration are removed regardless of which store is active.
    try {
        AUTH_KEYS.forEach(key => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
        localStorage.removeItem('__rememberMe');
        sessionStorage.removeItem('__rememberMe');
    } catch (_) {}
}

// Default-active-role policy: prefer the previously-chosen role (per-app key
// written by setActiveRoleHeader), else the first role in the list. The list
// itself is provider-order (admin roles tend to sort after staff alphabetically
// — that's fine; users explicitly switch when they want admin).
function pickActiveRole(rolesByApp, appName, previousActiveKey) {
    const list = Array.isArray(rolesByApp?.[appName]) ? rolesByApp[appName] : [];
    if (list.length === 0) return null;
    if (previousActiveKey && list.some((r) => r.key === previousActiveKey)) return previousActiveKey;
    return list[0].key;
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [currentJwt, setJwt] = useState(null);
    const [currentRole, setRole] = useState(null);
    const [currentAppAccess, setAppAccess] = useState([]);
    const [currentAdminAppAccess, setAdminAppAccess] = useState([]);
    const [currentRolesByApp, setRolesByApp] = useState({});
    const [currentAppRoles, setAppRoles] = useState([]);
    // Active role key for THIS app — drives the X-Rutba-App-Role header and
    // the RoleSwitcher selection state.
    const [activeRoleKey, setActiveRoleKey] = useState(() => getActiveRole() || null);
    const [currentPermissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sessionExpired, setSessionExpired] = useState(false);
    const [currentSessionTimeout, setSessionTimeout] = useState(60);

    // Subscribe to session-expired events fired by the API layer (authCall)
    useEffect(() => {
        return onSessionExpired(() => setSessionExpired(true));
    }, []);

    /** Apply auth data to React state. */
    const applyAuth = useCallback(({ jwt, user, role, appAccess, adminAppAccess, rolesByApp, appRoles, permissions, sessionTimeout }) => {
        setCurrentUser(user);
        setJwt(jwt);
        setRole(role);
        setAppAccess(appAccess);
        setAdminAppAccess(adminAppAccess);
        setRolesByApp(rolesByApp || {});
        setAppRoles(appRoles || []);
        setPermissions(permissions);
        if (sessionTimeout) setSessionTimeout(sessionTimeout);
        setSessionExpired(false);

        // Pick / restore the active role for the current app from the fresh
        // rolesByApp, then push it into the api-provider header layer so the
        // next request carries X-Rutba-App-Role.
        const appName = getAppName();
        const chosen = pickActiveRole(rolesByApp, appName, getActiveRole());
        setActiveRoleKey(chosen);
        setActiveRoleHeader(chosen || '');
    }, []);

    /** Reset all React auth state. */
    const resetState = useCallback(() => {
        setCurrentUser(null);
        setJwt(null);
        setRole(null);
        setAppAccess([]);
        setAdminAppAccess([]);
        setRolesByApp({});
        setAppRoles([]);
        setActiveRoleKey(null);
        setPermissions([]);
        setActiveRoleHeader('');
    }, []);

    /**
     * Change the active role for the current app and reload, so all queries
     * refetch with the new X-Rutba-App-Role header (and hence the new policy
     * scope). Persisted per-app via setActiveRoleHeader.
     */
    const setActiveRoleForApp = useCallback((roleKey) => {
        const appName = getAppName();
        const list = Array.isArray(currentRolesByApp?.[appName]) ? currentRolesByApp[appName] : [];
        if (!list.some((r) => r.key === roleKey)) return; // ignore invalid choice
        setActiveRoleHeader(roleKey);
        setActiveRoleKey(roleKey);
        try { window.location.reload(); } catch (_) {}
    }, [currentRolesByApp]);

    // Bootstrap: hydrate from localStorage, then revalidate the session
    useEffect(() => {
        (async () => {
            const jwt = storage.getItem("jwt");
            const user = storage.getJSON("user");

            if (!jwt || !user) {
                setLoading(false);
                return;
            }

            // Show cached data immediately so the UI does not flash empty
            setCurrentUser(user);
            setJwt(jwt);
            setRole(storage.getItem("role"));
            setAppAccess(storage.getJSON("appAccess") || []);
            setAdminAppAccess(storage.getJSON("adminAppAccess") || []);
            setRolesByApp(storage.getJSON("rolesByApp") || {});
            setAppRoles(storage.getJSON("appRoles") || []);
            setPermissions(storage.getJSON("permissions") || []);
            setSessionTimeout(parseInt(storage.getItem("sessionTimeout"), 10) || 60);

            // Revalidate: check if the JWT is still valid
            let validJwt = jwt;
            let freshUser = await fetchMe(jwt);

            if (!freshUser) {
                // JWT expired — try refreshing
                const newJwt = await refreshAccessToken();
                if (newJwt) {
                    validJwt = newJwt;
                    freshUser = await fetchMe(newJwt);
                }
            }

            if (!freshUser) {
                // Both JWT and refresh token are invalid.
                // Clear storage tokens but keep stale user in React state
                // so the page stays visible and a re-login dialog can appear.
                clearAuth();
                setJwt(null);
                setSessionExpired(true);
                setLoading(false);
                return;
            }

            // Re-fetch permissions with the valid JWT
            const me = await fetchPermissions(validJwt);
            const authData = {
                jwt: validJwt,
                user: freshUser,
                role: me?.role || storage.getItem("role"),
                appAccess: me?.appAccess || [],
                adminAppAccess: me?.adminAppAccess || [],
                rolesByApp: me?.rolesByApp || {},
                appRoles: me?.appRoles || [],
                permissions: me?.permissions || [],
                sessionTimeout: me?.sessionTimeout || 60,
            };

            persistAuth(authData);
            applyAuth(authData);
            setLoading(false);
        })();
    }, []);

    /**
     * Login with credentials (used only in pos-auth's login page).
     * Strapi refresh-mode returns { jwt, refreshToken, user }.
     * @param {string} identifier
     * @param {string} password
     * @param {boolean} [rememberMe=false] — when true, session survives browser restart
     */
    const login = useCallback(async (identifier, password, rememberMe = false) => {
        storage.setRememberMe(rememberMe);

        const authRes = await api.post('/auth/local', { identifier, password });
        const { user, jwt, refreshToken } = authRes;

        const me = await fetchPermissions(jwt);
        const authData = {
            jwt,
            refreshToken,
            user,
            role: me?.role || null,
            roleType: me?.roleType || null,
            appAccess: me?.appAccess || [],
            adminAppAccess: me?.adminAppAccess || [],
            rolesByApp: me?.rolesByApp || {},
            appRoles: me?.appRoles || [],
            permissions: me?.permissions || [],
            sessionTimeout: me?.sessionTimeout || 60,
        };

        persistAuth(authData);
        applyAuth(authData);

        return authData;
    }, []);

    /**
     * Login with a JWT + optional refreshToken received from the OAuth callback.
     * Fetches the user profile and permissions from the API.
     */
    const loginWithToken = useCallback(async (token, refreshToken) => {
        const toScalar = (v) => Array.isArray(v) ? v[0] : v;

        let effectiveJwt = toScalar(token);
        let effectiveRefreshToken = toScalar(refreshToken) || storage.getItem('refreshToken') || null;

        let user = await fetchMe(effectiveJwt);

        // If callback token is expired/invalid but a refresh token exists,
        // try one refresh cycle before failing the login callback.
        if (!user && effectiveRefreshToken) {
            try {
                const refreshRes = await axios.post(`${API_URL}/auth/refresh`, {
                    refreshToken: effectiveRefreshToken,
                });
                const nextJwt = refreshRes?.data?.jwt;
                const nextRefresh = refreshRes?.data?.refreshToken;

                if (nextJwt) {
                    effectiveJwt = nextJwt;
                    if (nextRefresh) effectiveRefreshToken = nextRefresh;
                    user = await fetchMe(effectiveJwt);
                }
            } catch {
                // fall through to invalid token error
            }
        }

        if (!user) throw new Error('Invalid token');

        const me = await fetchPermissions(effectiveJwt);
        const authData = {
            jwt: effectiveJwt,
            refreshToken: effectiveRefreshToken,
            user,
            role: me?.role || null,
            roleType: me?.roleType || null,
            appAccess: me?.appAccess || [],
            adminAppAccess: me?.adminAppAccess || [],
            rolesByApp: me?.rolesByApp || {},
            appRoles: me?.appRoles || [],
            permissions: me?.permissions || [],
            sessionTimeout: me?.sessionTimeout || 60,
        };

        persistAuth(authData);
        applyAuth(authData);

        return authData;
    }, []);

    /**
     * Clear all auth state from this app.
     * Calls the Strapi logout endpoint to invalidate the refresh token server-side.
     */
    const logout = useCallback(() => {
        const jwt = storage.getItem("jwt");
        if (jwt) {
            const headers = { Authorization: `Bearer ${jwt}` };
            const appName = getAppName();
            if (appName) headers['X-Rutba-App'] = appName;

            // Fire-and-forget — don't block the UI on server logout
            axios.post(`${API_URL}/auth/logout`, {}, {
                headers,
            }).catch(() => {});
        }

        clearAuth();
        resetState();
    }, []);

    const contextValue = useMemo(() => ({
        user: currentUser,
        jwt: currentJwt,
        role: currentRole,
        appAccess: currentAppAccess,
        adminAppAccess: currentAdminAppAccess,
        rolesByApp: currentRolesByApp,
        appRoles: currentAppRoles,
        activeRoleKey,
        setActiveRoleForApp,
        permissions: currentPermissions,
        loading,
        sessionExpired,
        sessionTimeout: currentSessionTimeout,
        login,
        loginWithToken,
        logout,
    }), [currentUser, currentJwt, currentRole, currentAppAccess, currentAdminAppAccess, currentRolesByApp, currentAppRoles, activeRoleKey, setActiveRoleForApp, currentPermissions, loading, sessionExpired, currentSessionTimeout, login, loginWithToken, logout]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
