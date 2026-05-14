import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getCrossAppLinks, APP_META } from "../lib/roles";

/**
 * NavAppSwitcher
 *
 * Renders the cross-app launcher as a navbar dropdown that matches the
 * surrounding nav-link items (Catalog / Content / …). When opened it
 * shows a grid of app shortcuts under the trigger.
 *
 * @param {string} currentApp - key of the app we're inside (e.g. 'sale')
 */
export default function NavAppSwitcher({ currentApp }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const { appAccess, adminAppAccess } = useAuth();
    const effectiveAccess = [...new Set([...(appAccess || []), ...(adminAppAccess || [])])];
    const links = getCrossAppLinks(effectiveAccess, currentApp)
        .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
    const currentMeta = APP_META[currentApp] || {};

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

    return (
        <div className="nav-item dropdown nav-app-switcher" ref={wrapRef}>
            <button
                type="button"
                className={`nav-link dropdown-toggle d-inline-flex align-items-center gap-2${open ? ' show' : ''}`}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                title="Switch app"
            >
                <i className="fa-solid fa-table-cells-large"></i>
                <span className="d-none d-md-inline">Apps</span>
            </button>
            <div
                className={`dropdown-menu dropdown-menu-end nav-app-switcher-menu${open ? ' show' : ''}`}
                style={{ minWidth: 280 }}
            >
                <div className="dropdown-header d-flex align-items-center gap-2">
                    <i className={`${currentMeta.icon || 'fa-solid fa-cube'} ${currentMeta.color || 'text-secondary'}`} style={{ width: 16, textAlign: 'center' }}></i>
                    <span className="text-uppercase small fw-semibold">{currentMeta.label || currentApp || 'Current app'}</span>
                </div>
                <hr className="dropdown-divider" />
                {links.map((link) => (
                    <a
                        key={link.key}
                        className="dropdown-item d-flex align-items-center gap-2 py-2"
                        href={link.href}
                        onClick={() => setOpen(false)}
                    >
                        <i className={`${link.icon} ${link.color}`} style={{ width: 18, textAlign: 'center' }}></i>
                        <span>{link.label}</span>
                    </a>
                ))}
            </div>
        </div>
    );
}
