'use client'
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { storage } from "../lib/storage";
import { api, getAppName } from "../lib/api";
import axios from "axios";
import { API_URL } from "../lib/api-url-resolver";

const AuthContext = createContext();

/**
 * Fetch role, appAccess and permissions from the API using the given JWT.
 * Works cross-origin because it uses the JWT directly (no cookies / localStorage).
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
        console.error('Failed to fetch user profile', err);
        return null;
    }
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [currentJwt, setJwt] = useState(null);
    const [currentRole, setRole] = useState(null);
    const [currentAppAccess, setAppAccess] = useState([]);
    const [currentAdminAppAccess, setAdminAppAccess] = useState([]);
    const [currentPermissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Bootstrap from this app's localStorage
    useEffect(() => {
        const jwt = storage.getItem("jwt");
        const user = storage.getJSON("user");
        const role = storage.getItem("role");
        const appAccessStored = storage.getJSON("appAccess") || [];
        const adminAppAccessStored = storage.getJSON("adminAppAccess") || [];
        const permsStored = storage.getJSON("permissions") || [];

        if (jwt && user) {
            setCurrentUser(user);
            setJwt(jwt);
            setRole(role);
            setAppAccess(appAccessStored);
            setAdminAppAccess(adminAppAccessStored);
            setPermissions(permsStored);
        }
        setLoading(false);
    }, []);

    /**
     * Login with credentials (used only in pos-auth's login page).
     */
    const login = useCallback(async (identifier, password) => {
        const authRes = await api.post('/auth/local', { identifier, password });
        const { user, jwt } = authRes;


        const me = await fetchPermissions(jwt);
        const meRole = me?.role || null;
        const meAppAccess = me?.appAccess || [];
        const meAdminAppAccess = me?.adminAppAccess || [];
        const mePermissions = me?.permissions || [];

        storage.setItem("jwt", jwt);
        storage.setJSON("user", user);
        storage.setItem("role", meRole);
        storage.setJSON("appAccess", meAppAccess);
        storage.setJSON("adminAppAccess", meAdminAppAccess);
        storage.setJSON("permissions", mePermissions);

        setCurrentUser(user);
        setJwt(jwt);
        setRole(meRole);
        setAppAccess(meAppAccess);
        setAdminAppAccess(meAdminAppAccess);
        setPermissions(mePermissions);

        return { user, jwt, role: meRole, appAccess: meAppAccess, adminAppAccess: meAdminAppAccess, permissions: mePermissions };
    }, []);

    /**
     * Login with a JWT token received from the OAuth callback.
     * Fetches the user profile and permissions from the API.
     */
    const loginWithToken = useCallback(async (token) => {
        const user = await fetchMe(token);
        if (!user) throw new Error('Invalid token');


        const me = await fetchPermissions(token);
        const meRole = me?.role || null;
        const meAppAccess = me?.appAccess || [];
        const meAdminAppAccess = me?.adminAppAccess || [];
        const mePermissions = me?.permissions || [];

        storage.setItem("jwt", token);
        storage.setJSON("user", user);
        storage.setItem("role", meRole);
        storage.setJSON("appAccess", meAppAccess);
        storage.setJSON("adminAppAccess", meAdminAppAccess);
        storage.setJSON("permissions", mePermissions);

        setCurrentUser(user);
        setJwt(token);
        setRole(meRole);
        setAppAccess(meAppAccess);
        setAdminAppAccess(meAdminAppAccess);
        setPermissions(mePermissions);

        return { user, jwt: token, role: meRole, appAccess: meAppAccess, adminAppAccess: meAdminAppAccess, permissions: mePermissions };
    }, []);

    /**
     * Clear all auth state from this app.
     */
    const logout = useCallback(() => {
        setCurrentUser(null);
        setJwt(null);
        setRole(null);
        setAppAccess([]);
        setAdminAppAccess([]);
        setPermissions([]);

        storage.removeItem("user");
        storage.removeItem("jwt");
        storage.removeItem("role");
        storage.removeItem("appAccess");
        storage.removeItem("adminAppAccess");
        storage.removeItem("permissions");
    }, []);

    const contextValue = useMemo(() => ({
        user: currentUser,
        jwt: currentJwt,
        role: currentRole,
        appAccess: currentAppAccess,
        adminAppAccess: currentAdminAppAccess,
        permissions: currentPermissions,
        loading,
        login,
        loginWithToken,
        logout
    }), [currentUser, currentJwt, currentRole, currentAppAccess, currentAdminAppAccess, currentPermissions, loading, login, loginWithToken, logout]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
