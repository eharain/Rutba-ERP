import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/sale-orders", label: "Customer Orders", icon: "fa-shopping-bag" },
    {
        key: "delivery",
        label: "Delivery Ops",
        icon: "fa-truck",
        children: [
            { href: "/riders",                 label: "Riders",                icon: "fa-motorcycle" },
            { href: "/delivery-methods",       label: "Delivery Methods",      icon: "fa-truck-ramp-box" },
            { href: "/delivery-zones",         label: "Delivery Zones",        icon: "fa-map-location-dot" },
            { href: "/notification-templates", label: "Notification Templates",icon: "fa-bell" },
        ],
    },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-om-sidebar-pinned" />;
}
