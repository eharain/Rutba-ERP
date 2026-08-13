import { useEffect, useState } from "react";
import { getAppName } from "@rutba/api-provider/lib/api";
import { APP_META } from "../lib/roles";
import { appAccent } from "./AppHome";

/**
 * The screen shown whenever an app knows who the user is *not* yet.
 *
 * One shell, four phases, so the whole sign-in journey — land on a
 * protected page, get handed to the auth app, come back through
 * /auth/callback — reads as one continuous thing rather than three
 * different bare <p> tags:
 *
 *   'checking'    → revalidating the stored session (AuthContext.loading).
 *                   Fades in late, so the common case — a valid session
 *                   that resolves in a few hundred ms — never flashes.
 *   'redirecting' → no session; handing off to the Rutba sign-in app.
 *                   Shown immediately: it replaces the blank page (and, in
 *                   dev, the ChunkLoadError overlay from chunk fetches the
 *                   navigation aborts) that used to fill the gap.
 *   'returning'   → back from the auth app, exchanging the token.
 *   'error'       → sign-in did not work out; `error` carries the reason.
 *
 * @param {'checking'|'redirecting'|'returning'|'error'} phase
 * @param {string} [error]      - message to show in the 'error' phase
 * @param {() => void} [onSignIn] - go to the sign-in app now
 */
export default function SignInRequired({ phase = "checking", error, onSignIn }) {
    const appKey = getAppName();
    const meta = APP_META[appKey] || {};
    const label = meta.label || "Rutba";

    const failed = phase === "error";
    // Show the hand-off copy immediately; only the quiet 'checking' phase
    // holds its paint back.
    const instant = phase !== "checking";

    // If the hand-off hasn't happened after a few seconds something is in the
    // way (a redirect blocker, the auth app being down). Say so rather than
    // leaving the user watching a progress bar forever.
    const [stalled, setStalled] = useState(false);
    useEffect(() => {
        if (phase !== "redirecting") return;
        const t = setTimeout(() => setStalled(true), 6000);
        return () => clearTimeout(t);
    }, [phase]);

    const COPY = {
        checking: {
            title: "Checking your session",
            text: <>One moment while we confirm you&rsquo;re still signed in to Rutba.</>,
        },
        redirecting: {
            title: "Please sign in to continue",
            // The explicit {" "} is load-bearing: JSX drops the space between
            // an expression and the wrapped text that follows it.
            text: (
                <>
                    <strong>{label}</strong>{" "}
                    is part of Rutba, so it needs to know who you are before it
                    can open. We&rsquo;re taking you to the Rutba sign-in page now &mdash;
                    once you&rsquo;re in, you&rsquo;ll land back on this exact page.
                </>
            ),
        },
        returning: {
            title: "Signing you in",
            text: <>Welcome back &mdash; setting up your {label} session.</>,
        },
        error: {
            title: <>We couldn&rsquo;t sign you in</>,
            text: error,
        },
    };

    const copy = COPY[phase] || COPY.checking;
    const icon = failed ? "fa-solid fa-circle-exclamation" : (meta.icon || "fa-solid fa-cube");

    return (
        <div
            className={`auth-gate${instant ? " is-instant" : ""}${failed ? " is-error" : ""}`}
            // The error phase takes its accent from .is-error in CSS — an
            // inline custom property would outrank it.
            style={failed ? undefined : { "--app-accent": appAccent(appKey) }}
        >
            {/* The gate replaces the whole page, so announce it — otherwise a
                screen-reader user gets silence while the browser hands over. */}
            <div className="auth-gate-card" role={failed ? "alert" : "status"}>
                <span className="auth-gate-icon" aria-hidden="true">
                    <i className={icon}></i>
                </span>

                <p className="auth-gate-eyebrow">{label}</p>
                <h1 className="auth-gate-title">{copy.title}</h1>
                <p className="auth-gate-text">{copy.text}</p>

                {!failed && <div className="auth-gate-bar" aria-hidden="true"><span /></div>}

                {onSignIn && (
                    <button type="button" className="auth-gate-btn" onClick={onSignIn}>
                        <i className="fa-solid fa-right-to-bracket"></i>
                        Go to sign-in now
                    </button>
                )}

                {phase === "redirecting" && (
                    <p className="auth-gate-foot">
                        {stalled
                            ? "Still here? Your browser may have blocked the redirect — use the button above."
                            : "You only need to do this once; the other Rutba apps will recognise you."}
                    </p>
                )}
            </div>
        </div>
    );
}
