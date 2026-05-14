import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/salary-structures", label: "Structures",   variant: "primary" },
    { href: "/payroll-runs",      label: "Payroll Runs", variant: "info" },
    { href: "/payslips",          label: "Payslips",     variant: "success" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="payroll"
            secondary={SECONDARY}
            brand={<>
                <i className="fa-solid fa-money-bill-trend-up text-warning"></i>
                <span>Rutba Payroll</span>
            </>}
        />
    );
}
