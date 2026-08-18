import Topbar from "@rutba/shared/components/Topbar";

const SECONDARY = [
    { href: "/products",       label: "Products",   icon: "fa-tag",          variant: "primary"   },
    { href: "/categories",     label: "Categories", icon: "fa-folder-tree",  variant: "info"      },
    { href: "/brands",         label: "Brands",     icon: "fa-copyright",    variant: "secondary" },
    { href: "/product-groups", label: "Groups",     icon: "fa-object-group", variant: "success"   },
    { href: "/pages",          label: "Pages",      icon: "fa-file-lines",   variant: "warning"   },
    { href: "/media",          label: "Media",      icon: "fa-photo-film",   variant: "dark"      },
];

// The site-settings logo is resolved inside Topbar now (useSiteLogo), so this
// component no longer fetches it — and no longer carries the base-url
// concatenation that broke once the media provider started storing absolute
// urls. Passing no `brand` lets Topbar fall back to the app icon on its own.
export default function Navigation() {
    return <Topbar currentApp="cms" appName="Rutba CMS" secondary={SECONDARY} />;
}
