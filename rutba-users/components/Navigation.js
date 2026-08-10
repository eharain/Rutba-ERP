import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/users", label: "Users", variant: "primary" },
    { href: "/users/access-assignment", label: "Access", variant: "info" },
    { href: "/app-domains", label: "App Domains", variant: "secondary" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="users"
            appName="User Management"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-users-gear text-primary"></i>}
        />
    );
}
