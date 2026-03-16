import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { APP_URLS } from "../lib/roles";

/**
 * Shared OAuth callback handler.
 *
 * Expects query params:
 *   ?token=<JWT>&refreshToken=<RT>&state=<original_path>
 *
 * Stores the token via AuthContext.loginWithToken(), then
 * redirects to the original page the user wanted.
 */
export default function AuthCallback() {
    const { loginWithToken, logout } = useAuth();
    const router = useRouter();
    const [error, setError] = useState("");

    useEffect(() => {
        if (!router.isReady) return;

        const { token, refreshToken, state } = router.query;

        if (!token) {
            window.location.href = `${APP_URLS.auth}/login`;
            return;
        }

        loginWithToken(token, refreshToken || null)
            .then((authData) => {
                // Deny access to users without the rutba_app_user role
                if (authData.roleType !== 'rutba_app_user') {
                    logout();
                    setError("Your account does not have the required role. Contact your administrator.");
                    setTimeout(() => { window.location.href = `${APP_URLS.auth}/login`; }, 3000);
                    return;
                }

                // Deny access to users with no app accesses assigned
                if (!authData.appAccess || authData.appAccess.length === 0) {
                    logout();
                    setError("Your account has no app access assigned. Contact your administrator.");
                    setTimeout(() => { window.location.href = `${APP_URLS.auth}/login`; }, 3000);
                    return;
                }

                // Replace callback URL in history so back-button doesn't re-trigger
                router.replace(state || "/");
            })
            .catch((err) => {
                console.error("Auth callback failed", err);
                setError("Authentication failed. Redirecting to login...");
                setTimeout(() => {
                    window.location.href = `${APP_URLS.auth}/login`;
                }, 2000);
            });
    }, [router.isReady]);

    if (error) {
        return <p className="text-center mt-5 text-danger">{error}</p>;
    }

    return <p className="text-center mt-5">Authenticating...</p>;
}
