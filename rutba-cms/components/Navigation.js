import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, IMAGE_URL } from "@rutba/pos-shared/lib/api";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";
import AdminModeToggle from "@rutba/pos-shared/components/AdminModeToggle";
import NavAppSwitcher from "@rutba/pos-shared/components/NavAppSwitcher";

export default function Navigation() {
    const { user, jwt, appAccess } = useAuth();
    const router = useRouter();
    const [siteLogo, setSiteLogo] = useState(null);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/site-setting", { status: "draft", populate: ["site_logo"] })
            .then(res => {
                const logo = (res.data || res)?.site_logo;
                if (logo?.url) setSiteLogo(logo);
            })
            .catch(() => {});
    }, [jwt]);

    return (
        <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3 text-white">
            <Link className="navbar-brand fw-bold d-flex align-items-center" href="/">
                {siteLogo?.url ? (
                    <img src={IMAGE_URL + siteLogo.url} alt="Rutba CMS" style={{ height: 32, objectFit: "contain" }} />
                ) : (
                    "Rutba CMS"
                )}
            </Link>
            <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
                <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse" id="mainNav">
                <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                    <li className="nav-item dropdown">
                        <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i className="fas fa-box me-1"></i>Catalog
                        </a>
                        <ul className="dropdown-menu">
                            <li><Link className="dropdown-item" href="/products">Products</Link></li>
                            <li><Link className="dropdown-item" href="/categories">Categories</Link></li>
                            <li><Link className="dropdown-item" href="/brands">Brands</Link></li>
                        </ul>
                    </li>
                    <li className="nav-item dropdown">
                        <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i className="fas fa-layer-group me-1"></i>Content
                        </a>
                        <ul className="dropdown-menu">
                            <li><Link className="dropdown-item" href="/pages">Pages</Link></li>
                            <li><Link className="dropdown-item" href="/product-groups">Product Groups</Link></li>
                            <li><hr className="dropdown-divider" /></li>
                            <li><Link className="dropdown-item" href="/brand-groups">Brand Groups</Link></li>
                            <li><Link className="dropdown-item" href="/category-groups">Category Groups</Link></li>
                            <li><hr className="dropdown-divider" /></li>
                            <li><Link className="dropdown-item" href="/footers">Footers</Link></li>
                            <li><hr className="dropdown-divider" /></li>
                            <li><Link className="dropdown-item" href="/offers"><i className="fas fa-tags me-1"></i>Offers</Link></li>
                        </ul>
                    </li>
                    <li className="nav-item">
                        <Link className="nav-link" href="/orders"><i className="fas fa-shopping-bag me-1"></i>Orders</Link>
                    </li>
                    <li className="nav-item dropdown">
                        <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i className="fas fa-truck me-1"></i>Delivery Ops
                        </a>
                        <ul className="dropdown-menu">
                            <li><Link className="dropdown-item" href="/riders">Riders</Link></li>
                            <li><Link className="dropdown-item" href="/delivery-methods">Delivery Methods</Link></li>
                            <li><Link className="dropdown-item" href="/delivery-zones">Delivery Zones</Link></li>
                            <li><Link className="dropdown-item" href="/notification-templates">Notification Templates</Link></li>
                        </ul>
                    </li>
                    <li className="nav-item">
                        <Link className="nav-link" href="/media"><i className="fas fa-photo-video me-1"></i>Media</Link>
                    </li>
                    <li className="nav-item">
                        <Link className="nav-link" href="/site-settings"><i className="fas fa-cog me-1"></i>Settings</Link>
                    </li>
                    </ul>

                <div className="d-flex align-items-center">
                    <NavAppSwitcher currentApp="cms" />
                    <AdminModeToggle />
                    {user ? (
                        <>
                            <span className="me-3">Hello, {user.username || user.email}</span>
                            <button className="btn btn-outline-light btn-sm" onClick={() => {
                                localStorage.clear();
                                window.location.href = APP_URLS.auth + '/logout';
                            }}>Logout</button>
                        </>
                    ) : (
                        <a
                            className="btn btn-outline-light btn-sm"
                            href={`${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(`${APP_URLS.cms}/auth/callback`)}&state=${encodeURIComponent(router.asPath || "/")}`}
                        >
                            Login
                        </a>
                    )}
                </div>
            </div>
        </nav>
    );
}
