import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

/**
 * Shared left-side rail navigation.
 *
 * Renders an icon-rail that expands on hover to reveal labels. A pin
 * button at the top keeps the rail expanded (persisted per-app in
 * localStorage). Groups with children render as inline disclosures;
 * the group owning the active route opens automatically.
 *
 * Each section is one of:
 *   - { href, label, icon, external? }            → a single link
 *   - { key, label, icon, children: [{ href, label, icon }] } → group
 *   - { divider: true } | { heading: 'Label' }    → visual separators
 *
 * @param {Array}  sections    - section list (see above)
 * @param {string} storageKey  - localStorage key for the pin state
 *                               (defaults to `rutba-sidebar-pinned`)
 * @param {string} brand       - optional small label at the rail top
 *                               (shown only when expanded)
 */

function isActive(pathname, href) {
    if (!href || /^https?:\/\//.test(href)) return false;
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
}

function groupActive(pathname, section) {
    if (section.href) return isActive(pathname, section.href);
    return (section.children || []).some((c) => isActive(pathname, c.href));
}

export default function Sidebar({ sections = [], storageKey = "rutba-sidebar-pinned", brand }) {
    const router = useRouter();
    const pathname = router?.pathname || "";

    const [pinned, setPinned] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [openGroups, setOpenGroups] = useState(() => new Set());

    useEffect(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored === "1") setPinned(true);
        } catch (e) { /* ignore */ }
    }, [storageKey]);

    const togglePin = () => {
        setPinned((v) => {
            const next = !v;
            try { localStorage.setItem(storageKey, next ? "1" : "0"); } catch (e) { /* ignore */ }
            return next;
        });
    };

    useEffect(() => {
        const next = new Set();
        for (const s of sections) {
            if (s.children && groupActive(pathname, s)) next.add(s.key);
        }
        setOpenGroups(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    const expanded = pinned || hovered;

    const toggleGroup = (key) => {
        setOpenGroups((prev) => {
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
                    <span className="side-nav-label">{brand || (pinned ? "Unpin" : "Pin sidebar")}</span>
                </button>
            </div>

            <nav className="side-nav-items">
                {sections.map((section, idx) => {
                    if (section.divider) {
                        return <div key={`d${idx}`} className="side-nav-divider" aria-hidden="true"></div>;
                    }
                    if (section.heading) {
                        return (
                            <div key={`h${idx}`} className="side-nav-heading">
                                <span className="side-nav-label">{section.heading}</span>
                            </div>
                        );
                    }

                    if (section.children) {
                        const open = openGroups.has(section.key);
                        const active = groupActive(pathname, section);
                        return (
                            <div key={section.key} className={`side-nav-group${active ? " is-active" : ""}${open ? " is-open" : ""}`}>
                                <button
                                    type="button"
                                    className="side-nav-link"
                                    onClick={() => toggleGroup(section.key)}
                                    title={section.label}
                                >
                                    <i className={`fa-solid ${section.icon} side-nav-icon`}></i>
                                    <span className="side-nav-label">{section.label}</span>
                                    <i className={`fa-solid fa-chevron-${open ? "down" : "right"} side-nav-caret`}></i>
                                </button>
                                <div className="side-nav-children">
                                    {section.children.map((c) => {
                                        const isCurrent = isActive(pathname, c.href);
                                        const linkProps = c.external
                                            ? { href: c.href, target: "_blank", rel: "noopener noreferrer" }
                                            : { href: c.href };
                                        const LinkEl = c.external ? "a" : Link;
                                        return (
                                            <LinkEl
                                                key={c.href || c.label}
                                                {...linkProps}
                                                className={`side-nav-link side-nav-child${isCurrent ? " is-current" : ""}`}
                                                title={c.label}
                                            >
                                                <i className={`fa-solid ${c.icon || 'fa-circle'} side-nav-icon`}></i>
                                                <span className="side-nav-label">{c.label}</span>
                                            </LinkEl>
                                        );
                                    })}
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
                            key={section.href || section.label}
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
