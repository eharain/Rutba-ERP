import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/salary-structures", label: "Structures",   variant: "primary" },
    { href: "/payroll-runs",      label: "Payroll Runs", variant: "info" },
    { href: "/payslips",          label: "Payslips",     variant: "success" },
    { href: "/deduction-rules",   label: "Deductions",   variant: "warning" },
    { href: "/remittances",       label: "Remittances",  variant: "dark" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="payroll"
            appName="Rutba Payroll"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-money-bill-trend-up text-warning"></i>}
        />
    );
}
