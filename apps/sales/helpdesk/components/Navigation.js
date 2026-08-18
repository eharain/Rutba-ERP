import Topbar from "@rutba/shared/components/Topbar";

const SECONDARY = [
    { href: "/tickets", label: "Tickets", variant: "primary" },
    { href: "/desks",   label: "Desks",   variant: "info" },
    { href: "/routing", label: "Routing", variant: "secondary" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="helpdesk"
            appName="Rutba Helpdesk"
            secondary={SECONDARY}
            // APP_META gives helpdesk the same fa-headset as CRM; a life-ring
            // keeps the two apps distinguishable in the topbar at a glance.
            brand={<i className="fa-solid fa-life-ring text-info"></i>}
        />
    );
}
