import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/salary-structures", label: "Salary Structures", icon: "fa-money-check-dollar" },
    { href: "/payroll-runs",      label: "Payroll Runs",      icon: "fa-play" },
    { href: "/payslips",          label: "Payslips",          icon: "fa-receipt" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-payroll-sidebar-pinned" />;
}
