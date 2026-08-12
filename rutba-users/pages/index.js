import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomePill, AppHomeSection } from "@rutba/pos-shared/components/AppHome";

// Central user administration, carved out of pos-auth (which stays the pure
// SSO portal). Tiles light up as the carve-out phases land.
const SECTIONS = [
    { href: "/users", title: "Users", icon: "fa-users", tone: "primary", text: "Accounts, roles and app access.", ready: true },
    { href: "/users/access-assignment", title: "Access Assignment", icon: "fa-user-shield", tone: "info", text: "The bulk per-app access matrix.", ready: true },
    { href: "/app-domains", title: "App Domains", icon: "fa-key", tone: "warning", text: "api-pro app domains and their roles.", ready: true },
    { href: "/mailboxes", title: "Mailboxes", icon: "fa-envelope", tone: "teal", text: "Mailbox ownership, shared-inbox access and provisioning.", ready: true },
    { href: "/email-servers", title: "Email Servers", icon: "fa-server", tone: "secondary", text: "Registered mail-server admin endpoints (mailcow).", ready: true },
    { href: "/notifications", title: "Notifications", icon: "fa-bell", tone: "purple", text: "Per-user notification preferences.", ready: false },
];

export default function UsersHomePage() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="users"
                    eyebrow="Administration"
                    title="User Management"
                    subtitle="Central administration of user accounts, access levels, mailbox mappings and notification preferences."
                    actions={
                        <Link href="/users" className="btn btn-accent">
                            <i className="fa-solid fa-users me-2"></i>All users
                        </Link>
                    }
                >
                    <AppHomeSection title="Everything in User Management" />
                    <AppHomeGrid>
                        {SECTIONS.map((s) => (
                            <AppHomeTile
                                key={s.title}
                                href={s.href}
                                icon={s.icon}
                                tone={s.tone}
                                title={s.title}
                                text={s.text}
                                disabled={!s.ready}
                                badge={s.ready ? null : (
                                    <AppHomePill kind="soon" icon="fa-clock">Coming soon</AppHomePill>
                                )}
                            />
                        ))}
                    </AppHomeGrid>
                </AppHome>
            </Layout>
        </ProtectedRoute>
    );
}
