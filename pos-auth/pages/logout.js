import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";

/**
 * Central logout endpoint.
 * Clears pos-auth's auth state and redirects to the login page.
 */
export default function Logout() {
    const { logout } = useAuth();
    const router = useRouter();
 
    useEffect(() => {

        logout();
        router.replace("/login");
    }, []);

    return <p className="text-center mt-5">Logging out...</p>;
}

export async function getServerSideProps() { return { props: {} }; }
