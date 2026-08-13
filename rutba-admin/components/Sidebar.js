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
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-admin-sidebar-pinned" />;
}
