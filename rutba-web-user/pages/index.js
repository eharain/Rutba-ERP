import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/pos-shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/sale-orders", icon: "fa-bag-shopping", tone: "primary", title: "My Orders", text: "Track your web orders and follow each one through to delivery." },
    { href: "/returns", icon: "fa-rotate-left", tone: "warning", title: "Returns", text: "Request a return and check where an existing request has got to." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="web-user"
                    eyebrow="Your account"
                    title="Web Orders"
                    subtitle="Track your orders, view their details and request returns."
                    actions={
                        <Link href="/sale-orders" className="btn btn-accent">
                            <i className="fa-solid fa-bag-shopping me-2"></i>My orders
                        </Link>
                    }
                >
                    <AppHomeSection title="Everything in Web Orders" />
                    <AppHomeGrid>
                        {SECTIONS.map((s) => (
                            <AppHomeTile key={s.href} {...s} />
                        ))}
                    </AppHomeGrid>
                </AppHome>
            </Layout>
        </ProtectedRoute>
    );
}
