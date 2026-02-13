import { useRouter } from "next/router";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { APP_URLS } from "../lib/roles";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
      if (!loading && !user) {
          // OAuth-like redirect: send the user to the central auth app's
          // authorize endpoint.  It will redirect back to this app's
          // /auth/callback with a token once the user is authenticated.
          const callbackUrl = `${window.location.origin}/auth/callback`;
          const state = window.location.pathname + window.location.search;
          window.location.href = `${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`;
      }
  }, [user, loading]);

  if (loading) return <p>Loading...</p>;
  if (!user) return null;
  return children;
}
