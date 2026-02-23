import { useAuth } from "../context/AuthContext";
import { getCrossAppLinks, APP_META } from "../lib/roles";

/**
 * AppSwitcher
 *
 * Renders a small dropup menu (opens upward from the footer) with
 * icon links to every app the current user has access to.
 *
 * @param {string} currentApp - key of the app we're inside (e.g. 'sale')
 */
export default function AppSwitcher({ currentApp }) {
    const { appAccess } = useAuth();
    const links = getCrossAppLinks(appAccess, currentApp);

    if (links.length === 0) return null;

    const currentMeta = APP_META[currentApp] || {};

    return (
        <div className="dropup d-inline-block">
            <button
                className="btn btn-sm btn-outline-light d-flex align-items-center gap-1"
                type="button"
                data-bs-toggle="dropdown"
                data-bs-auto-close="true"
                aria-expanded="false"
                title="Switch App"
            >
                <i className={currentMeta.icon || 'fa-solid fa-th'} style={{ fontSize: '0.85rem' }}></i>
                <i className="fa-solid fa-caret-up" style={{ fontSize: '0.6rem' }}></i>
            </button>
            <ul className="dropdown-menu dropdown-menu-end mb-1" style={{ minWidth: 200 }}>
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
