import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/",          label: "Home",        icon: "fa-house" },
    { href: "/leave",     label: "My Leave",    icon: "fa-plane-departure" },
    { href: "/payslips",  label: "My Payslips", icon: "fa-receipt" },
    { divider: true },
    { href: "/approvals", label: "Approvals",   icon: "fa-clipboard-check" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-ess-sidebar-pinned" />;
}
