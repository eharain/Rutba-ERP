import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

const CARDS = [
    { href: "/leave",      icon: "fa-plane-departure", title: "My Leave",       text: "Apply for leave, track requests, see your history." },
    { href: "/attendance", icon: "fa-calendar-check",  title: "My Attendance",  text: "View your attendance history and, if you manage a team, theirs." },
    { href: "/payslips",   icon: "fa-receipt",         title: "My Payslips",    text: "View your payslips and earnings/deductions breakdown." },
    { href: "/finances",   icon: "fa-hand-holding-dollar", title: "My Finances", text: "Request loans and salary advances, view your bonuses." },
    { href: "/expense-claims", icon: "fa-file-invoice-dollar", title: "Expense Claims", text: "Submit expense claims and, if you manage a team, review theirs." },
    { href: "/benefits",   icon: "fa-heart-pulse",     title: "My Benefits",    text: "View your enrolled insurance, retirement and PF plans." },
    { href: "/assets",     icon: "fa-laptop",          title: "My Assets",      text: "View company assets assigned to you." },
    { href: "/tickets",    icon: "fa-headset",         title: "Helpdesk",       text: "Submit IT/HR/Facilities tickets and, if you manage a team, resolve theirs." },
    { href: "/profile",    icon: "fa-id-card",         title: "My Profile",     text: "View your personal and employment details." },
    { href: "/approvals",  icon: "fa-clipboard-check", title: "Approvals",      text: "If you manage a team, review and decide on their leave." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Employee Self-Service 🙋</h2>
                <p className="text-muted mb-4">Your leave, payslips and team approvals in one place.</p>
                <div className="row g-3">
                    {CARDS.map((c) => (
                        <div className="col-md-4" key={c.href}>
                            <Link href={c.href} className="text-decoration-none">
                                <div className="card h-100 shadow-sm">
                                    <div className="card-body">
                                        <div className="fs-3 mb-2 text-primary"><i className={`fa-solid ${c.icon}`} /></div>
                                        <h5 className="card-title">{c.title}</h5>
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
