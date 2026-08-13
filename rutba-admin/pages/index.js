import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomePill, AppHomeSection } from "@rutba/pos-shared/components/AppHome";

// The tenant's admin console. Grown out of the rutba-users carve-out (which was
// itself carved out of pos-auth, still the pure SSO portal); the remaining
// sections — app catalogue, integrations, mail administration — land per
// docs/todo/admin-console-program/. Tiles light up as each phase lands.
const SECTIONS = [
    { href: "/users", title: "Users", icon: "fa-users", tone: "primary", text: "Accounts, roles and app access.", ready: true },
    { href: "/users/access-assignment", title: "Access Assignment", icon: "fa-user-shield", tone: "info", text: "The bulk per-app access matrix.", ready: true },
    { href: "/app-domains", title: "App Domains", icon: "fa-key", tone: "warning", text: "api-pro app domains and their roles.", ready: true },
    { href: "/mailboxes", title: "Mailboxes", icon: "fa-envelope", tone: "teal", text: "Mailbox ownership, shared-inbox access and provisioning.", ready: true },
    { href: "/email-servers", title: "Email Servers", icon: "fa-server", tone: "secondary", text: "Registered mail-server admin endpoints (mailcow).", ready: true },
    { href: "/social-accounts", title: "Social Accounts", icon: "fa-share-nodes", tone: "info", text: "Connect and configure API credentials for each social platform.", ready: true },
    { href: "/social-relays", title: "Social Relay Providers", icon: "fa-tower-broadcast", tone: "warning", text: "Aggregator API keys (Ayrshare, Postiz) that social posts publish through. Email relaying is Rutba-MTA; SMS is not built yet.", ready: true },
    { href: "/notifications", title: "Notifications", icon: "fa-bell", tone: "purple", text: "Per-user notification preferences.", ready: false },
];

export default function AdminHomePage() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="admin"
                    eyebrow="Administration"
                    title="Rutba Admin"
                    subtitle="Administration of this instance: user accounts, access levels, app domains, mailbox mappings and notification preferences."
                    actions={
                        <Link href="/users" className="btn btn-accent">
                            <i className="fa-solid fa-users me-2"></i>All users
                        </Link>
                    }
                >
                    <AppHomeSection title="Everything in Rutba Admin" />
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
