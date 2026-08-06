import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/employees",              label: "Employees",           icon: "fa-user-tie" },
    { href: "/departments",            label: "Departments",         icon: "fa-building" },
    { href: "/teams",                  label: "Teams",               icon: "fa-people-group" },
    { href: "/org-structure",          label: "Org Structure",       icon: "fa-sitemap" },
    { href: "/lifecycle-events",       label: "Lifecycle Events",    icon: "fa-timeline" },
    { href: "/assets",                 label: "Assets",              icon: "fa-laptop" },
    { href: "/tickets",                label: "Helpdesk",            icon: "fa-headset" },
    { divider: true },
    { href: "/hr-team-management",     label: "Team Management",     icon: "fa-user-gear" },
    { href: "/hr-employee-management", label: "Employee Management", icon: "fa-id-badge" },
    { divider: true },
    { href: "/attendance",             label: "Attendance",          icon: "fa-calendar-check" },
    { href: "/leave-requests",         label: "Leave Requests",      icon: "fa-plane-departure" },
    { divider: true },
    { href: "/performance",            label: "Performance",         icon: "fa-bullseye" },
    { href: "/learning",               label: "Learning",            icon: "fa-graduation-cap" },
    { href: "/recruitment",            label: "Recruitment",         icon: "fa-user-plus" },
    { href: "/relations",              label: "Employee Relations",  icon: "fa-scale-balanced" },
    { href: "/letters",                label: "Letters",             icon: "fa-file-signature" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-hr-sidebar-pinned" />;
}
