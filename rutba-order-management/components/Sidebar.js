import SharedSidebar from "@rutba/pos-shared/components/Sidebar";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin, isActiveAdminRole } from "@rutba/pos-shared/lib/roles";
import { getAppName } from "@rutba/api-provider/lib/api";

// Each child links to the orders list page with a `status` filter — see
// pages/sale-orders.js which reads that query param and filters the API call.
// Grouping mirrors the state-machine flow (treatment → shipping → settlement
// → exits) so the sidebar reads top-to-bottom in the same order an order
// progresses through its life.
const SECTIONS = [
    {
        key: "orders",
        label: "Customer Orders",
        icon: "fa-shopping-bag",
        children: [
            { href: "/board",                                         label: "Board",              icon: "fa-table-columns" },
            { href: "/sale-orders",                                   label: "All Orders",         icon: "fa-list" },
            { href: "/sale-orders?status=PENDING_PAYMENT",            label: "Awaiting Payment",   icon: "fa-money-bill-wave" },
            { href: "/sale-orders?status=PAYMENT_CONFIRMED",          label: "Verifying Payment",  icon: "fa-shield-halved" },
            { href: "/sale-orders?status=PREPARING",                  label: "Packaging",          icon: "fa-boxes-stacked" },
            { href: "/sale-orders?status=AWAITING_PICKUP",            label: "Awaiting Pickup",    icon: "fa-person-biking" },
            { href: "/sale-orders?status=OUT_FOR_DELIVERY",           label: "Out for Delivery",   icon: "fa-truck-fast" },
            { href: "/sale-orders?status=FAILED_DELIVERY",            label: "Failed Delivery",    icon: "fa-triangle-exclamation" },
            { href: "/sale-orders?status=DELIVERED",                  label: "Delivered",          icon: "fa-circle-check" },
            { href: "/sale-orders?status=CANCELLED",                  label: "Cancelled",          icon: "fa-ban" },
            { href: "/sale-orders?status=REFUND_INITIATED",           label: "Refund Pending",    icon: "fa-hourglass-half" },
            { href: "/sale-orders?status=REFUNDED",                   label: "Refunded",           icon: "fa-circle-xmark" },
        ],
    },
    {
        key: "returns",
        label: "Returns",
        icon: "fa-rotate-left",
        children: [
            { href: "/returns",                          label: "All Returns",       icon: "fa-list" },
            { href: "/returns?status=REQUESTED",         label: "Pending Approval",  icon: "fa-hourglass-half" },
            { href: "/returns?status=APPROVED",          label: "Approved",          icon: "fa-check" },
            { href: "/returns?status=AWAITING_PICKUP",   label: "Awaiting Pickup",   icon: "fa-truck-arrow-right" },
            { href: "/returns?status=RECEIVED",          label: "Received",          icon: "fa-box-archive" },
            { href: "/returns?status=COMPLETED",         label: "Completed",         icon: "fa-circle-check" },
            { href: "/returns?status=REJECTED",          label: "Rejected",          icon: "fa-xmark" },
        ],
    },
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
    {
        key: "workflow",
        label: "Configuration",
        icon: "fa-gear",
        adminOnly: true,
        children: [
            { href: "/workflows", label: "Order Workflows", icon: "fa-diagram-project" },
        ],
    },
];

export default function Sidebar() {
    const { adminAppAccess, activeRoleKey } = useAuth();
    const isAdmin = activeRoleKey
        ? isActiveAdminRole(activeRoleKey)
        : isAppAdmin(adminAppAccess, getAppName());
    const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
    return <SharedSidebar sections={sections} storageKey="rutba-om-sidebar-pinned" />;
}
