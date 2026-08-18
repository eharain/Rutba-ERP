import Topbar from "@rutba/shared/components/Topbar";

const SECONDARY = [
    { href: "/", label: "Dashboard", variant: "primary" },
    { href: "/templates", label: "Templates", variant: "info" },
    { href: "/audiences", label: "Audiences", variant: "success" },
    { href: "/campaigns", label: "Campaigns", variant: "warning" },
    { href: "/runs", label: "Delivery", variant: "danger" },
    { href: "/settings", label: "Settings", variant: "secondary" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="campaigns"
            appName="Rutba Campaigns"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-envelope-open-text text-primary"></i>}
        />
    );
}
