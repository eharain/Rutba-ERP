'use client'
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { storage } from "../lib/storage";
import { api, getAppName, refreshAccessToken, onSessionExpired } from "../lib/api";
import axios from "axios";
import { API_URL } from "../lib/api-url-resolver";

const AuthContext = createContext();

/**
 * Fetch role, appAccess and permissions from the API using the given JWT.
 */
async function fetchPermissions(jwt) {
    try {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` };
        const appName = getAppName();
        if (appName) headers['X-Rutba-App'] = appName;
        const res = await axios.post(`${API_URL}/me/permissions`,
            { time: Date.now() },
            { headers }
        );
        const data = res.data;
        return {
            role: data?.role || null,
            appAccess: data?.appAccess || [],
            adminAppAccess: data?.adminAppAccess || [],
            permissions: data?.permissions || [],
            sessionTimeout: data?.sessionTimeout || 60,
        };
    } catch (err) {
        console.error('Failed to fetch permissions', err);
        return null;
    }
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
function persistAuth({ jwt, refreshToken, user, role, appAccess, adminAppAccess, permissions, sessionTimeout }) {
    storage.setItem("jwt", jwt);
    if (refreshToken) storage.setItem("refreshToken", refreshToken);
    storage.setJSON("user", user);
    storage.setItem("role", role);
    storage.setJSON("appAccess", appAccess);
    storage.setJSON("adminAppAccess", adminAppAccess);
    storage.setJSON("permissions", permissions);
    if (sessionTimeout) storage.setItem("sessionTimeout", String(sessionTimeout));
}

/** Clear all auth fields from localStorage/sessionStorage. */
function clearAuth() {
    const AUTH_KEYS = ['jwt', 'refreshToken', 'user', 'role', 'appAccess', 'adminAppAccess', 'permissions', 'sessionTimeout'];
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

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [currentJwt, setJwt] = useState(null);
    const [currentRole, setRole] = useState(null);
    const [currentAppAccess, setAppAccess] = useState([]);
    const [currentAdminAppAccess, setAdminAppAccess] = useState([]);
    const [currentPermissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sessionExpired, setSessionExpired] = useState(false);
    const [currentSessionTimeout, setSessionTimeout] = useState(60);

    // Subscribe to session-expired events fired by the API layer (authCall)
    useEffect(() => {
        return onSessionExpired(() => setSessionExpired(true));
    }, []);

    /** Apply auth data to React state. */
    const applyAuth = useCallback(({ jwt, user, role, appAccess, adminAppAccess, permissions, sessionTimeout }) => {
        setCurrentUser(user);
        setJwt(jwt);
        setRole(role);
        setAppAccess(appAccess);
        setAdminAppAccess(adminAppAccess);
        setPermissions(permissions);
        if (sessionTimeout) setSessionTimeout(sessionTimeout);
        setSessionExpired(false);
    }, []);

    /** Reset all React auth state. */
    const resetState = useCallback(() => {
        setCurrentUser(null);
        setJwt(null);
        setRole(null);
        setAppAccess([]);
        setAdminAppAccess([]);
        setPermissions([]);
    }, []);

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
            appAccess: me?.appAccess || [],
            adminAppAccess: me?.adminAppAccess || [],
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
        const user = await fetchMe(token);
        if (!user) throw new Error('Invalid token');

        const me = await fetchPermissions(token);
        const authData = {
            jwt: token,
            refreshToken,
            user,
            role: me?.role || null,
            appAccess: me?.appAccess || [],
            adminAppAccess: me?.adminAppAccess || [],
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
            // Fire-and-forget — don't block the UI on server logout
            axios.post(`${API_URL}/auth/logout`, {}, {
                headers: { Authorization: `Bearer ${jwt}` },
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
        permissions: currentPermissions,
        loading,
        sessionExpired,
        sessionTimeout: currentSessionTimeout,
        login,
        loginWithToken,
        logout
    }), [currentUser, currentJwt, currentRole, currentAppAccess, currentAdminAppAccess, currentPermissions, loading, sessionExpired, currentSessionTimeout, login, loginWithToken, logout]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
