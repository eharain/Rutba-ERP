import { useEffect, useState } from "react";
import { useRouter } from "next/router";

/**
 * Lightweight callback page designed to run inside an iframe.
 *
 * After the /authorize page redirects here with ?token=...&refreshToken=...,
 * this page posts the credentials back to the parent window via postMessage
 * so the calling app can restore its session without a full-page redirect.
 */
export default function IframeCallback() {
    const router = useRouter();
    const [sent, setSent] = useState(false);

    useEffect(() => {
        if (!router.isReady) return;

        const { token, refreshToken, error } = router.query;

        if (!token) {
            // No token — tell parent that silent auth failed
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(
                    { type: "rutba-auth-failed", error: error || "no_token" },
                    "*"
                );
            }
            return;
        }

        // Send the token to the parent window
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(
                { type: "rutba-auth-success", token, refreshToken: refreshToken || null },
                "*"
            );
            setSent(true);
        }
    }, [router.isReady]);

    return (
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
            <p className="text-muted">{sent ? "Authenticated — returning…" : "Authenticating…"}</p>
        </div>
    );
}

