'use client'
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { storage } from "../lib/storage";
import { api, authApi } from "../lib/api";

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [currentJwt, setJwt] = useState(null);
    const [currentPermissions, setPermissions] = useState([]);
    const [loading, setReLoading] = useState(true);
    // Bootstrap from localStorage
    useEffect(() => {
        const user = storage.getJSON("user");
        const jwt = storage.getItem("jwt");
        const permissions = storage.getJSON("permissions");

        if (user && jwt && permissions) {
            setCurrentUser(user);
            setJwt(jwt);
            setPermissions(permissions || []);
        }
        setReLoading(false);
      
    }, []);

    const login = useCallback(async (identifier, password) => {
       // const base = (process.env.NEXT_PUBLIC_API_URL || "");//.replace("/api", "");
        const authRes = await api.post(`/auth/local`, { identifier, password });
        const { user, jwt } = authRes;

        setCurrentUser(user);
        setJwt(jwt);

        storage.setJSON("user", user);
        storage.setItem("jwt", jwt);

        const me = await authApi.post(`/me/permissions`, { time: (new Date()).getMilliseconds() });
        const mePermissions = me?.permissions || [];

        setPermissions(mePermissions);

        storage.setJSON("permissions", mePermissions);
    }, []);

    const logout = useCallback(() => {
        setCurrentUser(null);
        setJwt(null);
        setPermissions([]);
        storage.removeItem("user");
        storage.removeItem("jwt");
        storage.removeItem("permissions");
    }, []);

    const contextValue = useMemo(() => ({
        user: currentUser,
        jwt: currentJwt,
        permissions: currentPermissions,
        loading,
        login,
        logout
    }), [currentUser, currentJwt, currentPermissions, loading, login, logout]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
