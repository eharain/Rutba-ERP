import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/sales",                 label: "Sales",            icon: "fa-cash-register" },
    { href: "/sales-returns",         label: "Returns",          icon: "fa-rotate-left" },
    { href: "/cash-register",         label: "Cash Register",    icon: "fa-money-bill-wave" },
    { href: "/cash-register-history", label: "Register History", icon: "fa-clock-rotate-left" },
    { href: "/reports",               label: "Reports",          icon: "fa-chart-line" },
    { divider: true },
    { href: "/settings",              label: "Settings",         icon: "fa-gear" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="pos-sale-sidebar-pinned" />;
}
