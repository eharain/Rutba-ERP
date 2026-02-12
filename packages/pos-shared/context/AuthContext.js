'use client'
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { storage } from "../lib/storage";
import { api, authApi } from "../lib/api";
import { authStorage } from "../lib/authStorage";

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [currentJwt, setJwt] = useState(null);
    const [currentRole, setRole] = useState(null);
    const [currentPermissions, setPermissions] = useState([]);
    const [loading, setReLoading] = useState(true);

    // Bootstrap from cross-app cookies first, then fall back to localStorage
    useEffect(() => {
        const jwt = authStorage.getJwt() || storage.getItem("jwt");
        const user = authStorage.getUser() || storage.getJSON("user");
        const role = authStorage.getRole() || storage.getItem("role");
        const permissions = authStorage.getPermissions();
        const localPerms = permissions.length > 0 ? permissions : (storage.getJSON("permissions") || []);

        if (user && jwt) {
            setCurrentUser(user);
            setJwt(jwt);
            setRole(role);
            setPermissions(localPerms);

            // Sync to both storages
            authStorage.setJwt(jwt);
            authStorage.setUser(user);
            if (role) authStorage.setRole(role);
            if (localPerms.length > 0) authStorage.setPermissions(localPerms);
            storage.setJSON("user", user);
            storage.setItem("jwt", jwt);
            if (role) storage.setItem("role", role);
            storage.setJSON("permissions", localPerms);
        }
        setReLoading(false);

    }, []);

    const login = useCallback(async (identifier, password) => {
        const authRes = await api.post(`/auth/local`, { identifier, password });
        const { user, jwt } = authRes;

        setCurrentUser(user);
        setJwt(jwt);

        // Persist to both localStorage and cross-app cookies
        storage.setJSON("user", user);
        storage.setItem("jwt", jwt);
        authStorage.setJwt(jwt);
        authStorage.setUser(user);

        const me = await authApi.post(`/me/permissions`, { time: (new Date()).getMilliseconds() });
        const mePermissions = me?.permissions || [];
        const meRole = me?.role || null;

        setPermissions(mePermissions);
        setRole(meRole);

        storage.setJSON("permissions", mePermissions);
        storage.setItem("role", meRole);
        authStorage.setPermissions(mePermissions);
        authStorage.setRole(meRole);

        return { user, jwt, role: meRole, permissions: mePermissions };
    }, []);

    const logout = useCallback(() => {
        setCurrentUser(null);
        setJwt(null);
        setRole(null);
        setPermissions([]);

        // Clear both storages
        storage.removeItem("user");
        storage.removeItem("jwt");
        storage.removeItem("role");
        storage.removeItem("permissions");
        authStorage.clearAll();
    }, []);

    const contextValue = useMemo(() => ({
        user: currentUser,
        jwt: currentJwt,
        role: currentRole,
        permissions: currentPermissions,
        loading,
        login,
        logout
    }), [currentUser, currentJwt, currentRole, currentPermissions, loading, login, logout]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
