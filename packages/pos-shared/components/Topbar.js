import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { APP_URLS, APP_META } from "../lib/roles";
import RoleSwitcher from "./RoleSwitcher";
import NavAppSwitcher from "./NavAppSwitcher";

/**
 * Shared slim top bar used alongside the left Sidebar rail.
 *
 * Layout: brand on the left, an optional inline list of quick-action
 * shortcuts in the middle (`secondary`), and Apps/Role/User on the
 * right. The primary nav lives in the Sidebar.
 *
 * @param {string} currentApp - app key (e.g. 'sale', 'hr', 'cms')
 * @param {React.ReactNode} brand - optional custom brand node
 * @param {string} secondaryLabel - small uppercase label before the
 *   secondary list (e.g. "Create", "Quick"). Hidden if no items.
 * @param {Array<{href:string,label:string,icon?:string,variant?:string,external?:boolean}>} secondary
 *   - inline shortcut buttons rendered in the middle of the bar.
 *   `variant` is a Bootstrap colour suffix (success, info, warning,
 *   primary, secondary, dark) and defaults to 'light'.
 * @param {string} authCallbackPath - relative path used as the
 *   post-login callback (defaults to '/auth/callback').
 * @param {string} loginHref - override the login button target.
 * @param {boolean} showRoleSwitcher - hide the role switcher.
 */
export default function Topbar({
    currentApp,
    brand,
    appName,
    secondary,
    secondaryLabel = "Quick",
    authCallbackPath = "/auth/callback",
    loginHref,
    showRoleSwitcher = true,
}) {
    const { user } = useAuth();
    const router = useRouter();

    const meta = APP_META[currentApp] || {};
    const userLabel = user?.username || user?.email || "";
    const appOrigin = (typeof window !== "undefined" && window.location?.origin) || APP_URLS[currentApp] || "";

    const fallbackName = meta.label || (currentApp ? `Rutba ${currentApp}` : 'Rutba');
    const resolvedAppName = appName || fallbackName;

    return (
        <nav className="topbar">
            <Link className="topbar-brand" href="/">
                {brand || (
                    <i className={`${meta.icon || 'fa-solid fa-cube'} ${meta.color || 'text-warning'}`}></i>
                )}
            </Link>

            {resolvedAppName && (
                <span className="topbar-appname" title={resolvedAppName}>
                    {resolvedAppName}
                </span>
            )}

            {Array.isArray(secondary) && secondary.length > 0 && (
                <ul className="topbar-secondary">
                    {secondaryLabel && (
                        <li className="topbar-secondary-label">{secondaryLabel}</li>
                    )}
                    {secondary.map((item) => {
                        const linkProps = item.external
                            ? { href: item.href, target: "_blank", rel: "noopener noreferrer" }
                            : { href: item.href };
                        const LinkEl = item.external ? "a" : Link;
                        const variant = item.variant || "light";
                        return (
                            <li key={item.href} className="topbar-secondary-item">
                                <LinkEl
                                    {...linkProps}
                                    className={`btn btn-sm btn-outline-${variant} d-inline-flex align-items-center gap-1`}
                                >
                                    {item.icon && <i className={`fa-solid ${item.icon}`}></i>}
                                    <span>{item.label}</span>
                                </LinkEl>
                            </li>
                        );
                    })}
                </ul>
            )}

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
