import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/sales", icon: "fa-cart-shopping", tone: "primary", title: "Sales", text: "Create new sales transactions and manage customer checkout workflows." },
    { href: "/sales-returns", icon: "fa-rotate-left", tone: "info", title: "Returns", text: "Process returned items and complete sale return adjustments." },
    { href: "/cash-register", icon: "fa-cash-register", tone: "warning", title: "Current Register", text: "Open, monitor and close the active register for daily POS operations." },
    { href: "/cash-register-history", icon: "fa-money-bill-wave", tone: "success", title: "Cash Registers", text: "Browse all register sessions, see the current one and audit cash movement." },
    { href: "/reports", icon: "fa-chart-line", tone: "dark", title: "Reports", text: "Track sales performance with operational and financial reporting." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="sale"
                    eyebrow="Point of sale"
                    title="Point of Sale"
                    subtitle="Ring up sales, process returns, run the cash register and review the day's performance."
                    actions={
                        <>
                            <Link href="/sales" className="btn btn-accent">
                                <i className="fa-solid fa-plus me-2"></i>New sale
                            </Link>
                            <Link href="/cash-register" className="btn btn-outline-secondary">
                                <i className="fa-solid fa-cash-register me-2"></i>Register
                            </Link>
                        </>
                    }
                >
                    <AppHomeSection title="Everything in Point of Sale" />
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
