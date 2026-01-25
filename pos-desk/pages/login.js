import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";

export default function Login() {
    const { login, user } = useAuth();
    const router = useRouter();
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [busyLoading, setBusyLoading] = useState(false);

    useEffect(() => {
        if (user) {
            router.push("/");
        }
    }, [user]);

    async function onSubmit(e) {
        e?.preventDefault();
        setBusyLoading(true);
        try {
            await login(identifier, password);
            window.location.href = "/";
        } catch (e) {
            setErrorMessage("Login failed" +' ' + e.message??'' );
            //alert("Login failed");
            console.log("Login error:", e);
        } finally {
            setBusyLoading(false);
        }
    }

    return (
        <Layout>
            <h1>Login</h1>
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
                <input placeholder="Email or Username" value={identifier} onChange={e => setIdentifier(e.target.value)} />
                <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                <button type="submit" disabled={busyLoading}>{busyLoading ? "Signing in..." : "Sign in"}</button>
                <span style={{ display: (errorMessage ? '' : 'none') }}>{errorMessage}</span>
            </form>
        </Layout>
    );
}
