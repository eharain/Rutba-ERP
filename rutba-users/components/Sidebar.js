import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

// Central user administration carved out of pos-auth. Mailbox mappings
// (Phase 3) and notification preferences (Phase 4) land as further sections.
const SECTIONS = [
    { href: "/users", label: "Users", icon: "fa-users" },
    { href: "/users/access-assignment", label: "Access Assignment", icon: "fa-user-shield" },
    { href: "/app-domains", label: "App Domains", icon: "fa-key" },
    { href: "/mailboxes", label: "Mailboxes", icon: "fa-envelope" },
    { href: "/email-servers", label: "Email Servers", icon: "fa-server" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-users-sidebar-pinned" />;
}
