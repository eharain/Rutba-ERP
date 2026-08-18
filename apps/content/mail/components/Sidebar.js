import SharedSidebar from "@rutba/shared/components/Sidebar";

// M0 is the live mail client + account settings. Later phases add search (M1),
// CRM-linked timelines (M2), and shared-inbox triage queues (M3) — see
// docs/todo/email-program/00-overview-and-roadmap.md.
const SECTIONS = [
    { href: "/", label: "Mailboxes", icon: "fa-inbox" },
    { href: "/shared", label: "Shared Queues", icon: "fa-users" },
    { href: "/settings", label: "Accounts", icon: "fa-gear" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="apps/content/mail-sidebar-pinned" />;
}
