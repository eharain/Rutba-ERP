import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { storage } from "../lib/storage";
import { APP_URLS } from "../lib/roles";

/**
 * Modal overlay shown when the user's session expires.
 * Lets them re-authenticate inline (preserving the page state)
 * or redirect to the full login page.
 * Auto-redirects after the configurable sessionTimeout (seconds).
 */
export default function SessionExpiredDialog() {
    const { sessionExpired, sessionTimeout, login } = useAuth();
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [remaining, setRemaining] = useState(sessionTimeout || 60);
    const timerRef = useRef(null);

    // Reset and start countdown whenever the dialog appears
    useEffect(() => {
        if (!sessionExpired) return;

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
    }, [sessionExpired, sessionTimeout]);

    if (!sessionExpired) return null;

    function redirectToLogin() {
        const callbackUrl = `${window.location.origin}/auth/callback`;
        const state = window.location.pathname + window.location.search;
        window.location.href = `${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);
        try {
            const rememberMe = storage.getRememberMe();
            await login(identifier, password, rememberMe);
            // login calls applyAuth which sets sessionExpired = false
            clearInterval(timerRef.current);
        } catch (err) {
            setError("Login failed. Please check your credentials.");
        } finally {
            setSubmitting(false);
        }
    };

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const timeDisplay = minutes > 0
        ? `${minutes}:${String(seconds).padStart(2, "0")}`
        : `${seconds}s`;

    return (
        <div
            className="modal d-block"
            style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999 }}
            tabIndex="-1"
        >
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header bg-warning text-dark">
                        <h5 className="modal-title">
                            <i className="fa-solid fa-triangle-exclamation me-2"></i>
                            Session Expired
                        </h5>
                    </div>
                    <div className="modal-body">
                        <p className="text-muted mb-1">
                            Your session has expired. Sign in again to continue
                            without losing your work.
                        </p>
                        <p className="text-danger fw-semibold mb-3">
                            <i className="fa-solid fa-clock me-1"></i>
                            Redirecting to login in <strong>{timeDisplay}</strong>
                        </p>
                        <form onSubmit={handleSubmit}>
                            {error && (
                                <div className="alert alert-danger py-2">{error}</div>
                            )}
                            <div className="mb-3">
                                <label className="form-label">Email or Username</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Password</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="btn btn-primary w-100"
                                disabled={submitting}
                            >
                                {submitting ? "Signing in\u2026" : "Sign In & Continue"}
                            </button>
                        </form>
                    </div>
                    <div className="modal-footer justify-content-center">
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
