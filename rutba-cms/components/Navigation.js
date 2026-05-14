import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, SiteSettingEndpoints } from "@rutba/api-provider/endpoints";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";
import RoleSwitcher from "@rutba/pos-shared/components/RoleSwitcher";
import NavAppSwitcher from "@rutba/pos-shared/components/NavAppSwitcher";

/**
 * CMS top bar — slim. The left-side Sidebar carries the primary
 * navigation; this bar holds the brand, the app/role switchers, and
 * the user menu.
 */
export default function Navigation() {
    const { user, jwt } = useAuth();
    const router = useRouter();
    const [siteLogo, setSiteLogo] = useState(null);

    useEffect(() => {
        if (!jwt) return;
        SiteSettingEndpoints.fetchDraft({ populate: ["site_logo"] })
            .then(res => {
                const logo = (res.data || res)?.site_logo;
                if (logo?.url) setSiteLogo(logo);
            })
            .catch(() => {});
    }, [jwt]);

    const userLabel = user?.username || user?.email || "";

    return (
        <nav className="topbar">
            <Link className="topbar-brand" href="/">
                {siteLogo?.url ? (
                    <img
                        src={MediaUtilsEndpoints.imageBaseUrl() + siteLogo.url}
                        alt="Rutba CMS"
                        style={{ height: 28, objectFit: "contain" }}
                    />
                ) : (
                    <>
                        <i className="fa-solid fa-feather-pointed text-warning"></i>
                        <span>Rutba CMS</span>
                    </>
                )}
            </Link>

            <div className="topbar-actions">
                <NavAppSwitcher currentApp="cms" />
                <RoleSwitcher />

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
                                        localStorage.clear();
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
                        href={`${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(`${APP_URLS.cms}/auth/callback`)}&state=${encodeURIComponent(router.asPath || "/")}`}
                    >
                        <i className="fa-solid fa-right-to-bracket"></i>
                        <span>Login</span>
                    </a>
                )}
            </div>
        </nav>
    );
}
