import SharedSidebar from "@rutba/pos-shared/components/Sidebar";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin, isActiveAdminRole } from "@rutba/pos-shared/lib/roles";
import { getAppName } from "@rutba/api-provider/lib/api";

// Work-order children mirror the order-management pattern: each link filters
// the list page by canonical status via the `status` query param.
const SECTIONS = [
    {
        key: "work-orders",
        label: "Work Orders",
        icon: "fa-clipboard-list",
        children: [
            { href: "/board",                         label: "Board",        icon: "fa-table-columns" },
            { href: "/work-orders",                   label: "All Work Orders", icon: "fa-list" },
            { href: "/work-orders?status=Draft",      label: "Draft",        icon: "fa-pen-ruler" },
            { href: "/work-orders?status=Released",   label: "Released",     icon: "fa-flag-checkered" },
            { href: "/work-orders?status=InProgress", label: "In Progress",  icon: "fa-rotate" },
            { href: "/work-orders?status=OnHold",     label: "On Hold",      icon: "fa-pause" },
            { href: "/work-orders?status=Completed",  label: "Completed",    icon: "fa-circle-check" },
            { href: "/work-orders?status=Cancelled",  label: "Cancelled",    icon: "fa-ban" },
        ],
    },
    { href: "/material-lots", label: "Materials",    icon: "fa-layer-group" },
    { href: "/workers",       label: "Workers",      icon: "fa-people-group" },
    { href: "/workflows",     label: "Workflows",    icon: "fa-diagram-project", adminOnly: true },
    { href: "/setup",         label: "Setup",        icon: "fa-gear",            adminOnly: true },
];

export default function Sidebar() {
    const { adminAppAccess, activeRoleKey } = useAuth();
    const isAdmin = activeRoleKey
        ? isActiveAdminRole(activeRoleKey)
        : isAppAdmin(adminAppAccess, getAppName());
    const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
    return <SharedSidebar sections={sections} storageKey="rutba-manufacturing-sidebar-pinned" />;
}
