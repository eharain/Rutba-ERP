import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";

// Central user administration, carved out of pos-auth (which stays the pure
// SSO portal). Cards light up as the carve-out phases land.
const SECTIONS = [
    { href: "/users", label: "Users", icon: "fa-users", description: "Accounts, roles and app access", ready: true },
    { href: "/users/access-assignment", label: "Access Assignment", icon: "fa-user-shield", description: "Bulk per-app access matrix", ready: true },
    { href: "/app-domains", label: "App Domains", icon: "fa-key", description: "api-pro app domains and their roles", ready: true },
    { href: "/mailboxes", label: "Mailboxes", icon: "fa-envelope", description: "Mailbox ownership, shared-inbox access, provisioning", ready: true },
    { href: "/email-servers", label: "Email Servers", icon: "fa-server", description: "Registered mail-server admin endpoints (mailcow)", ready: true },
    { href: "/notifications", label: "Notifications", icon: "fa-bell", description: "Per-user notification preferences", ready: false },
];

export default function UsersHomePage() {
    return (
        <ProtectedRoute>
            <Layout>
                <div className="container py-4">
                    <h1 className="h4 mb-1">User Management</h1>
                    <p className="text-muted">Central administration of user accounts, access levels, mailbox mappings and notification preferences.</p>
                    <div className="row g-3 mt-1">
                        {SECTIONS.map((s) => (
                            <div key={s.label} className="col-12 col-md-4">
                                <div className={`card h-100 ${s.ready ? "" : "opacity-50"}`}>
                                    <div className="card-body">
                                        <h2 className="h6 mb-1">
                                            <i className={`fa-solid ${s.icon} me-2`}></i>
                                            {s.ready ? <Link href={s.href} className="stretched-link text-decoration-none">{s.label}</Link> : s.label}
                                        </h2>
                                        <div className="small text-muted">{s.description}{s.ready ? "" : " — coming soon"}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
