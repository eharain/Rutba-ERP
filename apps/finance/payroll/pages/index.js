import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/salary-structures", icon: "fa-money-check-dollar", tone: "primary", title: "Salary Structures", text: "Define salary grades, base pay and recurring components." },
    { href: "/employee-profiles", icon: "fa-id-card", tone: "info", title: "Employee Profiles", text: "Per-employee pay type, bank and statutory setup." },
    { href: "/payroll-runs", icon: "fa-play", tone: "success", title: "Payroll Runs", text: "Create a run, preview it, process it and post to the ledger." },
    { href: "/payslips", icon: "fa-receipt", tone: "warning", title: "Payslips", text: "Review payslips, mark them paid and print." },
    { href: "/adjustments", icon: "fa-sliders", tone: "secondary", title: "Adjustments", text: "Advances, loans, bonuses and penalties." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="payroll"
                    eyebrow="Finance"
                    title="Payroll"
                    subtitle="Run payroll across salaried and piece-rate workers, then post it straight to the accounting ledger."
                    actions={
                        <Link href="/payroll-runs" className="btn btn-accent">
                            <i className="fa-solid fa-play me-2"></i>Payroll runs
                        </Link>
                    }
                >
                    <AppHomeSection title="Everything in Payroll" />
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
