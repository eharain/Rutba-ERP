import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/", label: "Run Seeds", variant: "primary" },
    { href: "/history", label: "History", variant: "info" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="seed"
            appName="Rutba Seed"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-seedling text-success"></i>}
        />
    );
}
