import { useRouter } from "next/router";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { APP_URLS } from "../lib/roles";
import SessionExpiredDialog from "./SessionExpiredDialog";

export default function ProtectedRoute({ children }) {
  const { user, loading, sessionExpired } = useAuth();
  const router = useRouter();

  useEffect(() => {
      // Only redirect when the user was never logged in (not when session expired).
      // When sessionExpired is true the stale user data is kept so the page
      // remains visible and the re-login dialog handles recovery.
      if (!loading && !user && !sessionExpired) {
          const callbackUrl = `${window.location.origin}/auth/callback`;
          const state = window.location.pathname + window.location.search;
          window.location.href = `${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`;
      }
  }, [user, loading, sessionExpired]);

  if (loading) return <p>Loading...</p>;
  if (!user && !sessionExpired) return null;

  return (
      <>
          {children}
          {sessionExpired && <SessionExpiredDialog />}
      </>
  );
}
