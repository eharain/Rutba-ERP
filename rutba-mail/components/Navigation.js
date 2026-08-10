import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/", label: "Mailboxes", variant: "primary" },
    { href: "/shared", label: "Shared Queues", variant: "info" },
    { href: "/contacts", label: "Contacts", variant: "success" },
    { href: "/settings", label: "Accounts", variant: "secondary" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="mail"
            appName="Rutba Mail"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-envelope text-info"></i>}
        />
    );
}
