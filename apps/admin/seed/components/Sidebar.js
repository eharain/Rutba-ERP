import SharedSidebar from "@rutba/shared/components/Sidebar";

const SECTIONS = [
    { href: "/", label: "Run Seeds", icon: "fa-seedling" },
    { href: "/history", label: "Run History", icon: "fa-clock-rotate-left" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="apps/admin/seed-sidebar-pinned" />;
}
