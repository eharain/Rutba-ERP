import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@rutba/shared/context/AuthContext";
import SignInRequired from "@rutba/shared/components/SignInRequired";
import { storage } from "@rutba/api-provider/lib/storage";

/**
 * OAuth-like authorize endpoint.
 *
 * Query params:
 *   redirect_uri  — where to send the token (e.g. http://localhost:3001/auth/callback)
 *   state         — opaque value forwarded back (original path the user wanted)
 *
 * If the user is already logged in (JWT in apps/admin/auth's localStorage),
 * redirect immediately to redirect_uri?token=JWT&refreshToken=...&state=...
 *
 * If not logged in, redirect to /login with the same params so the user
 * can authenticate first, then come back here.
 */
export default function Authorize() {
    const { jwt, user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!router.isReady || loading) return;

        const { redirect_uri, state } = router.query;

        // No redirect_uri → just go to dashboard
        if (!redirect_uri) {
            router.replace("/");
            return;
        }

        if (jwt && user) {
            // User is logged in — send them back with the token
            const url = new URL(redirect_uri);
            url.searchParams.set("token", jwt);
            const rt = storage.getItem("refreshToken");
            if (rt) url.searchParams.set("refreshToken", rt);
            if (state) url.searchParams.set("state", state);
            window.location.href = url.toString();
        } else {
            // Not logged in — redirect to login, preserving the OAuth params
            const loginUrl = `/login?redirect_uri=${encodeURIComponent(redirect_uri)}`
                + (state ? `&state=${encodeURIComponent(state)}` : '');
            router.replace(loginUrl);
        }
    }, [router.isReady, jwt, user, loading]);

    // Same screen the calling app just showed, so the hand-off looks like one
    // continuous step rather than a white flash of "Authorizing...". The
    // 'checking' phase holds its paint back, so a sub-second bounce — the
    // normal case — shows nothing at all.
    return <SignInRequired phase="checking" />;
}

