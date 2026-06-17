import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/leave",     label: "My Leave",  variant: "primary" },
    { href: "/payslips",  label: "Payslips",  variant: "success" },
    { href: "/approvals", label: "Approvals", variant: "warning" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="ess"
            appName="Rutba ESS"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-user-clock text-primary"></i>}
        />
    );
}
