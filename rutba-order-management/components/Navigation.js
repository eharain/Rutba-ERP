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
                    "Order Management"
                )}
            </Link>
            <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
                <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse" id="mainNav">
                <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                    <li className="nav-item">
                        <Link className="nav-link" href="/sale-orders"><i className="fas fa-shopping-bag me-1"></i>Customer Orders</Link>
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
                    </ul>

                <div className="d-flex align-items-center">
                    <NavAppSwitcher currentApp="order-management" />
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
                            href={`${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(`${APP_URLS['order-management']}/auth/callback`)}&state=${encodeURIComponent(router.asPath || "/")}`}
                        >
                            Login
                        </a>
                    )}
                </div>
            </div>
        </nav>
    );
}
