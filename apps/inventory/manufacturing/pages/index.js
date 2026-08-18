import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/work-orders", icon: "fa-clipboard-list", tone: "primary", title: "Work Orders", text: "Create and drive production job cards from cut to finish." },
    { href: "/material-lots", icon: "fa-layer-group", tone: "info", title: "Materials", text: "Receive fabric and trims, then issue them to work orders." },
    { href: "/workers", icon: "fa-people-group", tone: "success", title: "Workers", text: "Per-worker output, defects and piece-rate earnings." },
    { href: "/setup", icon: "fa-gear", tone: "secondary", title: "Setup", text: "Operations, piece-rates, lines, BOMs and defect codes." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="manufacturing"
                    eyebrow="Production"
                    title="Manufacturing"
                    subtitle="Receive materials, raise work orders, assign worker tasks, record QC and meter piece-rate output for payroll."
                    actions={
                        <Link href="/work-orders" className="btn btn-accent">
                            <i className="fa-solid fa-plus me-2"></i>New work order
                        </Link>
                    }
                >
                    <AppHomeSection title="Everything in Manufacturing" />
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

export async function getServerSideProps() { return { props: {} }; }
