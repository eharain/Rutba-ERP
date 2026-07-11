import dynamic from "next/dynamic";
import { useUtil } from "../context/UtilContext";
import { useAuth } from "../context/AuthContext";
import { useEffect, useRef, useState } from "react";
import { getCrossAppGroups } from "../lib/roles";

/**
 * FooterInfo — slim cross-app launcher.
 *
 * Renders the branch/desk location on the left and, on the right, one
 * compact menu button per app category (Sales, Inventory, People, …).
 * Clicking a category opens an upward popover listing that category's
 * apps. Only one popover is open at a time. Categories with no
 * accessible apps are omitted, so the bar stays short as the app
 * catalogue grows.
 */
function FooterInfo({ currentApp }) {
    const [location, setLocation] = useState("");
    const [openGroup, setOpenGroup] = useState(null);
    const wrapRef = useRef(null);
    const { locationString, branch, desk } = useUtil();
    const { appAccess, adminAppAccess } = useAuth();

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
    const groups = getCrossAppGroups(effectiveAccess, currentApp);

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
                <nav className="footer-info-cats" aria-label="Switch app">
                    {groups.map((group) => {
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
                                        title={app.label}
                                    >
                                        <i className={app.icon}></i>
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
                            <div key={group.key} className={`footer-cat${isOpen ? ' open' : ''}`}>
                                <button
                                    type="button"
                                    className="footer-cat-btn"
                                    aria-haspopup="true"
                                    aria-expanded={isOpen}
                                    title={group.label}
                                    onClick={() => setOpenGroup(isOpen ? null : group.key)}
                                >
                                    <i className={group.icon}></i>
                                    <span className="footer-cat-label">{group.label}</span>
                                    <span className="footer-cat-count">{group.apps.length}</span>
                                    <i className="fa-solid fa-chevron-up footer-cat-caret"></i>
                                </button>

                                {isOpen && (
                                    <div className="footer-cat-menu" role="menu">
                                        <div className="footer-cat-menu-head">{group.label}</div>
                                        {group.apps.map((app) => {
                                            const linkProps = app.external
                                                ? { target: "_blank", rel: "noopener noreferrer" }
                                                : {};
                                            return (
                                                <a
                                                    key={app.key}
                                                    {...linkProps}
                                                    href={app.href}
                                                    className="footer-cat-item"
                                                    role="menuitem"
                                                    onClick={() => setOpenGroup(null)}
                                                >
                                                    <i className={`${app.icon} ${app.color || ''} footer-cat-item-icon`}></i>
                                                    <span>{app.label}</span>
                                                    {app.external && (
                                                        <i className="fa-solid fa-arrow-up-right-from-square ms-auto footer-cat-ext"></i>
                                                    )}
                                                </a>
                                            );
                                        })}
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
