import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, SiteSettingEndpoints } from "@rutba/api-provider/endpoints";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";
import RoleSwitcher from "@rutba/pos-shared/components/RoleSwitcher";
import NavAppSwitcher from "@rutba/pos-shared/components/NavAppSwitcher";

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
        <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3 nav-cms">
            <Link className="navbar-brand fw-semibold d-flex align-items-center gap-2" href="/">
                {siteLogo?.url ? (
                    <img
                        src={MediaUtilsEndpoints.imageBaseUrl() + siteLogo.url}
                        alt="Rutba CMS"
                        style={{ height: 30, objectFit: "contain" }}
                    />
                ) : (
                    <>
                        <i className="fa-solid fa-feather-pointed text-warning"></i>
                        <span>Rutba CMS</span>
                    </>
                )}
            </Link>
            <button
                className="navbar-toggler"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target="#mainNav"
                aria-controls="mainNav"
                aria-expanded="false"
                aria-label="Toggle navigation"
            >
                <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse" id="mainNav">
                <div className="navbar-nav ms-auto align-items-lg-center gap-lg-1">
                    <div className="nav-item dropdown">
                        <a
                            className="nav-link dropdown-toggle d-inline-flex align-items-center gap-2"
                            href="#"
                            role="button"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                        >
                            <i className="fa-solid fa-box"></i>
                            <span>Catalog</span>
                        </a>
                        <ul className="dropdown-menu dropdown-menu-lg-end">
                            <li><Link className="dropdown-item" href="/products"><i className="fa-solid fa-tag me-2 text-muted"></i>Products</Link></li>
                            <li><Link className="dropdown-item" href="/categories"><i className="fa-solid fa-folder-tree me-2 text-muted"></i>Categories</Link></li>
                            <li><Link className="dropdown-item" href="/brands"><i className="fa-solid fa-copyright me-2 text-muted"></i>Brands</Link></li>
                        </ul>
                    </div>
                    <div className="nav-item dropdown">
                        <a
                            className="nav-link dropdown-toggle d-inline-flex align-items-center gap-2"
                            href="#"
                            role="button"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                        >
                            <i className="fa-solid fa-layer-group"></i>
                            <span>Content</span>
                        </a>
                        <ul className="dropdown-menu dropdown-menu-lg-end">
                            <li><Link className="dropdown-item" href="/pages"><i className="fa-regular fa-file-lines me-2 text-muted"></i>Pages</Link></li>
                            <li><Link className="dropdown-item" href="/product-groups"><i className="fa-solid fa-object-group me-2 text-muted"></i>Product Groups</Link></li>
                            <li><hr className="dropdown-divider" /></li>
                            <li><Link className="dropdown-item" href="/brand-groups"><i className="fa-solid fa-bookmark me-2 text-muted"></i>Brand Groups</Link></li>
                            <li><Link className="dropdown-item" href="/category-groups"><i className="fa-solid fa-sitemap me-2 text-muted"></i>Category Groups</Link></li>
                            <li><hr className="dropdown-divider" /></li>
                            <li><Link className="dropdown-item" href="/footers"><i className="fa-solid fa-window-minimize me-2 text-muted"></i>Footers</Link></li>
                            <li><hr className="dropdown-divider" /></li>
                            <li><Link className="dropdown-item" href="/sale-offers"><i className="fa-solid fa-tags me-2 text-muted"></i>Sale Offers</Link></li>
                            <li><Link className="dropdown-item" href="/delivery-methods"><i className="fa-solid fa-truck me-2 text-muted"></i>Delivery Methods</Link></li>
                        </ul>
                    </div>
                    <div className="nav-item">
                        <a
                            className="nav-link d-inline-flex align-items-center gap-2"
                            href={APP_URLS['order-management']}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <i className="fa-solid fa-shopping-bag"></i>
                            <span>Orders</span>
                        </a>
                    </div>
                    <div className="nav-item">
                        <Link className="nav-link d-inline-flex align-items-center gap-2" href="/media">
                            <i className="fa-solid fa-photo-film"></i>
                            <span>Media</span>
                        </Link>
                    </div>
                    <div className="nav-item">
                        <Link className="nav-link d-inline-flex align-items-center gap-2" href="/notification-templates">
                            <i className="fa-solid fa-bell"></i>
                            <span>Notifications</span>
                        </Link>
                    </div>
                    <div className="nav-item">
                        <Link className="nav-link d-inline-flex align-items-center gap-2" href="/site-settings">
                            <i className="fa-solid fa-gear"></i>
                            <span>Settings</span>
                        </Link>
                    </li>

                    <div className="nav-item nav-divider d-none d-lg-block" aria-hidden="true"></div>

                    <NavAppSwitcher currentApp="cms" />
                    <RoleSwitcher />

                    {user ? (
                        <div className="nav-item dropdown">
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
                        <div className="nav-item">
                            <a
                                className="btn btn-warning btn-sm d-inline-flex align-items-center gap-2 ms-lg-2"
                                href={`${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(`${APP_URLS.cms}/auth/callback`)}&state=${encodeURIComponent(router.asPath || "/")}`}
                            >
                                <i className="fa-solid fa-right-to-bracket"></i>
                                <span>Login</span>
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
