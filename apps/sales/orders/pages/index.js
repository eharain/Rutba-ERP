import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/sale-orders", icon: "fa-bag-shopping", tone: "primary", title: "Orders", text: "View and track web orders from customers through fulfilment." },
    { href: "/riders", icon: "fa-motorcycle", tone: "info", title: "Riders", text: "Manage the rider fleet, their status and zone assignments." },
    { href: "/delivery-methods", icon: "fa-truck", tone: "teal", title: "Delivery Methods", text: "Review delivery costing and product-group mappings." },
    { href: "/delivery-zones", icon: "fa-map-location-dot", tone: "warning", title: "Delivery Zones", text: "Manage domestic and international delivery coverage zones." },
    { href: "/notification-templates", icon: "fa-bell", tone: "secondary", title: "Notifications", text: "Manage order lifecycle notification templates and channels." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="order-management"
                    eyebrow="Fulfilment"
                    title="Order Management"
                    subtitle="Web orders from placement to doorstep — riders, delivery methods, coverage zones and the notifications that go out along the way."
                    actions={
                        <Link href="/sale-orders" className="btn btn-accent">
                            <i className="fa-solid fa-bag-shopping me-2"></i>View orders
                        </Link>
                    }
                >
                    <AppHomeSection title="Everything in Order Management" />
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
