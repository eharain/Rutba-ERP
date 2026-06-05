import SharedSidebar from "@rutba/pos-shared/components/Sidebar";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";

const SECTIONS = [
    {
        key: "catalog",
        label: "Catalog",
        icon: "fa-box",
        children: [
            { href: "/products",   label: "Products",   icon: "fa-tag" },
            { href: "/categories", label: "Categories", icon: "fa-folder-tree" },
            { href: "/brands",     label: "Brands",     icon: "fa-copyright" },
        ],
    },
    {
        key: "content",
        label: "Content",
        icon: "fa-layer-group",
        children: [
            { href: "/pages",            label: "Pages",          icon: "fa-file-lines" },
            { href: "/product-groups",   label: "Product Groups", icon: "fa-object-group" },
            { href: "/brand-groups",     label: "Brand Groups",   icon: "fa-bookmark" },
            { href: "/category-groups",  label: "Category Groups",icon: "fa-sitemap" },
            { href: "/cms-page-groups",  label: "Page Groups",    icon: "fa-clone" },
            { href: "/cms-menus",        label: "Menus",          icon: "fa-bars" },
            { href: "/footers",          label: "Footers",        icon: "fa-window-minimize" },
            { href: "/sale-offers",      label: "Sale Offers",    icon: "fa-tags" },
            { href: "/delivery-methods", label: "Delivery",       icon: "fa-truck" },
        ],
    },
    {
        key: "seo",
        label: "SEO",
        icon: "fa-magnifying-glass",
        children: [
            { href: "/seo-metas",    label: "SEO Meta",     icon: "fa-tag" },
        ],
    },
    { divider: true },
    { href: APP_URLS['order-management'], external: true, label: "Orders", icon: "fa-shopping-bag" },
    { href: "/media",                  label: "Media",         icon: "fa-photo-film" },
    { href: "/notification-templates", label: "Notifications", icon: "fa-bell" },
    { href: "/site-settings",          label: "Settings",      icon: "fa-gear" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-cms-sidebar-pinned" />;
}
