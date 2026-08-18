import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import HrDashboard from "@rutba/shared/components/HrDashboard";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/leave", icon: "fa-plane-departure", tone: "primary", title: "My Leave", text: "Apply for leave, track requests, see your history." },
    { href: "/attendance", icon: "fa-calendar-check", tone: "success", title: "My Attendance", text: "View your attendance history and, if you manage a team, theirs." },
    { href: "/payslips", icon: "fa-receipt", tone: "warning", title: "My Payslips", text: "View your payslips and the earnings/deductions breakdown." },
    { href: "/finances", icon: "fa-hand-holding-dollar", tone: "teal", title: "My Finances", text: "Request loans and salary advances, view your bonuses." },
    { href: "/expense-claims", icon: "fa-file-invoice-dollar", tone: "info", title: "Expense Claims", text: "Submit expense claims and, if you manage a team, review theirs." },
    { href: "/benefits", icon: "fa-heart-pulse", tone: "pink", title: "My Benefits", text: "View your enrolled insurance, retirement and PF plans." },
    { href: "/assets", icon: "fa-laptop", tone: "dark", title: "My Assets", text: "View the company assets assigned to you." },
    { href: "/performance", icon: "fa-bullseye", tone: "purple", title: "My Performance", text: "Track your goals and complete your self-assessment." },
    { href: "/training", icon: "fa-graduation-cap", tone: "info", title: "My Training", text: "See your enrolled courses and sign up for open sessions." },
    { href: "/documents", icon: "fa-file-lines", tone: "secondary", title: "My Documents", text: "Print letters issued to you and track expiring documents." },
    { href: "/schedule", icon: "fa-calendar-days", tone: "primary", title: "My Schedule", text: "Your shift roster and the company holiday calendar." },
    { href: "/timeline", icon: "fa-timeline", tone: "teal", title: "My Timeline", text: "Your onboarding, confirmations, promotions and transfers." },
    { href: "/tickets", icon: "fa-headset", tone: "danger", title: "Helpdesk", text: "Submit IT/HR/Facilities tickets and, if you manage a team, resolve theirs." },
    { href: "/wellbeing", icon: "fa-comment-dots", tone: "warning", title: "Raise a Concern", text: "Raise a grievance with HR or report a safety incident." },
    { href: "/profile", icon: "fa-id-card", tone: "secondary", title: "My Profile", text: "View your personal and employment details." },
    { href: "/approvals", icon: "fa-clipboard-check", tone: "success", title: "Approvals", text: "If you manage a team, decide their leave, claims, loans and advances." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="ess"
                    eyebrow="People"
                    title="Employee Self-Service"
                    subtitle="Your leave, payslips and team approvals in one place."
                    actions={
                        <>
                            <Link href="/leave" className="btn btn-accent">
                                <i className="fa-solid fa-plane-departure me-2"></i>Apply for leave
                            </Link>
                            <Link href="/payslips" className="btn btn-outline-secondary">
                                <i className="fa-solid fa-receipt me-2"></i>Payslips
                            </Link>
                        </>
                    }
                >
                    <HrDashboard />

                    <AppHomeSection title="Everything in Self-Service" />
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
