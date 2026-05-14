import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/products",            label: "Products",           icon: "fa-tag" },
    { href: "/stock-items",         label: "Stock Items",        icon: "fa-boxes-stacked" },
    { href: "/purchases",           label: "Purchases",          icon: "fa-cart-shopping" },
    { href: "/orphan-stock-items",  label: "Orphan Stock",       icon: "fa-triangle-exclamation" },
    { href: "/bulk-stock-inputs",   label: "Bulk Inputs",        icon: "fa-upload" },
    { href: "/archive-stock",       label: "Archive",            icon: "fa-box-archive" },
    {
        key: "catalog",
        label: "Catalog",
        icon: "fa-folder-tree",
        children: [
            { href: "/term-types", label: "Term Types", icon: "fa-tags" },
            { href: "/categories", label: "Categories", icon: "fa-folder-tree" },
            { href: "/brands",     label: "Brands",     icon: "fa-copyright" },
            { href: "/suppliers",  label: "Suppliers",  icon: "fa-truck-field" },
        ],
    },
    { divider: true },
    { href: "/settings", label: "Settings", icon: "fa-gear" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="pos-stock-sidebar-pinned" />;
}
