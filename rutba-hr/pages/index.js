import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import HrDashboard from "@rutba/pos-shared/components/HrDashboard";
import Link from "next/link";

const CARDS = [
    { href: "/employees", icon: "fa-user-tie", title: "Employees", text: "The employee master — personal, employment and org details." },
    { href: "/org-structure", icon: "fa-sitemap", title: "Org Structure", text: "Companies, divisions, business units, cost centres and positions." },
    { href: "/attendance", icon: "fa-calendar-check", title: "Attendance", text: "Daily attendance across the organisation." },
    { href: "/leave-requests", icon: "fa-plane-departure", title: "Leave Requests", text: "Review and decide leave across the organisation." },
    { href: "/performance", icon: "fa-bullseye", title: "Performance", text: "Appraisal cycles, goals and reviews for your team." },
    { href: "/learning", icon: "fa-graduation-cap", title: "Learning", text: "Course catalogue, sessions and enrollment tracking." },
    { href: "/recruitment", icon: "fa-user-plus", title: "Recruitment", text: "Requisitions, candidates, interviews and offers." },
    { href: "/relations", icon: "fa-scale-balanced", title: "Employee Relations", text: "Grievances, disciplinary records, safety and compliance." },
    { href: "/letters", icon: "fa-file-signature", title: "Letters", text: "Generate offer, experience and salary letters from templates." },
    { href: "/lifecycle-events", icon: "fa-timeline", title: "Lifecycle Events", text: "Onboarding, confirmations, promotions and exits." },
    { href: "/assets", icon: "fa-laptop", title: "Assets", text: "The asset register and assignment history." },
    { href: "/tickets", icon: "fa-headset", title: "Helpdesk", text: "Resolve IT, HR and Facilities tickets." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Rutba HR 👥</h2>
                <p className="text-muted mb-4">People, performance and paperwork across the organisation.</p>

                <HrDashboard />

                <div className="row g-3">
                    {CARDS.map((c) => (
                        <div className="col-md-4" key={c.href}>
                            <Link href={c.href} className="text-decoration-none">
                                <div className="card h-100 shadow-sm">
                                    <div className="card-body">
                                        <div className="fs-3 mb-2 text-primary"><i className={`fa-solid ${c.icon}`} /></div>
                                        <h5 className="card-title text-body">{c.title}</h5>
                                        <p className="card-text text-muted small">{c.text}</p>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    ))}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
