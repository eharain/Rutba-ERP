import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/sales",                 label: "Sales",            icon: "fa-cash-register" },
    { href: "/sales-returns",         label: "Returns",          icon: "fa-rotate-left" },
    {
        key: "cash-registers",
        label: "Cash Registers",
        icon: "fa-money-bill-wave",
        children: [
            { href: "/cash-register-history", label: "All Registers",    icon: "fa-list" },
            { href: "/cash-register",         label: "Current Register", icon: "fa-cash-register" },
            { href: "/cash-register-report",  label: "Report",           icon: "fa-triangle-exclamation" },
        ],
    },
    { href: "/reports",               label: "Reports",          icon: "fa-chart-line" },
    { divider: true },
    { href: "/settings",              label: "Settings",         icon: "fa-gear" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="pos-sale-sidebar-pinned" />;
}
