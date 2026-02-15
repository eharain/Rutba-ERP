import { useEffect } from "react";
import { useRouter } from "next/router";

export default function ExchangePage() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/new/sale");
    }, []);
    return null;
}

export async function getServerSideProps() { return { props: {} }; }
