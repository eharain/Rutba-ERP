import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/employees",              label: "Employees",           icon: "fa-user-tie" },
    { href: "/departments",            label: "Departments",         icon: "fa-building" },
    { href: "/teams",                  label: "Teams",               icon: "fa-people-group" },
    { divider: true },
    { href: "/hr-team-management",     label: "Team Management",     icon: "fa-user-gear" },
    { href: "/hr-employee-management", label: "Employee Management", icon: "fa-id-badge" },
    { divider: true },
    { href: "/attendance",             label: "Attendance",          icon: "fa-calendar-check" },
    { href: "/leave-requests",         label: "Leave Requests",      icon: "fa-plane-departure" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-hr-sidebar-pinned" />;
}
