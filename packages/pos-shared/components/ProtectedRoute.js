import { useRouter } from "next/router";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { APP_URLS } from "../lib/roles";

export default function ProtectedRoute({ children, appKey }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
      if (!loading && !user) {
          // Redirect to the central auth app with a return URL
          const returnUrl = encodeURIComponent(window.location.href);
          window.location.href = `${APP_URLS.auth}/login?returnUrl=${returnUrl}`;
      }
  }, [user, loading, router]);

  if (loading) return <p>Loading...</p>;
  if (!user) return null;
  return children;
}
