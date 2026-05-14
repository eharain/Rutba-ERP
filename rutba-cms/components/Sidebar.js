import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";

/**
 * Sidebar
 *
 * Left-side, icon-rail navigation that expands to show labels on hover.
 * A pin button at the top keeps the sidebar expanded (persisted in
 * localStorage as `rutba-cms-sidebar-pinned`).
 *
 * Sections with children render as a small inline disclosure when the
 * sidebar is expanded. When collapsed they show just their icon — and
 * because hover already expands the whole sidebar, no flyout is needed.
 */

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
            { href: "/pages",           label: "Pages",          icon: "fa-file-lines" },
            { href: "/product-groups",  label: "Product Groups", icon: "fa-object-group" },
            { href: "/brand-groups",    label: "Brand Groups",   icon: "fa-bookmark" },
            { href: "/category-groups", label: "Category Groups",icon: "fa-sitemap" },
            { href: "/footers",         label: "Footers",        icon: "fa-window-minimize" },
            { href: "/sale-offers",     label: "Sale Offers",    icon: "fa-tags" },
            { href: "/delivery-methods",label: "Delivery",       icon: "fa-truck" },
        ],
    },
    { href: APP_URLS['order-management'], external: true, label: "Orders", icon: "fa-shopping-bag" },
    { href: "/media",                  label: "Media",         icon: "fa-photo-film" },
    { href: "/notification-templates", label: "Notifications", icon: "fa-bell" },
    { href: "/site-settings",          label: "Settings",      icon: "fa-gear" },
];

function isActive(pathname, href) {
    if (!href || href.startsWith("http")) return false;
    return pathname === href || pathname.startsWith(href + "/");
}

function sectionActive(pathname, section) {
    if (section.href) return isActive(pathname, section.href);
    return (section.children || []).some((c) => isActive(pathname, c.href));
}

export default function Sidebar() {
    const router = useRouter();
    const pathname = router?.pathname || "";

    const [pinned, setPinned] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [openSections, setOpenSections] = useState(() => new Set());

    useEffect(() => {
        try {
            const stored = localStorage.getItem("rutba-cms-sidebar-pinned");
            if (stored === "1") setPinned(true);
        } catch (e) { /* ignore */ }
    }, []);

    const togglePin = () => {
        setPinned((v) => {
            const next = !v;
            try { localStorage.setItem("rutba-cms-sidebar-pinned", next ? "1" : "0"); } catch (e) { /* ignore */ }
            return next;
        });
    };

    useEffect(() => {
        // Auto-open the section that owns the active route so the user
        // lands with context already visible.
        const next = new Set();
        for (const s of SECTIONS) {
            if (s.children && sectionActive(pathname, s)) next.add(s.key);
        }
        setOpenSections(next);
    }, [pathname]);

    const expanded = pinned || hovered;

    const toggleSection = (key) => {
        setOpenSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    return (
        <aside
            className={`side-nav${expanded ? " is-expanded" : ""}${pinned ? " is-pinned" : ""}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div className="side-nav-header">
                <button
                    type="button"
                    className="side-nav-pin"
                    onClick={togglePin}
                    title={pinned ? "Unpin sidebar" : "Pin sidebar"}
                    aria-pressed={pinned}
                >
                    <i className={`fa-solid ${pinned ? "fa-thumbtack" : "fa-angles-right"}`}></i>
                    <span className="side-nav-label">{pinned ? "Unpin" : "Pin sidebar"}</span>
                </button>
            </div>

            <nav className="side-nav-items">
                {SECTIONS.map((section) => {
                    if (section.children) {
                        const open = openSections.has(section.key);
                        const active = sectionActive(pathname, section);
                        return (
                            <div key={section.key} className={`side-nav-group${active ? " is-active" : ""}${open ? " is-open" : ""}`}>
                                <button
                                    type="button"
                                    className="side-nav-link"
                                    onClick={() => toggleSection(section.key)}
                                    title={section.label}
                                >
                                    <i className={`fa-solid ${section.icon} side-nav-icon`}></i>
                                    <span className="side-nav-label">{section.label}</span>
                                    <i className={`fa-solid fa-chevron-${open ? "down" : "right"} side-nav-caret`}></i>
                                </button>
                                <div className="side-nav-children">
                                    {section.children.map((c) => (
                                        <Link
                                            key={c.href}
                                            href={c.href}
                                            className={`side-nav-link side-nav-child${isActive(pathname, c.href) ? " is-current" : ""}`}
                                            title={c.label}
                                        >
                                            <i className={`fa-solid ${c.icon} side-nav-icon`}></i>
                                            <span className="side-nav-label">{c.label}</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        );
                    }

                    const active = isActive(pathname, section.href);
                    const linkProps = section.external
                        ? { href: section.href, target: "_blank", rel: "noopener noreferrer" }
                        : { href: section.href };
                    const LinkEl = section.external ? "a" : Link;

                    return (
                        <LinkEl
                            key={section.href}
                            {...linkProps}
                            className={`side-nav-link${active ? " is-current" : ""}`}
                            title={section.label}
                        >
                            <i className={`fa-solid ${section.icon} side-nav-icon`}></i>
                            <span className="side-nav-label">{section.label}</span>
                            {section.external && (
                                <i className="fa-solid fa-arrow-up-right-from-square side-nav-caret"></i>
                            )}
                        </LinkEl>
                    );
                })}
            </nav>
        </aside>
    );
}
