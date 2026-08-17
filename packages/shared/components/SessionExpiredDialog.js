import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { APP_URLS } from "../lib/roles";

const SILENT_TIMEOUT_MS = 4000; // time to wait for silent re-auth before showing dialog

/**
 * Build the auth-app iframe URL that will redirect through /authorize
 * and land on /auth/iframe-callback, which posts the token back via postMessage.
 */
function buildIframeAuthUrl() {
    const iframeCallbackUrl = `${APP_URLS.auth}/auth/iframe-callback`;
    return `${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(iframeCallbackUrl)}`;
}

/**
 * Session-recovery component.
 *
 * When the app detects a 401 that cannot be recovered by a refresh-token:
 *  1. A hidden iframe silently asks the auth app whether the user is still
 *     logged in there. If so, a fresh token is posted back via postMessage
 *     and the session is restored transparently — the user never sees a dialog.
 *  2. If silent re-auth fails (timeout or auth app also has no session),
 *     a modal is shown containing an iframe that loads the auth app's login
 *     page so the user can re-authenticate without leaving the current page.
 *  3. A countdown timer auto-redirects to the full login page as a fallback.
 */
export default function SessionExpiredDialog() {
    const { sessionExpired, sessionTimeout, loginWithToken } = useAuth();

    // "silent" → trying hidden iframe | "dialog" → showing visible iframe
    const [phase, setPhase] = useState("silent");
    const [remaining, setRemaining] = useState(sessionTimeout || 60);
    const timerRef = useRef(null);
    const silentTimerRef = useRef(null);
    const silentIframeRef = useRef(null);

    /** Handle token posted back from the auth iframe (hidden or visible). */
    const handleMessage = useCallback(
        (event) => {
            const data = event.data;
            if (!data || typeof data !== "object") return;

            if (data.type === "rutba-auth-success" && data.token) {
                // Restore session with the token received from the auth app
                loginWithToken(data.token, data.refreshToken || null).catch(() => {
                    // If loginWithToken fails, fall through to the visible dialog
                    setPhase("dialog");
                });
                return;
            }

            if (data.type === "rutba-auth-failed") {
                // Auth app confirmed user is not logged in — show the dialog
                clearTimeout(silentTimerRef.current);
                setPhase("dialog");
            }
        },
        [loginWithToken]
    );

    // Subscribe / unsubscribe to postMessage
    useEffect(() => {
        if (!sessionExpired) return;
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [sessionExpired, handleMessage]);

    // Phase 1 — silent iframe re-auth attempt
    useEffect(() => {
        if (!sessionExpired) {
            setPhase("silent");
            return;
        }

        // Start silent iframe probe
        setPhase("silent");

        silentTimerRef.current = setTimeout(() => {
            // Silent attempt timed out — show the visible dialog
            setPhase("dialog");
        }, SILENT_TIMEOUT_MS);

        return () => clearTimeout(silentTimerRef.current);
    }, [sessionExpired]);

    // Phase 2 — countdown timer (only while the visible dialog is shown)
    useEffect(() => {
        if (!sessionExpired || phase !== "dialog") return;

        const total = sessionTimeout || 60;
        setRemaining(total);

        timerRef.current = setInterval(() => {
            setRemaining((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    redirectToLogin();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [sessionExpired, phase, sessionTimeout]);

    if (!sessionExpired) return null;

    function redirectToLogin() {
        const callbackUrl = `${window.location.origin}/auth/callback`;
        const state = window.location.pathname + window.location.search;
        window.location.href = `${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`;
    }

    const iframeSrc = buildIframeAuthUrl();

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const timeDisplay =
        minutes > 0
            ? `${minutes}:${String(seconds).padStart(2, "0")}`
            : `${seconds}s`;

    // ---- Phase 1: hidden iframe (no visible UI) ----
    if (phase === "silent") {
        return (
            <iframe
                ref={silentIframeRef}
                src={iframeSrc}
                style={{ display: "none" }}
                title="Silent re-authentication"
            />
        );
    }

    // ---- Phase 2: visible dialog with auth-app iframe ----
    return (
        <div
            className="modal d-block"
            style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999 }}
            tabIndex="-1"
        >
            <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 600, width: "95vw" }}>
                <div className="modal-content" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
                    <div className="modal-header bg-warning text-dark py-2">
                        <h5 className="modal-title mb-0">
                            <i className="fa-solid fa-triangle-exclamation me-2"></i>
                            Session Expired
                        </h5>
                        <span className="text-danger fw-semibold small ms-auto">
                            <i className="fa-solid fa-clock me-1"></i>
                            Redirect in {timeDisplay}
                        </span>
                    </div>
                    <div className="modal-body p-0" style={{ flex: "1 1 auto", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                        <iframe
                            src={iframeSrc}
                            style={{
                                width: "100%",
                                flex: "1 1 auto",
                                minHeight: 520,
                                border: "none",
                            }}
                            title="Re-authenticate"
                        />
                    </div>
                    <div className="modal-footer justify-content-center py-2">
                        <button
                            type="button"
                            className="btn btn-link text-muted btn-sm"
                            onClick={redirectToLogin}
                        >
                            Sign out and redirect to login page now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
