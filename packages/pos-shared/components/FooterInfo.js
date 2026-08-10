import dynamic from "next/dynamic";
import { useUtil } from "../context/UtilContext";
import { useAuth } from "../context/AuthContext";
import { useEffect, useRef, useState } from "react";
import { getAppCatalogGroups, getCrossAppGroups } from "../lib/roles";
import { recordAppUse } from "../lib/appUsage";

/**
 * FooterInfo — slim cross-app launcher and application directory.
 *
 * Renders the branch/desk location on the left and, on the right, one
 * compact menu button per app category (Sales, Inventory, People, …).
 * Clicking a category opens an upward popover listing that category's
 * apps with a one-line description each.
 *
 * Signed-in users see EVERY configured app — the footer is the complete
 * application directory. Apps the user can't access are dimmed with a
 * lock; the app we're currently inside is highlighted. Guests only see
 * public apps (the storefront).
 */
function FooterInfo({ currentApp }) {
    const [location, setLocation] = useState("");
    const [openGroup, setOpenGroup] = useState(null);
    const wrapRef = useRef(null);
    const { locationString, branch, desk } = useUtil();
    const { user, appAccess, adminAppAccess } = useAuth();

    useEffect(() => {
        setLocation(locationString());
    }, [branch, desk]);

    // Close the open popover on outside-click or Escape.
    useEffect(() => {
        if (!openGroup) return undefined;
        const onClickOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpenGroup(null);
        };
        const onKeyDown = (e) => { if (e.key === "Escape") setOpenGroup(null); };
        document.addEventListener("mousedown", onClickOutside);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onClickOutside);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [openGroup]);

    const effectiveAccess = [...new Set([...(appAccess || []), ...(adminAppAccess || [])])];
    // Signed-in users get the full catalogue (locked apps included);
    // guests only see what they can actually open.
    const groups = user
        ? getAppCatalogGroups(effectiveAccess, currentApp)
        : getCrossAppGroups(effectiveAccess, currentApp);

    const renderAppLink = (app, color, className, onNavigate) => {
        const linkProps = app.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {};
        const stateClass = [
            className,
            app.allowed === false ? "locked" : "",
            app.current ? "current" : "",
        ].filter(Boolean).join(" ");
        return (
            <a
                key={app.key}
                {...linkProps}
                href={app.href}
                className={stateClass}
                role="menuitem"
                title={app.allowed === false ? `${app.label} — you don't have access` : app.description || app.label}
                onClick={() => {
                    if (app.allowed !== false && !app.current) recordAppUse(app.key);
                    if (onNavigate) onNavigate();
                }}
            >
                <i className={`${app.icon} footer-cat-item-icon`} style={{ color }}></i>
                <span className="footer-cat-item-text">
                    <span className="footer-cat-item-label">
                        {app.label}
                        {app.current && <span className="footer-cat-current-badge">You are here</span>}
                    </span>
                    {app.description && (
                        <span className="footer-cat-item-desc">{app.description}</span>
                    )}
                </span>
                {app.allowed === false && (
                    <i className="fa-solid fa-lock footer-cat-lock" aria-label="No access"></i>
                )}
                {app.external && app.allowed !== false && (
                    <i className="fa-solid fa-arrow-up-right-from-square ms-auto footer-cat-ext"></i>
                )}
            </a>
        );
    };

    return (
        <footer className="footer-info" ref={wrapRef}>
            <span className="footer-info-location">
                {location || (
                    <span>
                        <i className="fa-solid fa-location-dot me-1"></i>
                        No branch/desk selected — set in <a href='/settings' className="text-warning">Settings</a>
                    </span>
                )}
            </span>

            {groups.length > 0 && (
                <nav className="footer-info-cats" aria-label="Applications">
                    {groups.map((group) => {
                        const color = group.color || '#64748b';
                        const containsCurrent = group.apps.some((a) => a.current);

                        // A group with a single accessible app doesn't need a
                        // popover — link straight to the app.
                        if (group.apps.length === 1) {
                            const app = group.apps[0];
                            const linkProps = app.external
                                ? { target: "_blank", rel: "noopener noreferrer" }
                                : {};
                            return (
                                <div key={group.key} className="footer-cat">
                                    <a
                                        {...linkProps}
                                        href={app.href}
                                        className="footer-cat-btn footer-cat-solo"
                                        title={app.description || app.label}
                                        style={{ backgroundColor: `${color}26` }}
                                        onClick={() => {
                                            if (app.allowed !== false && !app.current) recordAppUse(app.key);
                                        }}
                                    >
                                        <i className={app.icon} style={{ color }}></i>
                                        <span className="footer-cat-label">{app.label}</span>
                                        {app.external && (
                                            <i className="fa-solid fa-arrow-up-right-from-square footer-cat-caret"></i>
                                        )}
                                    </a>
                                </div>
                            );
                        }

                        const isOpen = openGroup === group.key;
                        return (
                            <div key={group.key} className={`footer-cat${isOpen ? ' open' : ''}${containsCurrent ? ' here' : ''}`}>
                                <button
                                    type="button"
                                    className="footer-cat-btn"
                                    aria-haspopup="true"
                                    aria-expanded={isOpen}
                                    title={group.label}
                                    onClick={() => setOpenGroup(isOpen ? null : group.key)}
                                    style={{ backgroundColor: isOpen ? `${color}40` : `${color}26` }}
                                >
                                    <i className={group.icon} style={{ color }}></i>
                                    <span className="footer-cat-label">{group.label}</span>
                                    <span className="footer-cat-count" style={{ backgroundColor: color, color: '#fff' }}>{group.apps.length}</span>
                                    {containsCurrent && <span className="footer-cat-here-dot" style={{ backgroundColor: color }}></span>}
                                    <i className="fa-solid fa-chevron-up footer-cat-caret"></i>
                                </button>

                                {isOpen && (
                                    <div className="footer-cat-menu" role="menu" style={{ borderTop: `3px solid ${color}` }}>
                                        <div className="footer-cat-menu-head" style={{ color }}>{group.label}</div>
                                        {group.apps.map((app) =>
                                            renderAppLink(app, color, "footer-cat-item", () => setOpenGroup(null))
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>
            )}
        </footer>
    );
}

export default dynamic(() => Promise.resolve(FooterInfo), { ssr: false });
