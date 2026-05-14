import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/contacts",   label: "Contacts",   icon: "fa-address-book" },
    { href: "/leads",      label: "Leads",      icon: "fa-user-plus" },
    { href: "/activities", label: "Activities", icon: "fa-clipboard-list" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-crm-sidebar-pinned" />;
}
