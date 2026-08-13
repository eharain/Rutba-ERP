import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

// The tenant's admin console, grown out of the rutba-users carve-out. Sections
// land per the admin-console program (docs/todo/admin-console-program/): app
// catalogue, integrations and notifications join the four below.
const SECTIONS = [
    { href: "/users", label: "Users", icon: "fa-users" },
    { href: "/users/access-assignment", label: "Access Assignment", icon: "fa-user-shield" },
    { href: "/app-domains", label: "App Domains", icon: "fa-key" },
    { href: "/mailboxes", label: "Mailboxes", icon: "fa-envelope" },
    { href: "/email-servers", label: "Email Servers", icon: "fa-server" },
    // Integrations. rutba-social keeps read-only views of both; connecting,
    // editing and deleting live here — enforced by apps: ['admin'] on the
    // write methods of the social-accounts / social-relay-providers descriptors.
    { href: "/social-accounts", label: "Social Accounts", icon: "fa-share-nodes" },
    { href: "/social-relays", label: "Relay Providers", icon: "fa-tower-broadcast" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-admin-sidebar-pinned" />;
}
