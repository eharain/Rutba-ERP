import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getCrossAppLinks, getAppCatalogGroups, APP_META } from "../lib/roles";
import { rankByUsage, recordAppUse, recordAppVisit } from "../lib/appUsage";

/** How many apps the top-nav dropdown shows before "All apps". */
const MOST_USED_LIMIT = 6;

/**
 * NavAppSwitcher
 *
 * The top-navigation app launcher. Shows only the apps the user
 * actually uses most (frecency-ranked from the shared usage cookie —
 * see lib/appUsage.js), capped at MOST_USED_LIMIT. The complete
 * catalogue stays one click away behind the "All apps" expander, where
 * inaccessible apps are dimmed with a lock. The full directory also
 * lives permanently in the footer launcher.
 *
 * @param {string} currentApp - key of the app we're inside (e.g. 'sale')
 */
export default function NavAppSwitcher({ currentApp }) {
    const [open, setOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [usageOrder, setUsageOrder] = useState(null);
    const wrapRef = useRef(null);
    const { appAccess, adminAppAccess } = useAuth();
    const effectiveAccess = [...new Set([...(appAccess || []), ...(adminAppAccess || [])])];

    // Accessible apps, catalogue order (stable SSR fallback).
    const links = getCrossAppLinks(effectiveAccess, currentApp);
    const linksKey = links.map((l) => l.key).join(",");
    const currentMeta = APP_META[currentApp] || {};

    // Usage ranking reads a cookie, so it runs client-side only —
    // the first render keeps catalogue order to avoid a hydration
    // mismatch. Also counts this visit (throttled per tab).
    useEffect(() => {
        recordAppVisit(currentApp);
        setUsageOrder(rankByUsage(linksKey ? linksKey.split(",") : []));
    }, [linksKey, currentApp]);

    useEffect(() => {
        if (!open) return undefined;
        const onClickOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onClickOutside);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onClickOutside);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    if (links.length === 0) return null;

    const ordered = usageOrder
        ? [...links].sort((a, b) => usageOrder.indexOf(a.key) - usageOrder.indexOf(b.key))
        : links;
    const mostUsed = ordered.slice(0, MOST_USED_LIMIT);

    const catalogGroups = getAppCatalogGroups(effectiveAccess, currentApp);
    const totalApps = catalogGroups.reduce((n, g) => n + g.apps.length, 0);

    const closeMenu = () => { setOpen(false); setShowAll(false); };

    const renderLink = (link, extraClass = "") => {
        const linkProps = link.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {};
        const locked = link.allowed === false;
        return (
            <a
                key={link.key}
                {...linkProps}
                className={`dropdown-item d-flex align-items-center gap-2 py-2 ${extraClass}${locked ? ' nav-app-locked' : ''}${link.current ? ' nav-app-current' : ''}`}
                href={link.href}
                title={locked ? `${link.label} — you don't have access` : link.description || link.label}
                onClick={() => {
                    if (!locked && !link.current) recordAppUse(link.key);
                    closeMenu();
                }}
            >
                <i className={`${link.icon} ${link.color}`} style={{ width: 18, textAlign: 'center' }}></i>
                <span className="text-truncate">{link.label}</span>
                {link.current && <span className="nav-app-current-badge ms-auto">Current</span>}
                {locked && <i className="fa-solid fa-lock ms-auto small text-muted"></i>}
                {link.external && !locked && !link.current && <i className="fa-solid fa-arrow-up-right-from-square ms-auto small text-muted"></i>}
            </a>
        );
    };

    return (
        <div className="nav-item dropdown nav-app-switcher" ref={wrapRef}>
            <button
                type="button"
                className={`nav-link dropdown-toggle d-inline-flex align-items-center gap-2${open ? ' show' : ''}`}
                aria-expanded={open}
                onClick={() => { setOpen((v) => !v); setShowAll(false); }}
                title="Switch app"
            >
                <i className="fa-solid fa-table-cells-large"></i>
                <span className="d-none d-md-inline">Apps</span>
            </button>
            <div
                className={`dropdown-menu dropdown-menu-end nav-app-switcher-menu${open ? ' show' : ''}`}
                style={{ minWidth: 300 }}
            >
                <div className="dropdown-header d-flex align-items-center gap-2">
                    <i className={`${currentMeta.icon || 'fa-solid fa-cube'} ${currentMeta.color || 'text-secondary'}`} style={{ width: 16, textAlign: 'center' }}></i>
                    <span className="text-uppercase small fw-semibold">{currentMeta.label || currentApp || 'Current app'}</span>
                </div>
                <hr className="dropdown-divider" />

                {links.length > MOST_USED_LIMIT && (
                    <div className="nav-app-section-label">Most used</div>
                )}
                {mostUsed.map((link) => renderLink(link))}

                {totalApps > 0 && (
                    <>
                        <hr className="dropdown-divider" />
                        <button
                            type="button"
                            className="dropdown-item d-flex align-items-center gap-2 py-2 nav-app-all-toggle"
                            aria-expanded={showAll}
                            onClick={() => setShowAll((v) => !v)}
                        >
                            <i className="fa-solid fa-grip" style={{ width: 18, textAlign: 'center' }}></i>
                            <span>All apps</span>
                            <span className="nav-app-count ms-auto">{totalApps}</span>
                            <i className={`fa-solid fa-chevron-${showAll ? 'up' : 'down'} small text-muted`}></i>
                        </button>
                    </>
                )}

                {showAll && (
                    <div className="nav-app-all">
                        {catalogGroups.map((group) => (
                            <div key={group.key} className="nav-app-group">
                                <div className="nav-app-group-head" style={{ color: group.color }}>
                                    <i className={group.icon}></i>
                                    <span>{group.label}</span>
                                </div>
                                {group.apps.map((link) => renderLink(link, "nav-app-group-item"))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
