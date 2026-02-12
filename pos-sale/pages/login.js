import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { useRouter } from "next/router";
import { api } from "@rutba/pos-shared/lib/api";

export default function Login() {
    const { login, user } = useAuth();
    const router = useRouter();

    // view: "login" | "forgot-choice" | "forgot" | "reset"
    const [view, setView] = useState("login");

    // login state
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");

    // forgot password state
    const [forgotEmail, setForgotEmail] = useState("");

    // reset password state
    const [resetCode, setResetCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [busyLoading, setBusyLoading] = useState(false);

    // redirect if already logged in
    useEffect(() => {
        if (user) {
            router.push("/");
        }
    }, [user]);

    // pick up ?code= from URL and switch to reset view
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
            window.location.href = "/";
        } catch (e) {
            setErrorMessage("Login failed" + " " + (e.message ?? ""));
            console.log("Login error:", e);
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
            console.log("Forgot password error:", e);
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
            console.log("Reset password error:", e);
        } finally {
            setBusyLoading(false);
        }
    }

    return (
        <Layout>
            {view === "login" && (
                <>
                    <h1>Login</h1>
                    <form onSubmit={onLogin} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
                        <input placeholder="Email or Username" value={identifier} onChange={e => setIdentifier(e.target.value)} />
                        <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                        <button type="submit" disabled={busyLoading}>{busyLoading ? "Signing in..." : "Sign in"}</button>
                        <span style={{ display: errorMessage ? "" : "none", color: "red" }}>{errorMessage}</span>
                        <span style={{ display: message ? "" : "none", color: "green" }}>{message}</span>
                        <a href="#" onClick={e => { e.preventDefault(); setErrorMessage(""); setMessage(""); setView("forgot-choice"); }}>
                            Forgot Password?
                        </a>
                    </form>
                </>
            )}

            {view === "forgot-choice" && (
                <>
                    <h1>Forgot Password</h1>
                    <div style={{ display: "grid", gap: 8, maxWidth: 360 }}>
                        <p>How would you like to reset your password?</p>
                        <button onClick={() => { setErrorMessage(""); setMessage(""); setView("forgot"); }}>Reset by Email</button>
                        <button onClick={() => { setErrorMessage(""); setMessage(""); setView("reset"); }}>I have a reset code</button>
                        <a href="#" onClick={e => { e.preventDefault(); setErrorMessage(""); setMessage(""); setView("login"); }}>
                            Back to Login
                        </a>
                    </div>
                </>
            )}

            {view === "forgot" && (
                <>
                    <h1>Reset by Email</h1>
                    <form onSubmit={onForgotPassword} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
                        <p>Enter your email to receive a password reset link.</p>
                        <input placeholder="Email" type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                        <button type="submit" disabled={busyLoading}>{busyLoading ? "Sending..." : "Send Reset Link"}</button>
                        <span style={{ display: errorMessage ? "" : "none", color: "red" }}>{errorMessage}</span>
                        <span style={{ display: message ? "" : "none", color: "green" }}>{message}</span>
                        <a href="#" onClick={e => { e.preventDefault(); setErrorMessage(""); setMessage(""); setView("forgot-choice"); }}>
                            Back
                        </a>
                    </form>
                </>
            )}

            {view === "reset" && (
                <>
                    <h1>Reset Password</h1>
                    <form onSubmit={onResetPassword} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
                        <input placeholder="Reset Code" value={resetCode} onChange={e => setResetCode(e.target.value)} required />
                        <input placeholder="New Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
                        <input placeholder="Confirm Password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
                        <button type="submit" disabled={busyLoading}>{busyLoading ? "Resetting..." : "Reset Password"}</button>
                        <span style={{ display: errorMessage ? "" : "none", color: "red" }}>{errorMessage}</span>
                        <span style={{ display: message ? "" : "none", color: "green" }}>{message}</span>
                        <a href="#" onClick={e => { e.preventDefault(); setErrorMessage(""); setMessage(""); setView("forgot-choice"); }}>
                            Back
                        </a>
                        <a href="#" onClick={e => { e.preventDefault(); setErrorMessage(""); setMessage(""); setView("login"); }}>
                            Back to Login
                        </a>
                    </form>
                </>
            )}
        </Layout>
    );
}


export async function getServerSideProps() { return { props: {} }; }
