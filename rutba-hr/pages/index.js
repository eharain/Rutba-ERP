import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import HrDashboard from "@rutba/pos-shared/components/HrDashboard";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/pos-shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/employees", icon: "fa-user-tie", tone: "primary", title: "Employees", text: "The employee master — personal, employment and org details." },
    { href: "/org-structure", icon: "fa-sitemap", tone: "info", title: "Org Structure", text: "Companies, divisions, business units, cost centres and positions." },
    { href: "/attendance", icon: "fa-calendar-check", tone: "success", title: "Attendance", text: "Daily attendance across the organisation." },
    { href: "/leave-requests", icon: "fa-plane-departure", tone: "teal", title: "Leave Requests", text: "Review and decide leave across the organisation." },
    { href: "/performance", icon: "fa-bullseye", tone: "purple", title: "Performance", text: "Appraisal cycles, goals and reviews for your team." },
    { href: "/learning", icon: "fa-graduation-cap", tone: "info", title: "Learning", text: "Course catalogue, sessions and enrollment tracking." },
    { href: "/recruitment", icon: "fa-user-plus", tone: "pink", title: "Recruitment", text: "Requisitions, candidates, interviews and offers." },
    { href: "/relations", icon: "fa-scale-balanced", tone: "warning", title: "Employee Relations", text: "Grievances, disciplinary records, safety and compliance." },
    { href: "/letters", icon: "fa-file-signature", tone: "secondary", title: "Letters", text: "Generate offer, experience and salary letters from templates." },
    { href: "/lifecycle-events", icon: "fa-timeline", tone: "primary", title: "Lifecycle Events", text: "Onboarding, confirmations, promotions and exits." },
    { href: "/assets", icon: "fa-laptop", tone: "dark", title: "Assets", text: "The asset register and its assignment history." },
    { href: "/tickets", icon: "fa-headset", tone: "danger", title: "Helpdesk", text: "Resolve IT, HR and Facilities tickets." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="hr"
                    eyebrow="People"
                    title="Human Resources"
                    subtitle="People, performance and paperwork across the organisation."
                    actions={
                        <>
                            <Link href="/employees" className="btn btn-accent">
                                <i className="fa-solid fa-user-tie me-2"></i>Employees
                            </Link>
                            <Link href="/leave-requests" className="btn btn-outline-secondary">
                                <i className="fa-solid fa-clipboard-check me-2"></i>Approvals
                            </Link>
                        </>
                    }
                >
                    <HrDashboard />

                    <AppHomeSection title="Everything in Human Resources" />
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
