import Link from "next/link";
import { useRouter } from "next/router";

const QUICK_LINKS = [
    { href: "/products",       label: "Products",   icon: "fa-tag" },
    { href: "/categories",     label: "Categories", icon: "fa-folder-tree" },
    { href: "/brands",         label: "Brands",     icon: "fa-copyright" },
    { href: "/product-groups", label: "Groups",     icon: "fa-object-group" },
    { href: "/pages",          label: "Pages",      icon: "fa-file-lines" },
    { href: "/media",          label: "Media",      icon: "fa-photo-film" },
];

export default function NavigationSecondary() {
    const router = useRouter();
    const pathname = router?.pathname || "";

    return (
        <nav className="nav-secondary">
            <div className="nav-secondary-label">
                <i className="fa-solid fa-bolt"></i>
                <span>Quick access</span>
            </div>
            <ul className="nav-secondary-items">
                {QUICK_LINKS.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                        <li key={item.href}>
                            <Link
                                className={`nav-secondary-link${active ? " is-active" : ""}`}
                                href={item.href}
                            >
                                <i className={`fa-solid ${item.icon}`}></i>
                                <span>{item.label}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
