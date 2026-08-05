import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/",           label: "Home",          icon: "fa-house" },
    { href: "/leave",      label: "My Leave",      icon: "fa-plane-departure" },
    { href: "/attendance", label: "My Attendance", icon: "fa-calendar-check" },
    { href: "/schedule",   label: "My Schedule",   icon: "fa-calendar-days" },
    { href: "/payslips",   label: "My Payslips",   icon: "fa-receipt" },
    { href: "/finances",   label: "My Finances",   icon: "fa-hand-holding-dollar" },
    { href: "/expense-claims", label: "Expense Claims", icon: "fa-file-invoice-dollar" },
    { href: "/benefits",   label: "My Benefits",   icon: "fa-heart-pulse" },
    { href: "/assets",     label: "My Assets",     icon: "fa-laptop" },
    { href: "/tickets",    label: "Helpdesk",      icon: "fa-headset" },
    { href: "/profile",    label: "My Profile",    icon: "fa-id-card" },
    { href: "/timeline",   label: "My Timeline",   icon: "fa-timeline" },
    { divider: true },
    { href: "/approvals",  label: "Approvals",     icon: "fa-clipboard-check" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-ess-sidebar-pinned" />;
}
