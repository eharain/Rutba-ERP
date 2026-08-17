import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/", label: "Run Seeds", icon: "fa-seedling" },
    { href: "/history", label: "Run History", icon: "fa-clock-rotate-left" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-seed-sidebar-pinned" />;
}
