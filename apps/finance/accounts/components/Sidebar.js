import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/chart-of-accounts", label: "Chart of Accounts", icon: "fa-sitemap" },
    { href: "/journal-entries",   label: "Journal Entries",   icon: "fa-book" },
    { href: "/invoices",          label: "Invoices",          icon: "fa-file-invoice-dollar" },
    { href: "/expenses",          label: "Expenses",          icon: "fa-receipt" },
    { href: "/reports",           label: "Reports",           icon: "fa-chart-line" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-accounts-sidebar-pinned" />;
}
