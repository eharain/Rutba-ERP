import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { api } from "@rutba/pos-shared/lib/api";

export default function Login() {
    const { login, user, jwt } = useAuth();
    const router = useRouter();

    const [view, setView] = useState("login");
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [forgotEmail, setForgotEmail] = useState("");
    const [resetCode, setResetCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [busyLoading, setBusyLoading] = useState(false);

    // If already logged in, complete the OAuth flow or go to dashboard
    useEffect(() => {
        if (!router.isReady || !user || !jwt) return;

        const { redirect_uri, state } = router.query;

        if (redirect_uri) {
            // OAuth flow — redirect back to /authorize which will issue the token
            router.replace(`/authorize?redirect_uri=${encodeURIComponent(redirect_uri)}`
                + (state ? `&state=${encodeURIComponent(state)}` : ''));
        } else {
            // Direct login on pos-auth — go to dashboard
            router.replace("/");
        }
    }, [router.isReady, user, jwt]);

    // Pick up ?code= from URL for password reset
    useEffect(() => {
        if (!router.isReady) return;
        const code = router.query.code;
        if (code) {
            setResetCode(code);
            setView("reset");
        }
    }, [router.isReady, router.query.code]);

    async function onLogin(e) {
        e?.preventDefault();
        setBusyLoading(true);
        setErrorMessage("");
        try {
            await login(identifier, password);
            // The useEffect above will handle the redirect once user/jwt are set
        } catch (e) {
            setErrorMessage("Login failed " + (e.message ?? ""));
        } finally {
            setBusyLoading(false);
        }
    }

    async function onForgotPassword(e) {
        e?.preventDefault();
        setBusyLoading(true);
        setErrorMessage("");
        setMessage("");
        try {
            await api.post("/auth/forgot-password", { email: forgotEmail });
            setMessage("If that email exists, a reset link has been sent. Check your inbox or enter the reset code below.");
            setView("reset");
        } catch (e) {
            setErrorMessage("Failed to request password reset: " + (e?.response?.data?.error?.message || e.message || ""));
        } finally {
            setBusyLoading(false);
        }
    }

    async function onResetPassword(e) {
        e?.preventDefault();
        if (newPassword !== confirmPassword) {
            setErrorMessage("Passwords do not match");
            return;
        }
        setBusyLoading(true);
        setErrorMessage("");
        setMessage("");
        try {
            await api.post("/auth/reset-password", {
                code: resetCode,
                password: newPassword,
                passwordConfirmation: confirmPassword,
            });
            setMessage("Password reset successful! You can now sign in.");
            setNewPassword("");
            setConfirmPassword("");
            setResetCode("");
            setView("login");
        } catch (e) {
            setErrorMessage("Password reset failed: " + (e?.response?.data?.error?.message || e.message || ""));
        } finally {
            setBusyLoading(false);
        }
    }

    return (
        <div className="container py-5">
            <div className="row justify-content-center">
                <div className="col-md-5">
                    <div className="text-center mb-4">
                        <h1>Rutba POS</h1>
                        <p className="text-muted">Sign in to continue</p>
                    </div>

                    <div className="card shadow-sm">
                        <div className="card-body p-4">
                            {view === "login" && (
                                <form onSubmit={onLogin}>
                                    <div className="mb-3">
                                        <label className="form-label">Email or Username</label>
                                        <input className="form-control" placeholder="Enter email or username" value={identifier} onChange={e => setIdentifier(e.target.value)} autoFocus />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Password</label>
                                        <input className="form-control" placeholder="Enter password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                                    </div>
                                    <button className="btn btn-primary w-100" type="submit" disabled={busyLoading}>
                                        {busyLoading ? "Signing in..." : "Sign in"}
                                    </button>
                                    {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}
                                    {message && <div className="alert alert-success mt-3 mb-0">{message}</div>}
                                    <div className="text-center mt-3">
                                        <a href="#" onClick={e => { e.preventDefault(); setErrorMessage(""); setMessage(""); setView("forgot-choice"); }}>
                                            Forgot Password?
                                        </a>
                                    </div>
                                </form>
                            )}

                            {view === "forgot-choice" && (
                                <>
                                    <h5 className="mb-3">Forgot Password</h5>
                                    <p>How would you like to reset your password?</p>
                                    <div className="d-grid gap-2">
                                        <button className="btn btn-outline-primary" onClick={() => { setErrorMessage(""); setMessage(""); setView("forgot"); }}>Reset by Email</button>
                                        <button className="btn btn-outline-secondary" onClick={() => { setErrorMessage(""); setMessage(""); setView("reset"); }}>I have a reset code</button>
                                        <a href="#" className="text-center" onClick={e => { e.preventDefault(); setView("login"); }}>Back to Login</a>
                                    </div>
                                </>
                            )}

                            {view === "forgot" && (
                                <form onSubmit={onForgotPassword}>
                                    <h5 className="mb-3">Reset by Email</h5>
                                    <p>Enter your email to receive a password reset link.</p>
                                    <div className="mb-3">
                                        <input className="form-control" placeholder="Email" type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                                    </div>
                                    <button className="btn btn-primary w-100" type="submit" disabled={busyLoading}>{busyLoading ? "Sending..." : "Send Reset Link"}</button>
                                    {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}
                                    {message && <div className="alert alert-success mt-3 mb-0">{message}</div>}
                                    <div className="text-center mt-3">
                                        <a href="#" onClick={e => { e.preventDefault(); setView("forgot-choice"); }}>Back</a>
                                    </div>
                                </form>
                            )}

                            {view === "reset" && (
                                <form onSubmit={onResetPassword}>
                                    <h5 className="mb-3">Reset Password</h5>
                                    <div className="mb-3">
                                        <input className="form-control" placeholder="Reset Code" value={resetCode} onChange={e => setResetCode(e.target.value)} required />
                                    </div>
                                    <div className="mb-3">
                                        <input className="form-control" placeholder="New Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
                                    </div>
                                    <div className="mb-3">
                                        <input className="form-control" placeholder="Confirm Password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
                                    </div>
                                    <button className="btn btn-primary w-100" type="submit" disabled={busyLoading}>{busyLoading ? "Resetting..." : "Reset Password"}</button>
                                    {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}
                                    {message && <div className="alert alert-success mt-3 mb-0">{message}</div>}
                                    <div className="text-center mt-3">
                                        <a href="#" onClick={e => { e.preventDefault(); setView("login"); }}>Back to Login</a>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export async function getServerSideProps() { return { props: {} }; }
