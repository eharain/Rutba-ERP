import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/shared/components/AppHome";
import Link from "next/link";

// Landing page for the Inventory Management app. The Foundation backend
// (branches, storage-locations, stock-levels, stock-batches + the per-location
// stock-level cache) is live and every screen below is built.
const SECTIONS = [
    { href: "/branches", icon: "fa-warehouse", tone: "primary", title: "Branches & Locations", text: "Manage branches and the storage-location (bin) hierarchy." },
    { href: "/stock-levels", icon: "fa-layer-group", tone: "info", title: "Stock by Location", text: "Per-(product, branch) on-hand levels, drilling into units." },
    { href: "/transfers", icon: "fa-right-left", tone: "success", title: "Transfers", text: "Two-sided stock transfers between branches with in-transit tracking." },
    { href: "/adjustments", icon: "fa-sliders", tone: "warning", title: "Adjustments", text: "Write-offs, damage, loss and expiry with best-effort GL posting." },
    { href: "/counts", icon: "fa-clipboard-check", tone: "secondary", title: "Cycle Counts", text: "Physical stock-takes; shortages book unit losses. Cache reconcile lives in Maintenance." },
    { href: "/reorder", icon: "fa-cart-arrow-down", tone: "danger", title: "Reordering", text: "Low-stock and out-of-stock products with reorder suggestions." },
    { href: "/stock-health", icon: "fa-heart-pulse", tone: "pink", title: "Stock Health", text: "Percentage of created-in-range stock still on hand vs sold, filterable by %." },
    { href: "/alerts", icon: "fa-bell", tone: "danger", title: "Low-Stock Alerts", text: "Persisted reorder alerts — acknowledge, dismiss or run a scan now." },
    { href: "/valuation", icon: "fa-coins", tone: "warning", title: "Valuation", text: "Inventory value by branch and top products." },
    { href: "/expiry", icon: "fa-hourglass-half", tone: "purple", title: "Expiry & Batches", text: "Batch/lot expiry tracking, expiring-soon alerts and the expired sweep." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="inventory"
                    eyebrow="Inventory"
                    title="Inventory Management"
                    subtitle="Branches and bins, per-location stock levels, transfers, adjustments, cycle counts, batch expiry and reordering — the control centre for inventory."
                    actions={
                        <>
                            <Link href="/stock-levels" className="btn btn-accent">
                                <i className="fa-solid fa-layer-group me-2"></i>Stock levels
                            </Link>
                            <Link href="/alerts" className="btn btn-outline-secondary">
                                <i className="fa-solid fa-bell me-2"></i>Alerts
                            </Link>
                        </>
                    }
                >
                    <AppHomeSection title="Everything in Inventory Management" />
                    <AppHomeGrid compact>
                        {SECTIONS.map((s) => (
                            <AppHomeTile key={s.href} {...s} />
                        ))}
                    </AppHomeGrid>
                </AppHome>
            </Layout>
        </ProtectedRoute>
    );
}
