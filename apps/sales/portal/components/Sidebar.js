import SharedSidebar from "@rutba/shared/components/Sidebar";

const SECTIONS = [
    { href: "/sale-orders", label: "My Orders", icon: "fa-shopping-bag" },
    { href: "/returns",     label: "Returns",   icon: "fa-rotate-left" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="apps/content/storefrontuser-sidebar-pinned" />;
}
