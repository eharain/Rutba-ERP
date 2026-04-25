import { useAuth } from "../context/AuthContext";
import { getCrossAppLinks, APP_META } from "../lib/roles";
import { useEffect, useState } from "react";

/**
 * NavAppSwitcher
 *
 * Renders a small dropdown menu (opens downward from the top navbar) with
 * icon links to every app the current user has access to.
 *
 * @param {string} currentApp - key of the app we're inside (e.g. 'sale')
 */
export default function NavAppSwitcher({ currentApp }) {
    const [open, setOpen] = useState(false);
    const { appAccess, adminAppAccess } = useAuth();
    const effectiveAccess = [...new Set([...(appAccess || []), ...(adminAppAccess || [])])];
    const links = getCrossAppLinks(effectiveAccess, currentApp)
        .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
    const currentMeta = APP_META[currentApp] || {};

    useEffect(() => {
        if (!open || links.length === 0) return;
        const onKeyDown = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, links.length]);

    if (links.length === 0) return null;

    return (
        <div className="d-inline-block ms-2 order-last">
            <button
                className="btn btn-sm btn-outline-light d-flex align-items-center gap-1"
                type="button"
                onClick={() => setOpen(true)}
                title="Switch App"
            >
                <i className="fa-solid fa-th" style={{ fontSize: '0.95rem' }}></i>
            </button>
            {open && (
                <>
                    <div
                        onClick={() => setOpen(false)}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(0,0,0,0.35)",
                            zIndex: 1080,
                        }}
                    />
                    <div
                        style={{
                            position: "fixed",
                            top: 0,
                            right: 0,
                            width: 320,
                            maxWidth: "92vw",
                            height: "100vh",
                            background: "#fff",
                            boxShadow: "-8px 0 24px rgba(0,0,0,0.2)",
                            zIndex: 1090,
                            overflowY: "auto",
                        }}
                    >
                        <div className="d-flex align-items-center justify-content-between border-bottom px-3 py-2">
                            <h6 className="mb-0 d-flex align-items-center gap-2 text-dark">
                                <i className={`${currentMeta.icon || 'fa-solid fa-cube'} ${currentMeta.color || 'text-secondary'}`} style={{ width: 20, textAlign: 'center' }}></i>
                                <span className="text-dark">{currentMeta.label || currentApp}</span>
                            </h6>
                            <button type="button" className="btn-close" aria-label="Close" onClick={() => setOpen(false)} />
                        </div>
                        <div className="p-2">
                            <div className="small text-muted text-uppercase fw-semibold px-2 mb-2">Switch to</div>
                            {links.map(link => (
                                <a
                                    key={link.key}
                                    className="list-group-item list-group-item-action border-0 rounded d-flex align-items-center gap-2 py-2 text-dark"
                                    href={link.href}
                                    onClick={() => setOpen(false)}
                                >
                                    <i className={`${link.icon} ${link.color}`} style={{ width: 20, textAlign: 'center' }}></i>
                                    <span className="text-dark">{link.label}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
