import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/pos-shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/products", icon: "fa-box", tone: "primary", title: "Products", text: "Manage products shown on the website — names, prices, images and descriptions." },
    { href: "/categories", icon: "fa-tags", tone: "info", title: "Categories", text: "Organise products into categories for easy navigation." },
    { href: "/brands", icon: "fa-copyright", tone: "secondary", title: "Brands", text: "Manage brand listings with logos and descriptions." },
    { href: "/product-groups", icon: "fa-layer-group", tone: "success", title: "Product Groups", text: "Curate featured product groups, banners and homepage highlights." },
    { href: "/pages", icon: "fa-file-lines", tone: "warning", title: "Pages", text: "Create and edit static pages, blog posts and announcements." },
    { href: "/notification-templates", icon: "fa-bell", tone: "purple", title: "Notification Templates", text: "Create and manage order lifecycle notification templates." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="cms"
                    eyebrow="Content"
                    title="Content Management"
                    subtitle="Everything the storefront shows — catalogue copy, categories, brands, curated groups, pages and the templates customers receive."
                    actions={
                        <>
                            <Link href="/products" className="btn btn-accent">
                                <i className="fa-solid fa-box me-2"></i>Products
                            </Link>
                            <Link href="/pages" className="btn btn-outline-secondary">
                                <i className="fa-solid fa-file-lines me-2"></i>Pages
                            </Link>
                        </>
                    }
                >
                    <AppHomeSection title="Everything in Content Management" />
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
