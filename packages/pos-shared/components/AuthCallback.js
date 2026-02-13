import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { APP_URLS } from "../lib/roles";

/**
 * Shared OAuth callback handler.
 *
 * Expects query params:
 *   ?token=<JWT>&state=<original_path>
 *
 * Stores the token via AuthContext.loginWithToken(), then
 * redirects to the original page the user wanted.
 */
export default function AuthCallback() {
    const { loginWithToken } = useAuth();
    const router = useRouter();
    const [error, setError] = useState("");

    useEffect(() => {
        if (!router.isReady) return;

        const { token, state } = router.query;

        if (!token) {
            window.location.href = `${APP_URLS.auth}/login`;
            return;
        }

        loginWithToken(token)
            .then(() => {
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
