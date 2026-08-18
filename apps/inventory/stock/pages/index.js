import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/products", icon: "fa-boxes-stacked", tone: "primary", title: "Products", text: "Manage product records used across inventory and purchasing workflows." },
    { href: "/stock-items", icon: "fa-cubes", tone: "info", title: "Stock Items", text: "Review and manage available stock items and inventory status." },
    { href: "/branches", icon: "fa-store", tone: "teal", title: "Branches", text: "Manage branches, their sales desks and the storage-location (bin) hierarchy." },
    { href: "/purchases", icon: "fa-basket-shopping", tone: "success", title: "Purchases", text: "Create and track purchase entries to replenish stock inventory." },
    { href: "/bulk-stock-inputs", icon: "fa-file-import", tone: "purple", title: "Bulk Stock Inputs", text: "Import stock entries in bulk to speed up high-volume updates." },
    { href: "/orphan-stock-items", icon: "fa-link-slash", tone: "warning", title: "Orphan Stock Items", text: "Identify stock items missing expected links for inventory cleanup." },
    { href: "/archive-stock", icon: "fa-box-archive", tone: "secondary", title: "Archive", text: "Access archived stock records for review and historical tracking." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="stock"
                    eyebrow="Stock management"
                    title="Stock Management"
                    subtitle="The product master, stock items, purchasing and bulk intake — everything that decides what's on the shelf."
                    actions={
                        <>
                            <Link href="/products" className="btn btn-accent">
                                <i className="fa-solid fa-boxes-stacked me-2"></i>Products
                            </Link>
                            <Link href="/purchases" className="btn btn-outline-secondary">
                                <i className="fa-solid fa-basket-shopping me-2"></i>New purchase
                            </Link>
                        </>
                    }
                >
                    <AppHomeSection title="Everything in Stock Management" />
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
