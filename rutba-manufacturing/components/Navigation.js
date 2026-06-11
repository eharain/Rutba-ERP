import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/work-orders",   label: "Work Orders", variant: "primary" },
    { href: "/material-lots", label: "Materials",   variant: "info" },
    { href: "/workers",       label: "Workers",     variant: "success" },
    { href: "/setup",         label: "Setup",       variant: "secondary" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="manufacturing"
            appName="Rutba Manufacturing"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-industry text-primary"></i>}
        />
    );
}
