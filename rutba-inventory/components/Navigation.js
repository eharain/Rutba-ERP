import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/", label: "Dashboard", variant: "primary" },
    { href: "/warehouses", label: "Warehouses", variant: "info" },
    { href: "/stock-levels", label: "Stock", variant: "success" },
    { href: "/transfers", label: "Transfers", variant: "success" },
    { href: "/adjustments", label: "Adjustments", variant: "warning" },
    { href: "/reorder", label: "Reorder", variant: "danger" },
    { href: "/counts", label: "Counts", variant: "secondary" },
    { href: "/batches", label: "Batches", variant: "info" },
    { href: "/expiry", label: "Expiry", variant: "danger" },
    { href: "/valuation", label: "Valuation", variant: "warning" },
    { href: "/maintenance", label: "Maintenance", variant: "secondary" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="inventory"
            appName="Rutba Inventory"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-warehouse text-primary"></i>}
        />
    );
}
