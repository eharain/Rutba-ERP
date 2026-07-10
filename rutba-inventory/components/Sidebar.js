import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

// Feature sections land here as the Inventory epics ship (warehouses, stock by
// location, transfers, adjustments, counts, reordering). For now the app has a
// single Dashboard route — the backend Foundation (warehouses / storage-locations
// / stock-levels / stock-batches) is live and reachable via the API.
const SECTIONS = [
    { href: "/", label: "Dashboard", icon: "fa-gauge" },
    { href: "/warehouses", label: "Warehouses & Locations", icon: "fa-warehouse" },
    { href: "/stock-levels", label: "Stock by Location", icon: "fa-layer-group" },
    { href: "/transfers", label: "Transfers", icon: "fa-right-left" },
    { href: "/adjustments", label: "Adjustments", icon: "fa-sliders" },
    { href: "/reorder", label: "Reorder", icon: "fa-cart-arrow-down" },
    { href: "/counts", label: "Cycle Counts", icon: "fa-clipboard-check" },
    { href: "/batches", label: "Batches / Lots", icon: "fa-boxes-packing" },
    { href: "/expiry", label: "Expiry", icon: "fa-hourglass-half" },
    { href: "/valuation", label: "Valuation", icon: "fa-coins" },
    { href: "/maintenance", label: "Maintenance", icon: "fa-screwdriver-wrench" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-inventory-sidebar-pinned" />;
}
