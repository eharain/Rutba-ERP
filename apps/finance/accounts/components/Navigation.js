import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/chart-of-accounts", label: "Accounts", variant: "primary" },
    { href: "/journal-entries",   label: "Journal",  variant: "info" },
    { href: "/invoices",          label: "Invoices", variant: "success" },
    { href: "/expenses",          label: "Expenses", variant: "warning" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="accounts"
            appName="Rutba Accounts"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-calculator text-warning"></i>}
        />
    );
}
