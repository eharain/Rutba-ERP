import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/contacts",   label: "Contacts",   variant: "primary" },
    { href: "/leads",      label: "Leads",      variant: "info" },
    { href: "/activities", label: "Activities", variant: "secondary" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="crm"
            appName="Rutba CRM"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-headset text-warning"></i>}
        />
    );
}
