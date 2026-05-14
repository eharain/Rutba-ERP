import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { APP_URLS, APP_META } from "../lib/roles";
import RoleSwitcher from "./RoleSwitcher";
import NavAppSwitcher from "./NavAppSwitcher";

/**
 * Shared slim top bar used alongside the left Sidebar rail.
 *
 * Holds only the brand (left) and the Apps/Role/User actions (right).
 * The primary nav lives in the Sidebar.
 *
 * @param {string} currentApp - app key (e.g. 'sale', 'hr', 'cms')
 * @param {React.ReactNode} brand - optional custom brand node; if
 *   omitted, falls back to APP_META[currentApp] (icon + label).
 * @param {string} authCallbackPath - relative path used as the
 *   post-login callback (defaults to '/auth/callback').
 */
export default function Topbar({ currentApp, brand, authCallbackPath = "/auth/callback", loginHref, showRoleSwitcher = true }) {
    const { user } = useAuth();
    const router = useRouter();

    const meta = APP_META[currentApp] || {};
    const userLabel = user?.username || user?.email || "";
    const appOrigin = (typeof window !== "undefined" && window.location?.origin) || APP_URLS[currentApp] || "";

    return (
        <nav className="topbar">
            <Link className="topbar-brand" href="/">
                {brand || (
                    <>
                        <i className={`${meta.icon || 'fa-solid fa-cube'} ${meta.color || 'text-warning'}`}></i>
                        <span>{meta.label || (currentApp ? `Rutba ${currentApp}` : 'Rutba')}</span>
                    </>
                )}
            </Link>

            <div className="topbar-actions">
                <NavAppSwitcher currentApp={currentApp} />
                {showRoleSwitcher && <RoleSwitcher />}

                {user ? (
                    <div className="nav-item dropdown topbar-user">
                        <a
                            className="nav-link dropdown-toggle d-inline-flex align-items-center gap-2"
                            href="#"
                            role="button"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                            title={userLabel}
                        >
                            <i className="fa-solid fa-circle-user"></i>
                            <span className="d-none d-md-inline text-truncate" style={{ maxWidth: 160 }}>{userLabel}</span>
                        </a>
                        <ul className="dropdown-menu dropdown-menu-end">
                            <li className="dropdown-header text-truncate" style={{ maxWidth: 240 }}>{userLabel}</li>
                            <li><hr className="dropdown-divider" /></li>
                            <li>
                                <button
                                    type="button"
                                    className="dropdown-item text-danger d-flex align-items-center gap-2"
                                    onClick={() => {
                                        try { localStorage.clear(); } catch (e) { /* ignore */ }
                                        window.location.href = APP_URLS.auth + '/logout';
                                    }}
                                >
                                    <i className="fa-solid fa-right-from-bracket"></i>
                                    <span>Log out</span>
                                </button>
                            </li>
                        </ul>
                    </div>
                ) : (
                    <a
                        className="btn btn-warning btn-sm d-inline-flex align-items-center gap-2"
                        href={loginHref || `${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(`${appOrigin}${authCallbackPath}`)}&state=${encodeURIComponent(router.asPath || "/")}`}
                    >
                        <i className="fa-solid fa-right-to-bracket"></i>
                        <span>Login</span>
                    </a>
                )}
            </div>
        </nav>
    );
}
