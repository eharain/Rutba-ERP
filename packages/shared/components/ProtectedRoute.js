import { useRouter } from "next/router";
import { useCallback, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useAppAccess } from "../context/EntitlementContext";
import { APP_URLS } from "../lib/roles";
import SessionExpiredDialog from "./SessionExpiredDialog";
import SignInRequired from "./SignInRequired";
import ModuleUnavailable from "./ModuleUnavailable";

/**
 * @param {string} [app] gate this page on the org's entitlement for that app
 *   key (portal task E2). Optional: pages that omit it behave exactly as
 *   before, so apps adopt module gating one at a time. The API refuses
 *   unentitled calls regardless — this only stops the page rendering a shell
 *   that is about to fill with 402s.
 */
export default function ProtectedRoute({ app, children }) {
  const { user, loading, sessionExpired } = useAuth();
  const access = useAppAccess(app);
  const router = useRouter();

  const goToSignIn = useCallback(() => {
      const callbackUrl = `${window.location.origin}/auth/callback`;
      const state = window.location.pathname + window.location.search;
      window.location.href = `${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`;
  }, []);

  useEffect(() => {
      // Only redirect when the user was never logged in (not when session expired).
      // When sessionExpired is true the stale user data is kept so the page
      // remains visible and the re-login dialog handles recovery.
      if (!loading && !user && !sessionExpired) goToSignIn();
  }, [user, loading, sessionExpired, goToSignIn]);

  // Nothing to show yet — explain why instead of a bare "Loading..." or a
  // blank page while the browser is being handed to the sign-in app.
  if (loading) return <SignInRequired phase="checking" />;
  if (!user && !sessionExpired) return <SignInRequired phase="redirecting" onSignIn={goToSignIn} />;

  // Identity first, entitlement second. Telling an anonymous visitor that the
  // org lacks a module leaks which modules the org has, and is not even the
  // reason they cannot see the page.
  //
  // While entitlements are still loading the page renders: the fetch is fast,
  // the API is the real gate, and flashing a "not in your plan" screen at
  // someone who does have the module is the worse failure.
  if (app && !access.loading && !access.allowed) {
    return <ModuleUnavailable app={app} mode={access.mode} reason={access.reason} />;
  }

  return (
      <>
          {children}
          {sessionExpired && <SessionExpiredDialog />}
      </>
  );
}
