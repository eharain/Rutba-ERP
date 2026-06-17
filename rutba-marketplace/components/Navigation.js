import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/",          label: "Dashboard", variant: "primary" },
    { href: "/accounts",  label: "Accounts",  variant: "secondary" },
    { href: "/mapping",   label: "Mapping",   variant: "dark" },
    { href: "/sync-runs", label: "Sync Runs", variant: "info" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="marketplace"
            appName="Rutba Marketplace"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-store text-warning"></i>}
        />
    );
}
