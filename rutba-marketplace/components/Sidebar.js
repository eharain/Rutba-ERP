import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/",          label: "Dashboard", icon: "fa-gauge" },
    { href: "/accounts",  label: "Accounts",  icon: "fa-plug" },
    { href: "/listings",  label: "Listings",  icon: "fa-tags" },
    { href: "/pricing",   label: "Pricing",   icon: "fa-sliders" },
    { href: "/mapping",   label: "Mapping",   icon: "fa-diagram-project" },
    { href: "/sync-runs", label: "Sync Runs", icon: "fa-rotate" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-marketplace-sidebar-pinned" />;
}
