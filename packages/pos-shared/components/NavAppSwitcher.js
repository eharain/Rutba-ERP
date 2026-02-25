import { useAuth } from "../context/AuthContext";
import { getCrossAppLinks, APP_META } from "../lib/roles";

/**
 * NavAppSwitcher
 *
 * Renders a small dropdown menu (opens downward from the top navbar) with
 * icon links to every app the current user has access to.
 *
 * @param {string} currentApp - key of the app we're inside (e.g. 'sale')
 */
export default function NavAppSwitcher({ currentApp }) {
    const { appAccess } = useAuth();
    const links = getCrossAppLinks(appAccess, currentApp);

    if (links.length === 0) return null;

    const currentMeta = APP_META[currentApp] || {};

    return (
        <div className="dropdown d-inline-block me-2">
            <button
                className="btn btn-sm btn-outline-light d-flex align-items-center gap-1"
                type="button"
                data-bs-toggle="dropdown"
                data-bs-auto-close="true"
                aria-expanded="false"
                title="Switch App"
            >
                <i className="fa-solid fa-th" style={{ fontSize: '0.95rem' }}></i>
            </button>
            <ul className="dropdown-menu dropdown-menu-end mt-1" style={{ minWidth: 220 }}>
                <li>
                    <span className="dropdown-item d-flex align-items-center gap-2 py-2 fw-bold disabled">
                        <i className={`${currentMeta.icon || 'fa-solid fa-cube'} ${currentMeta.color || 'text-secondary'}`} style={{ width: 20, textAlign: 'center' }}></i>
                        <span>{currentMeta.label || currentApp}</span>
                    </span>
                </li>
                <li><hr className="dropdown-divider" /></li>
                <li><span className="dropdown-header small">Switch to</span></li>
                {links.map(link => (
                    <li key={link.key}>
                        <a className="dropdown-item d-flex align-items-center gap-2 py-2" href={link.href}>
                            <i className={`${link.icon} ${link.color}`} style={{ width: 20, textAlign: 'center' }}></i>
                            <span>{link.label}</span>
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}
