import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

// Screens land as the campaigns phases ship. Phase 0 (this one) is the shell +
// settings; the template studio, audience builder and composer follow.
const SECTIONS = [
    { href: "/", label: "Dashboard", icon: "fa-gauge" },
    { href: "/templates", label: "Templates", icon: "fa-file-lines" },
    { href: "/audiences", label: "Audiences", icon: "fa-users-rectangle" },
    { href: "/campaigns", label: "Campaigns", icon: "fa-paper-plane" },
    { href: "/runs", label: "Delivery", icon: "fa-chart-line" },
    { href: "/settings", label: "Settings", icon: "fa-gear" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-campaigns-sidebar-pinned" />;
}
