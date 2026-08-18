import SharedSidebar from "@rutba/shared/components/Sidebar";

const SECTIONS = [
    { href: "/contacts",   label: "Contacts",   icon: "fa-address-book" },
    { href: "/leads",      label: "Leads",      icon: "fa-user-plus" },
    { href: "/activities", label: "Activities", icon: "fa-clipboard-list" },
    { href: "/followups",  label: "Follow-ups", icon: "fa-bell" },
    { href: "/segments",   label: "Segments",   icon: "fa-filter" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="apps/sales/crm-sidebar-pinned" />;
}
