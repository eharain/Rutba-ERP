import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/salary-structures", label: "Salary Structures", icon: "fa-money-check-dollar" },
    { href: "/employee-profiles", label: "Employee Profiles", icon: "fa-id-card" },
    { href: "/payroll-runs",      label: "Payroll Runs",      icon: "fa-play" },
    { href: "/payslips",          label: "Payslips",          icon: "fa-receipt" },
    { href: "/adjustments",       label: "Adjustments",       icon: "fa-sliders" },
    { href: "/deduction-rules",   label: "Deduction Rules",   icon: "fa-percent" },
    { href: "/remittances",       label: "Remittances",       icon: "fa-building-columns" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-payroll-sidebar-pinned" />;
}
