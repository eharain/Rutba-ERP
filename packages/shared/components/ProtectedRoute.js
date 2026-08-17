import { useRouter } from "next/router";
import { useCallback, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { APP_URLS } from "../lib/roles";
import SessionExpiredDialog from "./SessionExpiredDialog";
import SignInRequired from "./SignInRequired";

export default function ProtectedRoute({ children }) {
  const { user, loading, sessionExpired } = useAuth();
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

  return (
      <>
          {children}
          {sessionExpired && <SessionExpiredDialog />}
      </>
  );
}
