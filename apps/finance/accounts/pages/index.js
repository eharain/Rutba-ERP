import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/chart-of-accounts", icon: "fa-sitemap", tone: "primary", title: "Chart of Accounts", text: "Organise and maintain the account structure behind every report." },
    { href: "/journal-entries", icon: "fa-book", tone: "info", title: "Journal Entries", text: "Record and review journal entries for day-to-day accounting activity." },
    { href: "/invoices", icon: "fa-file-invoice-dollar", tone: "success", title: "Invoices", text: "Manage invoices, billing records and payment tracking workflows." },
    { href: "/expenses", icon: "fa-receipt", tone: "warning", title: "Expenses", text: "Track expenses and maintain the supporting financial records." },
    { href: "/reports", icon: "fa-chart-line", tone: "dark", title: "Reports", text: "Trial balance, P&L, balance sheet, cash flow and AR/AP aging." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="accounts"
                    eyebrow="Finance"
                    title="Accounts"
                    subtitle="The general ledger and everything that posts into it — accounts, journals, invoices, expenses and the statements they produce."
                    actions={
                        <>
                            <Link href="/journal-entries" className="btn btn-accent">
                                <i className="fa-solid fa-plus me-2"></i>New entry
                            </Link>
                            <Link href="/reports" className="btn btn-outline-secondary">
                                <i className="fa-solid fa-chart-line me-2"></i>Reports
                            </Link>
                        </>
                    }
                >
                    <AppHomeSection title="Everything in Accounts" />
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
