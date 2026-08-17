import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

// Only the screens backed by a live handler in rutba-core/src/modules/helpdesk.js.
// Approvals, knowledge, catalog, automation, SLA config and settings are specced
// (spec/06-navigation-and-menus.md) but have no endpoint yet — they stay out
// rather than shipping as dead links.
const SECTIONS = [
    { href: "/",         label: "Dashboard", icon: "fa-gauge" },
    { href: "/tickets",  label: "Tickets",   icon: "fa-ticket" },
    { href: "/desks",    label: "Desks",     icon: "fa-inbox" },
    { href: "/routing",  label: "Routing",   icon: "fa-diagram-project" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-helpdesk-sidebar-pinned" />;
}
