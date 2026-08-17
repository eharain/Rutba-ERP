import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/delivery-offers", label: "Delivery Offers",   icon: "fa-handshake" },
    { href: "/deliveries",      label: "Active Deliveries", icon: "fa-truck-fast" },
    { href: "/history",         label: "Delivery History",  icon: "fa-clock-rotate-left" },
    { divider: true },
    { href: "/profile",         label: "Rider Profile",     icon: "fa-id-card" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-rider-sidebar-pinned" />;
}
