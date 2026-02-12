import { useRouter } from "next/router";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
      if (!loading && !user) router.push("/login");
    
  }, [user, loading, router  ]);
  if (loading) return <p>Loading...</p>;
  if (!user) return null;
  return children;
}
