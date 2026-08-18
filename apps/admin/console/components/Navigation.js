import Topbar from "@rutba/shared/components/Topbar";

const SECONDARY = [
    { href: "/users", label: "Users", variant: "primary" },
    { href: "/users/access-assignment", label: "Access", variant: "info" },
    { href: "/app-domains", label: "App Domains", variant: "secondary" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="admin"
            appName="Rutba Admin"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-sliders text-primary"></i>}
        />
    );
}
